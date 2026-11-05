// Zet de keuzes van de klant om in een lijst wijzigingen en vragen. Gedeeld
// door het portaal ("Wijzigingen"-tabblad) en het dashboard (feedback-
// overzicht met codes voor Winner Flex), zodat beide precies hetzelfde tonen.

import { KEUKEN_RIJEN, splitLadeCode } from './klantlaag'
import type { Keuzes, Pakket, PakketKast, Wijziging } from './types'

export function kastGewijzigd(k: PakketKast, keuzes: Keuzes): boolean {
  const x = keuzes.kasten?.[k.id] ?? {}
  const voorstel = k.indelingen.find((i) => i.voorstel)?.key
  const indeling = !!x.indeling && x.indeling !== voorstel
  const extras = Object.values(x.extras ?? {}).some(Boolean)
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
    let som = 0
    let prijsVolgt = false
    const voorstel = k.indelingen.find((i) => i.voorstel)
    const gekozen = x.indeling ? k.indelingen.find((i) => i.key === x.indeling) : null
    if (gekozen && voorstel && gekozen.key !== voorstel.key) {
      delen.push(`${voorstel.label} → ${gekozen.label}`)
      som += gekozen.prijs ?? 0
      if (gekozen.prijs === null) prijsVolgt = true
      const lade = splitLadeCode(k.code)
      if (lade) codes.push(lade.basis + (gekozen.key === 'DEUR' ? '' : gekozen.key))
    }
    for (const e of k.extras) {
      if (!x.extras?.[e.key]) continue
      delen.push(e.label)
      if (e.prijs === null) prijsVolgt = true
      else som += e.prijs
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
      })
    } else if (x.status === 'vraag' || x.note) {
      out.push({ tag: `Kast ${k.positie}`, titel, tekst: x.note ? `"${x.note}"` : 'Vraag zonder toelichting', bedrag: null, prijsVolgt: false, soort: 'vraag', codes: [] })
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
    out.push({ tag: 'Extra', titel: e.label, tekst: e.sub, bedrag: e.prijs, prijsVolgt: e.prijs === null, soort: 'wijziging', codes: [] })
  }

  const wb = keuzes.werkblad
  if (wb?.mode === 'zelf') {
    let tekst: string
    const codes: string[] = []
    if (wb.mat === 'laminaat' || wb.mat === 'compact') {
      const d = pakket.werkblad.decors.find((x) => x.code === wb.code && x.compact === (wb.mat === 'compact'))
      tekst = `${wb.mat === 'compact' ? 'Compact laminaat' : 'Laminaat'}, ${d ? `${d.naam} (${d.code})` : 'kleur nog niet gekozen'}${wb.dikte ? `, ${wb.dikte} mm` : ''}`
      if (d) codes.push(d.code)
    } else {
      const mat = wb.mat ? wb.mat.charAt(0).toUpperCase() + wb.mat.slice(1) : 'Materiaal nog niet gekozen'
      tekst = `${mat}${wb.richting ? `, richting: ${wb.richting.toLowerCase()}` : ''} · stalen bekijken in de showroom`
    }
    out.push({ tag: 'Werkblad', titel: 'Eigen keuze werkblad', tekst, bedrag: null, prijsVolgt: true, soort: 'wijziging', codes })
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

  return out
}

export function totaalVan(wijzigingen: Wijziging[]): { totaal: number; open: number } {
  return {
    totaal: wijzigingen.reduce((s, w) => s + (w.bedrag ?? 0), 0),
    open: wijzigingen.filter((w) => w.prijsVolgt).length,
  }
}
