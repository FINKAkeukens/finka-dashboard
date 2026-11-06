import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'
import { klantPrijs } from './prijzen'
import {
  extrasVoor,
  VARIANTEN,
  WAND_EXTRAS,
  codeVoorBreedte,
  metBreedte,
  splitLadeCode,
  type ExtraDef,
  type KastSoort,
  type Uitvoering,
} from './klantlaag'
import type { Pakket, PakketExtra, PakketGreep, PakketKast, PakketWerkblad } from './types'
import type { Plattegrond, Vak } from './plattegrond'

// Stelt per project samen wat het portaal mag tonen. Draait alleen op de
// server (service-role): de catalogus en de brutoprijzen blijven hier, de
// klant krijgt uitsluitend de opties voor de eigen keuken met een
// klantprijs. Een handvol gerichte queries op (catalogus_id, soort, code),
// dus ook met een catalogus van duizenden regels snel.

type Service = ReturnType<typeof createServiceClient>

export interface KeuzemoduleInstelling {
  project_id: string
  bron_url: string | null
  bron_naam: string | null
  model: string | null
  prijsgroep: number | null
  voorstel: {
    front?: string | null
    frontkleur?: string | null
    corpus?: string | null
    greep?: string | null
    greep_aantal?: number | null
    lades?: string | null
    plint?: string | null
    wangen?: string | null
    werkblad?: { code?: string | null; dikte?: number | null; tekst?: string | null } | null
  }
  plattegrond: Plattegrond | null
  ronde: number
}

export interface KeuzemoduleKast {
  id: string
  project_id: string
  positie: string
  code: string
  omschrijving: string | null
  soort: KastSoort
  breedte: number | null
  wand: string | null
  vak: Vak | null
  inbegrepen: string[]
  data: { naam?: string; apparaat?: string; apparaat_voorstel?: string; uitvoering?: Uitvoering }
  zichtbaar: boolean
  volgorde: number
}

interface CatItem {
  soort: string
  code: string
  naam: string | null
  prijzen: number | number[] | null
  data: Record<string, unknown>
  afbeelding_url: string | null
}

const HOUT = /eiken|eik |noten|evoke|hout/i

function greepKleur(naam: string): PakketGreep['kleur'] {
  const n = naam.toLowerCase()
  if (/eiken|noten|hout/.test(n)) return 'hout'
  if (/brons|messing|goud|bruin/.test(n)) return 'brons'
  if (/zwart|antraciet/.test(n)) return 'zwart'
  if (/wit|porcelein/.test(n)) return 'wit'
  return 'rvs'
}

function werkbladGroep(naam: string): PakketWerkblad['groep'] {
  const n = naam.toLowerCase()
  if (/eiken|noten|evoke|halifax/.test(n)) return 'hout'
  if (/marmor|marmer|travertin/.test(n)) return 'marmer'
  return 'steen'
}

export async function laadKeuzemodule(service: Service, projectId: string) {
  const [{ data: instelling }, { data: kasten }] = await Promise.all([
    service.from('finka_keuzemodule').select('*').eq('project_id', projectId).maybeSingle(),
    service.from('finka_keuzemodule_kasten').select('*').eq('project_id', projectId).order('volgorde', { ascending: true }),
  ])
  return {
    instelling: instelling as KeuzemoduleInstelling | null,
    kasten: (kasten ?? []) as KeuzemoduleKast[],
  }
}

