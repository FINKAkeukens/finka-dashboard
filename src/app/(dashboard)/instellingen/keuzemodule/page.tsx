export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { klantPrijs } from '@/lib/keuzemodule/prijzen'
import {
  ALGEMENE_OPTIES,
  GROEPEN,
  STANDAARD_UIT,
  WAND_EXTRAS,
  codeVoorBreedte,
  kastOptieOverzicht,
  optieAan,
  type ExtraDef,
} from '@/lib/keuzemodule/klantlaag'
import OptieLijst, { type OptieRij } from './OptieLijst'

// Alle opties van de keuzemodule op een rij, met per optie of het artikel in
// de actieve catalogus staat (en in welke breedtes, tegen welke klantprijs).
// FINKA zet hier opties aan of uit voor alle projecten.

const BREEDTES = [30, 40, 45, 50, 60, 80, 90, 100, 120]

function controle(defs: ExtraDef[], prijs: Map<string, number>): OptieRij['controle'] {
  const codes = defs.flatMap((d) => d.codes ?? [])
  if (!codes.length) return { soort: 'los', tekst: 'Geen catalogusartikel' }
  const gevonden: { b: number | null; p: number }[] = []
  for (const d of defs) {
    for (const c of d.codes ?? []) {
      const breedtes = c.includes('{b}') ? BREEDTES : [null]
      for (const b of breedtes) {
        if (d.vanaf && b !== null && b < d.vanaf) continue
        const code = codeVoorBreedte(c, b, d.uitvoeringen?.[0])
        const p = code ? prijs.get(code) : undefined
        if (typeof p === 'number' && !gevonden.some((g) => g.b === b)) gevonden.push({ b, p: klantPrijs(p) })
      }
    }
  }
  if (!gevonden.length) return { soort: 'geen', tekst: 'Niet gevonden in de catalogus' }
  const prijzen = gevonden.map((g) => g.p)
  const min = Math.min(...prijzen)
  const max = Math.max(...prijzen)
  const bedrag = min === max ? `€${min}` : `€${min}–€${max}`
  const b = gevonden.map((g) => g.b).filter((x): x is number => x !== null).sort((x, y) => x - y)
  return { soort: 'ok', tekst: b.length ? `${b.length === 1 ? `${b[0]} cm` : `${b[0]}–${b[b.length - 1]} cm (${b.length} breedtes)`} · ${bedrag}` : bedrag }
}

export default async function KeuzemoduleOptiesPage() {
  const supabase = await createClient()
  const [{ data: catalogus }, { data: keuzes, error }] = await Promise.all([
    supabase.from('finka_catalogi').select('id, titel').eq('actief', true).maybeSingle(),
    supabase.from('finka_keuzemodule_opties').select('sleutel, aan'),
  ])
  const { data: acc } = catalogus
    ? await supabase.from('finka_catalogus_items').select('code, prijzen').eq('catalogus_id', catalogus.id).eq('soort', 'accessoire').range(0, 4999)
    : { data: [] }
  const prijs = new Map((acc ?? []).map((a) => [a.code as string, a.prijzen as number]))
  const opgeslagen = Object.fromEntries((keuzes ?? []).map((k) => [k.sleutel as string, k.aan as boolean]))

  const rij = (sleutel: string, sectie: string, groep: string, label: string, sub: string, kasten: string[], defs: ExtraDef[] | null): OptieRij => ({
    sleutel, sectie, groep, label, sub, kasten,
    codes: [...new Set((defs ?? []).flatMap((d) => d.codes ?? []))],
    controle: defs ? (catalogus ? controle(defs, prijs) : { soort: 'geen', tekst: 'Nog geen catalogus ingelezen' }) : { soort: 'los', tekst: 'Keuze in het portaal' },
    aan: optieAan(sleutel, opgeslagen),
    standaardUit: STANDAARD_UIT.has(sleutel),
  })

  const rijen: OptieRij[] = [
    ...ALGEMENE_OPTIES.map((o) => rij(`algemeen:${o.key}`, 'Algemene keuzes', '', o.label, o.sub, [], null)),
    ...GROEPEN.flatMap((g) =>
      kastOptieOverzicht()
        .filter((o) => o.defs[0].groep === g.key)
        .map((o) => rij(`kast:${o.key}`, 'Toebehoren per kast', g.label, o.defs[0].label, o.defs[0].sub, o.kasten, o.defs))
    ),
    ...WAND_EXTRAS.map((d) => rij(`wand:${d.key}`, "Extra's aan de wand en verlichting", '', d.label, d.sub, [], [d])),
  ]

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Keuzemodule-opties</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Alles wat de klant in de keuzemodule kan kiezen. Zet een optie uit en hij verdwijnt bij alle projecten uit het
          portaal (wat al in een ontwerp zit, blijft zichtbaar als &quot;in je ontwerp&quot;). De controle laat zien of het
          artikel in de actieve catalogus staat{catalogus ? ` (${catalogus.titel})` : ''}, in welke breedtes, en de
          klantprijs incl. btw.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
          Kon de instellingen niet laden ({error.message}). Is migratie-sectie 102 al uitgevoerd in Supabase?
        </p>
      ) : (
        <OptieLijst rijen={rijen} />
      )}
    </div>
  )
}
