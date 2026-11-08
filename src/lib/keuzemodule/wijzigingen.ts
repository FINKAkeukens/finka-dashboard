// Zet de keuzes van de klant om in een lijst wijzigingen en vragen. Gedeeld
// door het portaal ("Wijzigingen"-tabblad) en het dashboard (feedback-
// overzicht met codes voor Winner Flex), zodat beide precies hetzelfde tonen.

import { GROEPEN, KEUKEN_RIJEN, UITVOERINGEN, splitLadeCode, type Uitvoering } from './klantlaag'
import type { KastKeuze, Keuzes, Pakket, PakketExtra, PakketKast, Wijziging } from './types'

// Houtuitvoering van een extra: de keuze van de klant, anders die van het
// ontwerp, als het artikel daarin bestaat; anders de eerste (eiken naturel).
export function uitvoeringVan(e: PakketExtra, x: KastKeuze, ontwerp: Uitvoering | null = null): Uitvoering | null {
  if (!e.uitvoeringen?.length) return null
  const wens = x.uitvoering ?? ontwerp
  return wens && e.uitvoeringen.includes(wens) ? wens : e.uitvoeringen[0]
}

export function kastGewijzigd(k: PakketKast, keuzes: Keuzes): boolean {
  const x = keuzes.kasten?.[k.id] ?? {}
  const voorstel = k.indelingen.find((i) => i.voorstel)?.key
  const indeling = !!x.indeling && x.indeling !== voorstel
  const extras = k.extras.some((e) => x.extras?.[e.key] && !e.inOntwerp)
  return indeling || extras || !!x.push
}

export function kastStatus(k: PakketKast, keuzes: Keuzes): 'akkoord' | 'wijzig' | 'vraag' | null {
  const x = keuzes.kasten?.[k.id]
  if (x?.status) return x.status
  return kastGewijzigd(k, keuzes) ? 'wijzig' : null
}

