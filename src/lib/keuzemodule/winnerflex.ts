// Leest een Winner Flex-uitdraai (offerte/order als PDF) uit tot de kasten
// en het voorstel voor de keuzemodule. Geen AI nodig: de uitdraai is gewone
// tekst met vaste kolommen (Pos. / Code / Aantal / Omschrijving) en een kop
// met "label : waarde"-regels (model, corpuskleur, greep, …).
//
// Werkt op dezelfde PdfPage-structuur als de cataloguslezer (tekst met
// posities); de browser haalt die op met pdf.js.

import type { PdfPage, PdfText } from '../catalogus/parse'
import {
  type KastSoort,
  type Uitvoering,
  extrasVoor,
  apparaatLabel,
  breedteVanCode,
  kastNaam,
  kastOmschrijving,
  soortVanCode,
} from './klantlaag'

export interface WinnerPositie {
  positie: string
  code: string
  aantal: string
  regels: string[]
}

export interface WinnerKast {
  positie: string
  code: string
  soort: KastSoort
  breedte: number | null
  naam: string
  omschrijving: string
  inbegrepen: string[]
  // Houtuitvoering van de inzetten die al in het ontwerp zitten (…-6ES → ES).
  uitvoering: Uitvoering | null
  // Bij apparaatkasten: wat voor apparaat erin komt.
  apparaat: string | null
}

export interface WinnerVoorstel {
  model: string | null
  modelcode: string | null
  front: string | null
  frontkleur: string | null
  corpus: string | null
  greep: string | null
  greep_aantal: number | null
  lades: string | null
  plint: string | null
}