export async function bouwPakket(service: Service, projectId: string): Promise<Pakket | null> {
  const { instelling, kasten: alleKasten } = await laadKeuzemodule(service, projectId)
  if (!instelling) return null
  const kasten = alleKasten.filter((k) => k.zichtbaar && k.soort !== 'overig')

  const { data: catalogus } = await service.from('finka_catalogi').select('id').eq('actief', true).maybeSingle()
  if (!catalogus) return null
  const catId = catalogus.id as string

  const pg = instelling.prijsgroep
  // Welke kast- en accessoirecodes hebben we nodig?
  const kastCodes = new Set<string>()
  for (const k of kasten) {
    const lade = k.soort === 'lade' ? splitLadeCode(k.code) : null
    if (lade) for (const v of VARIANTEN) kastCodes.add(lade.basis + v.key)
  }
  const extraPatronen = (defs: ExtraDef[], breedte: number | null) =>
    defs.flatMap((d) => (d.codes ?? []).map((c) => codeVoorBreedte(c, breedte, d.uitvoeringen?.[0])).filter((c): c is string => !!c))
  const accCodes = new Set<string>([
    ...kasten.flatMap((k) => extraPatronen(extrasVoor(k.code, k.soort), k.breedte)),
    ...extraPatronen(WAND_EXTRAS, null),
  ])

  const sel = 'soort, code, naam, prijzen, data, afbeelding_url'
  const [{ data: decors }, { data: kastItems }, { data: accItems }] = await Promise.all([
    service.from('finka_catalogus_items').select(sel).eq('catalogus_id', catId).in('soort', ['corpus', 'werkblad', 'greep']),
    kastCodes.size
      ? service.from('finka_catalogus_items').select(sel).eq('catalogus_id', catId).eq('soort', 'kast').in('code', [...kastCodes])
      : Promise.resolve({ data: [] as CatItem[] }),
    accCodes.size
      ? service.from('finka_catalogus_items').select(sel).eq('catalogus_id', catId).eq('soort', 'accessoire').in('code', [...accCodes])
      : Promise.resolve({ data: [] as CatItem[] }),
  ])
  const items = (decors ?? []) as CatItem[]
  const kastPrijs = new Map(((kastItems ?? []) as CatItem[]).map((i) => [i.code, i.prijzen as number[]]))
  const accPrijs = new Map(((accItems ?? []) as CatItem[]).map((i) => [i.code, i.prijzen as number]))

  const extraVan = (d: ExtraDef, breedte: number | null): PakketExtra | null => {
    if (d.vanaf && (!breedte || breedte < d.vanaf)) return null
    const basis = { key: d.key, groep: d.groep, label: d.label, sub: d.sub, uitvoeringen: d.uitvoeringen ?? null }
    if (d.codes === null) return { ...basis, prijs: null, code: null }
    for (const c of d.codes) {
      // Alle houtuitvoeringen kosten hetzelfde; prijs opzoeken via de eerste.
      const code = codeVoorBreedte(c, breedte, d.uitvoeringen?.[0])
      const p = code ? accPrijs.get(code) : undefined
      if (typeof p === 'number') return { ...basis, prijs: klantPrijs(p), code: metBreedte(c, breedte) }
    }
    // Niet leverbaar in deze breedte: niet aanbieden.
    return null
  }

  const pakketKasten: PakketKast[] = kasten.map((k) => {
    const defs = extrasVoor(k.code, k.soort)
    const extras = defs.map((d) => extraVan(d, k.breedte)).filter((e): e is PakketExtra => !!e)
    const lade = k.soort === 'lade' ? splitLadeCode(k.code) : null
    let indelingen: PakketKast['indelingen'] = []
    if (lade && pg) {
      const basisPrijs = kastPrijs.get(k.code)?.[pg - 1]
      if (typeof basisPrijs === 'number') {
        indelingen = VARIANTEN.flatMap((v) => {
          const p = kastPrijs.get(lade.basis + v.key)?.[pg - 1]
          if (typeof p !== 'number') return []
          const voorstel = v.key === lade.variant
          return [{ key: v.key || 'DEUR', label: v.label, parts: v.parts, prijs: voorstel ? 0 : klantPrijs(p - basisPrijs), voorstel }]
        })
      }
    }
    return {
      id: k.id,
      positie: k.positie,
      code: k.code,
      naam: k.data?.naam ?? k.code,
      omschrijving: k.omschrijving ?? '',
      soort: k.soort,
      wand: k.wand,
      vak: k.vak,
      indelingen,
      extras: extras.map((e) => (k.inbegrepen.includes(e.key) ? { ...e, inOntwerp: true } : e)),
      inbegrepen: defs.filter((d) => k.inbegrepen.includes(d.key)).map((d) => ({ key: d.key, label: d.label })),
      apparaat: k.data?.apparaat ?? null,
      apparaatVoorstel: k.data?.apparaat_voorstel ?? null,
      uitvoering: k.data?.uitvoering ?? null,
    }
  })

  const v = instelling.voorstel ?? {}
  const corpusOpties = items
    .filter((i) => i.soort === 'corpus')
    .map((i) => ({ code: i.code, naam: i.naam ?? i.code, img: i.afbeelding_url, hout: HOUT.test(i.naam ?? '') }))
  const greepAantal = Math.max(1, v.greep_aantal ?? 1)
  const greepItems = items.filter((i) => i.soort === 'greep')
  const voorstelMeer = (greepItems.find((g) => g.code === v.greep)?.prijzen as number | undefined) ?? 0
  const greepOpties: PakketGreep[] = greepItems.map((g) => ({
    code: g.code,
    naam: g.naam ?? g.code,
    img: g.afbeelding_url,
    soort: (g.data.soort as PakketGreep['soort']) ?? 'greep',
    kleur: greepKleur(g.naam ?? ''),
    lengte: (g.data.lengte as number | null) ?? null,
    prijs: klantPrijs((((g.prijzen as number) ?? 0) - voorstelMeer) * greepAantal),
  }))
  const decorsWerkblad: PakketWerkblad[] = items
    .filter((i) => i.soort === 'werkblad' && ((i.data.diktes as number[] | undefined)?.length ?? 0) > 0)
    .map((i) => ({
      code: i.code,
      naam: i.naam ?? i.code,
      img: i.afbeelding_url,
      compact: !!i.data.compact,
      diktes: (i.data.diktes as number[]) ?? [],
      groep: werkbladGroep(i.naam ?? ''),
    }))
  const wbVoorstel = v.werkblad?.code ? decorsWerkblad.find((d) => d.code === v.werkblad?.code) : null

  return {
    ronde: instelling.ronde,
    plattegrond: instelling.plattegrond,
    kasten: pakketKasten,
    keuken: {
      front: v.front ?? null,
      frontkleur: v.frontkleur ?? null,
      lades: v.lades ?? null,
      plint: v.plint ?? null,
      wangen: v.wangen ?? null,
      corpus: { voorstel: v.corpus ?? null, opties: corpusOpties },
      greep: { voorstel: v.greep ?? null, aantal: greepAantal, opties: greepOpties },
    },
    werkblad: {
      voorstel: wbVoorstel ? { ...wbVoorstel, dikte: v.werkblad?.dikte ?? null } : null,
      voorstelTekst: v.werkblad?.tekst ?? null,
      decors: decorsWerkblad,
    },
    wand: WAND_EXTRAS.map((d) => extraVan(d, null)).filter((e): e is PakketExtra => !!e),
  }
}