export function berekenWijzigingen(pakket: Pakket, keuzes: Keuzes): Wijziging[] {
  const out: Wijziging[] = []

  for (const k of pakket.kasten) {
    const x = keuzes.kasten?.[k.id] ?? {}
    const delen: string[] = []
    const codes: string[] = []
    const codesWeg: string[] = []
    let som = 0
    let prijsVolgt = false
    const voorstel = k.indelingen.find((i) => i.voorstel)
    const gekozen = x.indeling ? k.indelingen.find((i) => i.key === x.indeling) : null
    if (gekozen && voorstel && gekozen.key !== voorstel.key) {
      delen.push(`${voorstel.label} → ${gekozen.label}`)
      som += gekozen.prijs ?? 0
      if (gekozen.prijs === null) prijsVolgt = true
      const lade = splitLadeCode(k.code)
      if (lade) {
        codes.push(lade.basis + (gekozen.key === 'DEUR' ? '' : gekozen.key))
        codesWeg.push(k.code)
      }
    }
    for (const e of k.extras) {
      if (!x.extras?.[e.key] || e.inOntwerp) continue
      const u = uitvoeringVan(e, x, k.uitvoering)
      // Bij een één-keuzegroep (bestekindeling) vervangt de keuze wat al in
      // het ontwerp zit: alleen het verschil telt.
      const vervangt = GROEPEN.find((g) => g.key === e.groep)?.keuze === 'een'
        ? k.extras.find((o) => o.groep === e.groep && o.inOntwerp)
        : undefined
      delen.push(e.label + (u ? ` (${UITVOERINGEN.find((v) => v.key === u)!.label.toLowerCase()})` : '') + (vervangt ? ` in plaats van ${vervangt.label.toLowerCase()}` : ''))
      if (e.code) codes.push(e.code.replace('{u}', u ?? ''))
      if (vervangt?.code) codesWeg.push(vervangt.code.replace('{u}', k.uitvoering ?? vervangt.uitvoeringen?.[0] ?? ''))
      if (e.prijs === null) prijsVolgt = true
      else som += e.prijs - (vervangt?.prijs ?? 0)
    }
    if (x.push) {
      delen.push('Push-to-open')
      prijsVolgt = true
    }
    const titel = `${k.naam} · pos. ${k.positie}`
    if (delen.length) {
      out.push({
        tag: `Kast ${k.positie}`,
        titel,
        tekst: delen.join(' · ') + (x.note ? ` — "${x.note}"` : ''),
        bedrag: som || null,
        prijsVolgt,
        soort: 'wijziging',
        codes,
        codesWeg,
        positie: k.positie,
        kast: k.naam,
        codeInOntwerp: k.code,
      })
    } else if (x.status === 'vraag' || x.status === 'wijzig' || x.note) {
      const zonder = x.status === 'wijzig' ? 'Wil iets aan deze kast veranderen, zonder toelichting' : 'Vraag zonder toelichting'
      out.push({ tag: `Kast ${k.positie}`, titel, tekst: x.note ? `"${x.note}"` : zonder, bedrag: null, prijsVolgt: false, soort: 'vraag', codes: [], positie: k.positie, kast: k.naam, codeInOntwerp: k.code })
    }
  }

  const keuken = keuzes.keuken ?? {}
  const c = pakket.keuken.corpus
  if (keuken.corpus && keuken.corpus !== c.voorstel) {
    const van = c.opties.find((o) => o.code === c.voorstel)
    const naar = c.opties.find((o) => o.code === keuken.corpus)
    out.push({
      tag: 'Keuken', titel: 'Kleur binnenkant',
      tekst: `${van?.naam ?? c.voorstel ?? '—'} → ${naar?.naam ?? keuken.corpus} (${keuken.corpus})`,
      bedrag: null, prijsVolgt: false, soort: 'wijziging', codes: [keuken.corpus],
    })
  }
  const g = keuken.greep
  const gv = pakket.keuken.greep
  if (g && !(g.kind === 'greep' && g.code === gv.voorstel)) {
    const van = gv.opties.find((o) => o.code === gv.voorstel)
    const vanTekst = van ? `${van.code} ${van.naam}` : gv.voorstel ?? '—'
    if (g.kind === 'greep' && g.code) {
      const naar = gv.opties.find((o) => o.code === g.code)
      out.push({
        tag: 'Keuken', titel: 'Grepen',
        tekst: `${vanTekst} → ${g.code} ${naar?.naam ?? ''}`.trim(),
        bedrag: naar?.prijs || null, prijsVolgt: false, soort: 'wijziging', codes: [g.code],
      })
    } else {
      out.push({
        tag: 'Keuken', titel: 'Grepen',
        tekst: `${vanTekst} → ${g.kind === 'lijst' ? 'greeploos met greeplijst' : 'push-to-open, zonder grepen'}`,
        bedrag: null, prijsVolgt: true, soort: 'wijziging', codes: [],
      })
    }
  }
  for (const r of KEUKEN_RIJEN) {
    if (keuken.rijen?.[r.key] === 'bespreken') {
      out.push({ tag: 'Keuken', titel: r.label, tekst: 'Graag bespreken', bedrag: null, prijsVolgt: false, soort: 'vraag', codes: [] })
    }
  }

  for (const e of pakket.wand) {
    if (!keuzes.wand?.[e.key]) continue
    out.push({ tag: 'Extra', titel: e.label, tekst: e.sub, bedrag: e.prijs, prijsVolgt: e.prijs === null, soort: 'wijziging', codes: e.code ? [e.code] : [] })
  }

  const wb = keuzes.werkblad
  if (wb?.status === 'bespreken' || wb?.opmerking?.trim()) {
    out.push({
      tag: 'Werkblad', titel: pakket.werkblad.voorstel ?? 'Werkblad',
      tekst: wb.opmerking?.trim() ? `"${wb.opmerking.trim()}"` : 'Wil het werkblad graag bespreken',
      bedrag: null, prijsVolgt: false, soort: 'vraag', codes: [],
    })
  }

  for (const k of pakket.kasten) {
    if (k.soort !== 'apparaat') continue
    const a = keuzes.apparatuur?.[k.id]
    if (a?.choice === 'alt') {
      out.push({
        tag: 'Apparaat', titel: k.apparaat ?? k.naam,
        tekst: `Alternatief gewenst: ${a.alt === 'luxe' ? 'luxer' : a.alt === 'instap' ? 'eenvoudiger' : 'nog niet gekozen'}`,
        bedrag: null, prijsVolgt: true, soort: 'wijziging', codes: [],
      })
    }
    if (a?.choice === 'eigen') {
      const merkType = `${a.merk ?? ''} ${a.type ?? ''}`.trim()
      out.push({
        tag: 'Apparaat', titel: k.apparaat ?? k.naam,
        tekst: `Eigen apparaat: ${merkType || 'merk en type nog invullen'}`,
        bedrag: null, prijsVolgt: false, soort: 'vraag', codes: [],
      })
    }
  }

  // Prijzen uit: geen bedragen en geen "prijs volgt".
  return pakket.prijzen ? out : out.map((w) => ({ ...w, bedrag: null, prijsVolgt: false }))
}

export function totaalVan(wijzigingen: Wijziging[]): { totaal: number; open: number } {
  return {
    totaal: wijzigingen.reduce((s, w) => s + (w.bedrag ?? 0), 0),
    open: wijzigingen.filter((w) => w.prijsVolgt).length,
  }
}

// Prijzen uit: bouwPakket haalt alle bedragen er al op de server uit, zodat
// ze ook niet in de paginabron of het netwerkverkeer van de klant staan.
export function zonderPrijzen(p: Pakket): Pakket {
  const extra = (e: PakketExtra): PakketExtra => ({ ...e, prijs: null })
  return {
    ...p,
    prijzen: false,
    kasten: p.kasten.map((k) => ({ ...k, indelingen: k.indelingen.map((i) => ({ ...i, prijs: null })), extras: k.extras.map(extra) })),
    keuken: { ...p.keuken, greep: { ...p.keuken.greep, opties: p.keuken.greep.opties.map((g) => ({ ...g, prijs: null })) } },
    wand: p.wand.map(extra),
  }
}