export interface WinnerUitdraai {
  kop: Record<string, string>
  voorstel: WinnerVoorstel
  posities: WinnerPositie[]
  kasten: WinnerKast[]
  // Pagina met het bovenaanzicht (1-based), of null.
  bovenaanzicht: number | null
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

function kopRegels(pages: PdfPage[]): Record<string, string> {
  const kop: Record<string, string> = {}
  for (const page of pages) {
    const dubbelepunten = page.texts.filter((t) => t.s.trim().startsWith(':'))
    for (const dp of dubbelepunten) {
      const label = page.texts
        .filter((t) => Math.abs(t.y - dp.y) <= 2 && t.x < dp.x - 4)
        .sort((a, b) => a.x - b.x)
        .map((t) => t.s)
        .join(' ')
      const waarde = [dp.s.replace(/^:\s*/, ''), ...page.texts.filter((t) => Math.abs(t.y - dp.y) <= 2 && t.x > dp.x).sort((a, b) => a.x - b.x).map((t) => t.s)].join(' ')
      const l = norm(label)
      if (l && !(l in kop)) kop[l] = norm(waarde)
    }
  }
  return kop
}

function zoek(kop: Record<string, string>, ...labels: RegExp[]): string | null {
  for (const re of labels) {
    const k = Object.keys(kop).find((x) => re.test(x))
    if (k && kop[k]) return kop[k]
  }
  return null
}

function leesPosities(pages: PdfPage[]): WinnerPositie[] {
  const out: WinnerPositie[] = []
  let kolommen: { pos: number; code: number; aantal: number; omschr: number } | null = null
  for (const page of pages) {
    const posKop = page.texts.find((t) => t.s.trim() === 'Pos.')
    const codeKop = page.texts.find((t) => t.s.trim() === 'Code')
    const aantalKop = page.texts.find((t) => t.s.trim() === 'Aantal')
    const omschrKop = page.texts.find((t) => t.s.trim() === 'Omschrijving')
    if (posKop && codeKop && omschrKop) {
      kolommen = { pos: posKop.x, code: codeKop.x, aantal: aantalKop?.x ?? codeKop.x + 90, omschr: omschrKop.x }
    }
    if (!kolommen) continue
    const k = kolommen
    const voet = page.texts.find((t) => /^Commissie:|^Totaalprijs/i.test(t.s.trim()))
    const eindY = voet ? voet.y - 2 : page.h
    // Een pagina kan doorlopen van de vorige tabel (bovenaan) en daaronder een
    // nieuwe tabel beginnen ("Accessoires"); alleen de kopregel zelf overslaan.
    const kopY = posKop?.y
    const inTabel = (t: PdfText) => t.y < eindY && (kopY === undefined || Math.abs(t.y - kopY) > 3)
    const starts = page.texts
      .filter((t) => inTabel(t) && Math.abs(t.x - k.pos) < 6 && /^\d+(\.\d+)?$/.test(t.s.trim()))
      .sort((a, b) => a.y - b.y)
    starts.forEach((start, i) => {
      const volgende = starts[i + 1]?.y ?? eindY
      const opRegel = page.texts.filter((t) => Math.abs(t.y - start.y) <= 2.5)
      const code = opRegel.find((t) => Math.abs(t.x - k.code) < 12)
      const aantal = opRegel.find((t) => Math.abs(t.x - k.aantal) < 12)
      const regels = page.texts
        .filter((t) => t.x >= k.omschr - 6 && t.y >= start.y - 2.5 && t.y < volgende - 2.5)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((t) => norm(t.s))
      if (!code) return
      out.push({ positie: start.s.trim(), code: norm(code.s), aantal: aantal ? norm(aantal.s) : '', regels })
    })
  }
  return out
}

export function parseWinnerFlex(pages: PdfPage[]): WinnerUitdraai {
  const kop = kopRegels(pages)
  const posities = leesPosities(pages)

  const meubel = zoek(kop, /^furniture SK/i, /^meubel/i, /^frontserie/i) ?? ''
  const m = meubel.match(/^(\w+)\s+([A-Za-zÄÖÜäöü-]+)/)
  const greep = zoek(kop, /^handle combination/i, /^greep/i, /^handgreep/i)
  const greepCode = greep?.match(/^([GK]\d{3})/)?.[1] ?? null
  const greepPositie = greepCode ? posities.find((p) => p.code === greepCode) : null
  const voorstel: WinnerVoorstel = {
    modelcode: m?.[1] ?? null,
    model: m?.[2]?.toUpperCase() ?? null,
    front: meubel ? meubel.replace(/^\w+\s+/, '') : null,
    frontkleur: zoek(kop, /^front colou?r/i, /^frontkleur/i),
    corpus: zoek(kop, /^carcase colou?r outside/i, /^corpuskleur/i)?.match(/^(K\d+)/)?.[1] ?? null,
    greep: greepCode,
    greep_aantal: greepPositie ? Math.round(Number(greepPositie.aantal.replace(/[^\d,]/g, '').replace(',', '.'))) || null : null,
    lades: zoek(kop, /^Type pull-out/i, /^uittreksysteem/i),
    plint: zoek(kop, /^Plinth Height/i, /^Plinthoogte/i),
  }

  // Subposities (14.1, 14.2) horen bij hoofdpositie 14: herken welke extra's
  // al in het ontwerp zitten.
  const subsPer = new Map<string, WinnerPositie[]>()
  for (const p of posities) {
    const [hoofd, sub] = p.positie.split('.')
    if (sub) subsPer.set(hoofd, [...(subsPer.get(hoofd) ?? []), p])
  }

  const kasten: WinnerKast[] = []
  for (const p of posities) {
    if (p.positie.includes('.')) continue
    const soort = soortVanCode(p.code)
    if (soort === 'overig') continue
    const breedte = breedteVanCode(p.code)
    const extras = extrasVoor(p.code, soort)
    const inbegrepen = [...new Set(
      (subsPer.get(p.positie) ?? []).flatMap((s) => extras.filter((e) => e.herken?.test(s.code)).map((e) => e.key))
    )]
    kasten.push({
      positie: p.positie,
      code: p.code,
      soort,
      breedte,
      naam: kastNaam(p.code, soort, breedte),
      omschrijving: kastOmschrijving(p.code, soort, [...p.regels.slice(1), ...(subsPer.get(p.positie) ?? []).flatMap((s) => s.regels)]),
      inbegrepen,
      uitvoering: (subsPer.get(p.positie) ?? [])
        .map((s) => s.code.match(/-\d?(EN|ES|QG)$/)?.[1] as Uitvoering | undefined)
        .find((u) => !!u) ?? null,
      apparaat: soort === 'apparaat' ? apparaatLabel(p.code, p.regels) : null,
    })
  }

  const bovenaanzicht = pages.find((pg) => pg.texts.some((t) => /^Bovenaanzicht/i.test(t.s.trim())))?.n ?? null

  return { kop, voorstel, posities, kasten, bovenaanzicht }
}
