// Leest de Sachsenküchen-catalogus (SK130, het dealer-verkoophandboek als
// PDF) uit tot de keuzelijsten van de keuzemodule in het klantportaal.
//
// Puur: werkt op tekst- en afbeeldingsposities per pagina (zie PdfPage),
// zonder pdf.js zelf — de browser haalt die posities op (extract.ts) en kan
// zo ook in Node getest worden. Hoofdstukken worden gevonden via de
// inhoudsopgave (bladwijzers) van de PDF, niet via vaste paginanummers: de
// catalogus verschijnt jaarlijks en de paginering schuift dan op.
//
// Prijzen zijn brutopunten (1 punt = €1) zoals in de catalogus; de omrekening
// naar een klantprijs gebeurt pas bij het tonen (keuzemodule-prijzen.ts).

export interface PdfText {
  s: string
  x: number
  // Basislijn, van boven gemeten (viewport-coördinaten).
  y: number
  w: number
  h: number
}

export interface PdfBox {
  x: number
  y: number
  w: number
  h: number
}

export interface PdfPage {
  n: number
  w: number
  h: number
  texts: PdfText[]
  images: PdfBox[]
}

export interface OutlineEntry {
  depth: number
  title: string
  page: number | null
}

// Verwijzing naar een staalafbeelding in de PDF: de browser knipt die uit en
// uploadt hem, de server bewaart daarna alleen de URL.
export interface ImageRef {
  page: number
  box: PdfBox
}

export interface CatalogusDecor {
  code: string
  naam: string
  img: ImageRef | null
}

export interface CatalogusWerkblad extends CatalogusDecor {
  decorgroep: number | null
  // Massief compact laminaat (12 mm, kern in een eigen kleur).
  compact: boolean
  diktes: number[]
}

export type GreepSoort = 'knop' | 'greep' | 'lang'

export interface CatalogusGreep extends CatalogusDecor {
  soort: GreepSoort
  boorafstand: number | null
  lengte: number | null
  // Meerprijs per greep in punten (kolom "meerprijs toebehoor prijs").
  meerprijs: number
}

export interface CatalogusModel {
  naam: string
  // null = Woodline zonder vaste prijsgroep ("*" in het overzicht).
  pg: number | null
}

export interface CatalogusKast {
  code: string
  // Prijs per prijsgroep 1 t/m 8.
  prijzen: number[]
}

export interface CatalogusAccessoire {
  code: string
  naam: string
  prijs: number
}

export interface Catalogus {
  titel: string | null
  corpus: CatalogusDecor[]
  werkbladen: CatalogusWerkblad[]
  grepen: CatalogusGreep[]
  modellen: CatalogusModel[]
  kasten: CatalogusKast[]
  accessoires: CatalogusAccessoire[]
  waarschuwingen: string[]
}

// ---------- hulpfuncties ----------

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

interface Row {
  y: number
  items: PdfText[]
}

// Teksten met (bijna) dezelfde basislijn vormen één regel, links naar rechts.
export function rows(texts: PdfText[], tolerance = 2.5): Row[] {
  const sorted = texts.filter((t) => t.s.trim()).slice().sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Row[] = []
  for (const t of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(t.y - last.y) <= tolerance) last.items.push(t)
    else out.push({ y: t.y, items: [t] })
  }
  for (const r of out) r.items.sort((a, b) => a.x - b.x)
  return out
}

// pdf.js plakt soms een reeks getallen in één tekststuk ("924 1019 1133");
// splits die weer op, met een geschatte x per stukje.
function tokens(items: PdfText[]): PdfText[] {
  const out: PdfText[] = []
  for (const t of items) {
    const parts = t.s.trim().split(/\s+/)
    if (parts.length === 1) { out.push({ ...t, s: parts[0] }); continue }
    const step = t.w / parts.length
    parts.forEach((p, i) => out.push({ ...t, s: p, x: t.x + i * step, w: step }))
  }
  return out
}

const isInt = (s: string) => /^\d{1,5}$/.test(s)

// Alle teksten op dezelfde hoogte als een ankertekst (bv. een code). Robuuster
// dan rows() als stukken van één tabelregel net iets verschoven staan.
function lineOf(texts: PdfText[], anchor: PdfText, tolerance = 3): PdfText[] {
  return texts.filter((t) => Math.abs(t.y - anchor.y) <= tolerance).sort((a, b) => a.x - b.x)
}

// Pagina's van een hoofdstuk: vanaf de bladwijzer tot de volgende bladwijzer
// op hetzelfde of een hoger niveau.
export function sectionPages(outline: OutlineEntry[], title: RegExp, pageCount: number): number[] {
  // Bij meerdere treffers (bv. "Toebehoor" als hoofdstuk én als subkopje)
  // telt de bovenste in de hiërarchie.
  let i = -1
  outline.forEach((o, k) => {
    if (title.test(o.title) && o.page && (i === -1 || o.depth < outline[i].depth)) i = k
  })
  if (i === -1) return []
  const start = outline[i].page!
  let end = pageCount
  for (let j = i + 1; j < outline.length; j++) {
    if (outline[j].depth <= outline[i].depth && outline[j].page && outline[j].page! > start) {
      end = outline[j].page! - 1
      break
    }
  }
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, k) => start + k)
}

// Dichtstbijzijnde afbeelding die boven het label staat en dezelfde kolom
// deelt (stalen in een raster met de code eronder).
function imageAbove(page: PdfPage, label: PdfText): ImageRef | null {
  let best: PdfBox | null = null
  for (const img of page.images) {
    const bottom = img.y + img.h
    if (bottom > label.y || label.y - bottom > 40) continue
    if (label.x < img.x - 3 || label.x > img.x + img.w) continue
    if (!best || bottom > best.y + best.h) best = img
  }
  return best ? { page: page.n, box: best } : null
}

// Afbeelding links van een regel (grepen: foto in de eerste kolom).
function imageLeftOf(page: PdfPage, label: PdfText): ImageRef | null {
  let best: PdfBox | null = null
  let bestDist = Infinity
  for (const img of page.images) {
    if (img.x + img.w > label.x) continue
    const mid = img.y + img.h / 2
    const dist = Math.abs(mid - (label.y - label.h / 2))
    if (dist < 30 && dist < bestDist) { best = img; bestDist = dist }
  }
  return best ? { page: page.n, box: best } : null
}

// ---------- corpus ----------

function parseCorpus(pages: PdfPage[]): CatalogusDecor[] {
  const out: CatalogusDecor[] = []
  for (const page of pages) {
    // Tabelpagina's (omgevingskleuren) hebben ook K-codes, maar geen stalen met naam.
    if (page.texts.some((t) => /omgevingskleuren/i.test(t.s))) continue
    for (const t of page.texts) {
      const code = t.s.trim()
      if (!/^K\d{1,3}$/.test(code)) continue
      // Naam staat direct onder de code, links uitgelijnd (2027), of rechts
      // naast de code, soms doorlopend op de regel eronder (2026).
      const onder = page.texts.find((n) => Math.abs(n.x - t.x) < 2 && n.y > t.y && n.y - t.y < 14 && n.s.trim())
      const naast = page.texts.find((n) => Math.abs(n.y - t.y) < 2 && n.x > t.x + t.w - 2 && n.x - (t.x + t.w) < 12 && /[a-z]/.test(n.s))
      let naam = onder?.s ?? null
      if (naast) {
        const deel = naast.s.trim()
        naam = deel
        const vervolg = page.texts.find((n) => (Math.abs(n.x - naast.x) < 2 || Math.abs(n.x - t.x) < 12) && n.y > naast.y && n.y - naast.y < 14 && n.s.trim())
        if (vervolg) naam = deel.endsWith('-') ? deel.slice(0, -1) + vervolg.s.trim() : `${deel} ${vervolg.s.trim()}`
      }
      if (!naam || out.some((c) => c.code === code)) continue
      out.push({ code, naam: norm(naam), img: imageAbove(page, t) })
    }
  }
  return out
}

// ---------- werkbladen ----------

// De tabel "omgevingskleuren werkbladen": per regel naam, staal, kleurnummer,
// decorgroep en in de diktekolommen een gekleurd vakje als die dikte er is.
function parseWerkbladen(pages: PdfPage[]): CatalogusWerkblad[] {
  const out: CatalogusWerkblad[] = []
  for (const page of pages) {
    // Een pagina kan meer dan één tabel hebben; elke kop "kleur nr." begint er een.
    const headers = page.texts.filter((t) => /kleur\s*nr/i.test(t.s)).sort((a, b) => a.y - b.y)
    headers.forEach((header, hi) => {
      const yEnd = headers[hi + 1]?.y ?? page.h
      const apl = page.texts.find((t) => /APL max/i.test(t.s) && t.y > header.y - 40 && t.y < yEnd)
      // Kolomkoppen met diktes: 12/16/40/50 net onder de kop, vóór "APL max. lengte".
      const kolommen = tokens(page.texts)
        .filter((t) => ['12', '16', '40', '50'].includes(t.s) && t.y > header.y && t.y < header.y + 40 && t.x > header.x + 20 && (!apl || t.x < apl.x))
        .map((t) => ({ dikte: Number(t.s), x: t.x + t.w / 2 }))
      const codes = page.texts.filter((t) => /^\d{4}$/.test(t.s.trim()) && Math.abs(t.x - header.x) < 12 && t.y > header.y + 30 && t.y < yEnd)
      for (const code of codes) {
        // Naam (soms over twee regels, "(kern: zwart)") staat links, rond de hoogte van de code.
        const naamDelen = page.texts.filter((t) => t.x < header.x - 60 && t.y > code.y - 9 && t.y < code.y + 9).sort((a, b) => a.y - b.y)
        const naam = norm(naamDelen.filter((t) => !/^\(kern/i.test(t.s.trim())).map((t) => t.s).join(' '))
        if (!naam) continue
        const compact = naamDelen.some((t) => /kern/i.test(t.s))
        const regel = lineOf(page.texts, code)
        const groepTok = regel.find((t) => /^\d$/.test(t.s.trim()) && t.x > code.x + code.w && t.x - code.x < 50)
        const rowTop = code.y - 10
        const rowBottom = code.y + 4
        const overlapt = (img: PdfBox) => img.y < rowBottom && img.y + img.h > rowTop
        const swatch = page.images.find((img) => img.x < header.x - 5 && img.x + img.w > header.x - 60 && overlapt(img))
        const diktes = kolommen.filter((k) => page.images.some((img) => k.x > img.x && k.x < img.x + img.w && overlapt(img))).map((k) => k.dikte)
        if (out.some((w) => w.code === code.s.trim() && w.compact === compact)) continue
        out.push({
          code: code.s.trim(),
          naam,
          decorgroep: groepTok ? Number(groepTok.s) : null,
          compact,
          diktes: compact ? [12] : [...new Set(diktes.filter((d) => d !== 12))].sort((a, b) => a - b),
          img: swatch ? { page: page.n, box: swatch } : null,
        })
      }
    })
  }
  return out
}

// ---------- grepen ----------

function parseGrepen(pages: PdfPage[]): CatalogusGreep[] {
  const out: CatalogusGreep[] = []
  let boorafstand: number | null = null
  let knop = false
  for (const page of pages) {
    const artikelKop = page.texts.find((t) => /^Artikel nr/i.test(t.s.trim()))
    const altKop = page.texts.find((t) => /^alternatieve/i.test(t.s.trim()))
    const meerprijsKop = page.texts.find((t) => /meerprijs/i.test(t.s))
    // Kopjes "KNOPPEN" / "BOORAFSTAND 128 MM" gelden voor alles eronder, ook
    // op de volgende pagina('s).
    const koppen = page.texts
      .filter((t) => /^(KNOPPEN|BOORAFSTAND\s*\d+\s*MM)$/i.test(norm(t.s)))
      .sort((a, b) => a.y - b.y)
    const codes = page.texts
      .filter((t) => /^[GK]\d{3}$/.test(t.s.trim()) && (!altKop || t.x > altKop.x + 12) && (!artikelKop || Math.abs(t.x - artikelKop.x) < 25))
      .sort((a, b) => a.y - b.y)
    const kopVoor = (y: number) => koppen.filter((k) => k.y < y).pop()
    for (const code of codes) {
      const kop = kopVoor(code.y)
      if (kop) {
        knop = /KNOPPEN/i.test(kop.s)
        const m = kop.s.match(/(\d+)\s*MM/i)
        boorafstand = m ? Number(m[1]) : null
      }
      const regel = tokens(lineOf(page.texts, code)).filter((t) => t.x > code.x)
      const naam = norm(regel.filter((t) => !isInt(t.s) && t.x < code.x + 120 && !/^[A-Z](,|$)/.test(t.s)).map((t) => t.s).join(' '))
      const getallen = regel.filter((t) => isInt(t.s))
      const lengte = getallen[0] ? Number(getallen[0].s) : null
      const prijsTok = meerprijsKop ? getallen.filter((t) => Math.abs(t.x - meerprijsKop.x) < 25).pop() : getallen[getallen.length - 1]
      const c = code.s.trim()
      if (out.some((g) => g.code === c)) continue
      out.push({
        code: c,
        naam: naam || c,
        soort: knop || c.startsWith('K') ? 'knop' : boorafstand && boorafstand >= 320 ? 'lang' : 'greep',
        boorafstand: knop ? null : boorafstand,
        lengte,
        meerprijs: prijsTok ? Number(prijsTok.s) : 0,
        img: imageLeftOf(page, code),
      })
    }
  }
  return out
}

// ---------- modellen ----------

function parseModellen(pages: PdfPage[]): CatalogusModel[] {
  const out: CatalogusModel[] = []
  for (const page of pages) {
    const pgKoppen = page.texts.filter((t) => t.s.trim() === 'PG')
    for (const r of rows(page.texts)) {
      for (const kop of pgKoppen) {
        const pg = r.items.find((t) => Math.abs(t.x - kop.x) < 8 && /^(\d|\*)$/.test(t.s.trim()))
        if (!pg) continue
        const naam = r.items.find((t) => t.x < kop.x - 20 && t.x > kop.x - 170 && /^[A-ZÄÖÜ][A-ZÄÖÜ-]{2,}$/.test(t.s.trim()))
        if (!naam || out.some((m) => m.naam === naam.s.trim())) continue
        out.push({ naam: naam.s.trim(), pg: pg.s.trim() === '*' ? null : Number(pg.s) })
      }
    }
  }
  return out
}

// ---------- kasten (prijzen per prijsgroep) ----------

// Regel = bestelnummer gevolgd door 8 prijzen (PG1–8), soms nog meerprijzen.
// Het bestelnummer staat er twee keer (gesplitst en aaneen); de aaneengesloten
// versie is de code.
const KAST_CODE = /^[A-Z]{1,6}\d?[A-Z]*\d*-[0-9A-Z.\-/]+$/

function parseKasten(pages: PdfPage[]): CatalogusKast[] {
  const out = new Map<string, number[]>()
  for (const page of pages) {
    for (const r of rows(page.texts)) {
      const toks = tokens(r.items)
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i]
        if (!KAST_CODE.test(t.s)) continue
        const getallen: number[] = []
        for (let j = i + 1; j < toks.length && getallen.length < 8; j++) {
          if (toks[j].x < t.x) continue
          if (isInt(toks[j].s)) getallen.push(Number(toks[j].s))
          else if (getallen.length) break
        }
        if (getallen.length === 8 && !out.has(t.s)) out.set(t.s, getallen)
      }
    }
  }
  return [...out].map(([code, prijzen]) => ({ code, prijzen }))
}

// ---------- accessoires ----------

// Regel = bestelnummer (twee keer, of artikelnummer + bestelnummer met
// diepte-index zoals BEHSET080 / BEHSET080-6EN), eventueel een uitvoerings-
// code, en de prijs als laatste getal. De omschrijving is de eerste regel van
// het tekstblok links ervan.
const ACC_CODE = /^[A-Z][A-Z0-9-]{2,}[0-9A-Z.\-/]*$/

function splitGeplakt(s: string): string[] {
  // "BEHSET090BEHSET090-6EN" → ["BEHSET090", "BEHSET090-6EN"]
  for (let i = 3; i < s.length - 3; i++) {
    const a = s.slice(0, i)
    if (s.slice(i).startsWith(a)) return [a, s.slice(i)]
  }
  return [s]
}

function parseAccessoires(pages: PdfPage[]): CatalogusAccessoire[] {
  const out = new Map<string, CatalogusAccessoire>()
  const add = (code: string, naam: string, prijs: number) => {
    if (!out.has(code)) out.set(code, { code, naam, prijs })
  }
  for (const page of pages) {
    // Een pagina kan meerdere tabellen hebben, elk met een eigen kop
    // "Bestelnr." (en een eigen kolompositie); per regel telt de kop erboven.
    const koppen = page.texts.filter((t) => /^Bestelnr/.test(t.s.trim())).sort((a, b) => a.y - b.y)
    if (!koppen.length) continue
    const bestelKop = koppen[0]
    const kopX = (y: number) => (koppen.filter((k) => k.y <= y + 2).pop() ?? bestelKop).x
    // Omschrijvingsblokken: tekst links van de bestelnummers; een nieuw blok
    // begint na een witregel.
    const omschr = page.texts
      .filter((t) => t.x > 100 && t.x < bestelKop.x - 10 && /[a-z]/i.test(t.s) && !/^[•!]$/.test(t.s.trim()))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    const blokken: { y: number; titel: string }[] = []
    let vorige: PdfText | null = null
    for (const t of omschr) {
      if (!vorige || t.y - vorige.y > 13) blokken.push({ y: t.y, titel: norm(t.s) })
      else if (blokken.length && blokken[blokken.length - 1].titel.endsWith('-') && t.y - vorige.y > 2) {
        const b = blokken[blokken.length - 1]
        b.titel = b.titel.slice(0, -1) + norm(t.s)
      }
      vorige = t
    }
    const naamBij = (y: number) => blokken.filter((b) => b.y <= y + 3).pop()?.titel ?? ''

    // Dieptetabellen: "IK | 060 | -4 127 | -5 133 | -6 134 | -7 187" — het
    // bestelnummer is voorvoegsel + breedte + diepte-index, elke index met
    // een eigen prijs. "-6xx" = per uitvoering (EN eiken, ES essen zwart,
    // QG OrganiQ grijs als die op de pagina staat).
    const uitvoeringen = ['EN', 'ES', ...(page.texts.some((t) => /\bQG\b/.test(t.s)) ? ['QG'] : [])]
    const gezien = new Set<number>()
    for (const r of rows(tokens(page.texts))) {
      const it = r.items.filter((t) => t.x > kopX(r.y) - 10)
      if (it.length < 3) continue
      let voor: string | null = null
      let breedte: string | null = null
      let i = 0
      const los = it[0].s.match(/^([A-Z][A-Z-]{0,9}?)(\d{3}(?:STD)?)$/)
      if (los) { voor = los[1]; breedte = los[2]; i = 1 }
      else if (/^[A-Z][A-Z-]{0,9}$/.test(it[0].s) && it[1]) {
        const m = it[1].s.match(/^(\d{3}(?:STD)?)/)
        if (m) { voor = it[0].s; breedte = m[1]; i = 2 }
      }
      if (!voor || !breedte) continue
      let gevonden = false
      for (; i < it.length - 1; i++) {
        const suf = it[i].s.match(/^-(\d)([A-Za-z]*)$/)
        if (!suf || !isInt(it[i + 1].s)) continue
        const prijs = Number(it[i + 1].s)
        const varianten = suf[2] === 'xx' ? uitvoeringen.map((u) => `-${suf[1]}${u}`) : [it[i].s]
        for (const v of varianten) add(`${voor}${breedte}${v}`, naamBij(r.y) || voor, prijs)
        gevonden = true
        i++
      }
      if (gevonden) gezien.add(Math.round(r.y))
    }

    const codeToks = tokens(page.texts)
      .flatMap((t) => splitGeplakt(t.s).map((s, i, arr) => ({ ...t, s, x: t.x + (i * t.w) / arr.length })))
      .filter((t) => ACC_CODE.test(t.s) && t.x > kopX(t.y) - 60 && t.x < kopX(t.y) + 120)
    for (const code of codeToks.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const rij = Math.round(code.y)
      if (gezien.has(rij) || gezien.has(rij - 1) || gezien.has(rij + 1)) continue
      const regel = tokens(lineOf(page.texts, code))
      const opRegel = codeToks.filter((c) => Math.abs(c.y - code.y) <= 3)
      // Code zonder cijfers (KORBFLT, BEASE) alleen als artikel- en
      // bestelnummer gelijk zijn; anders is het tekst uit de omschrijving.
      if (!/\d/.test(code.s) && opRegel.filter((c) => c.s === code.s).length < 2) continue
      const prijs = regel.filter((t) => isInt(t.s) && t.x > Math.max(...opRegel.map((c) => c.x + c.w))).pop()
      if (!prijs) continue
      gezien.add(rij)
      const naam = naamBij(code.y)
      for (const c of new Set(opRegel.map((c) => c.s))) add(c, naam || c, Number(prijs.s))
    }
  }
  return [...out.values()]
}

// ---------- welke pagina's ----------

// Hoofdstuknamen verschillen per jaargang (2027 / 2026).
const CORPUS_DECORS = /^(Corpusdecors|Decors - corpusuitvoeringen)$/i
const DECOR_OVERZICHT = /^(Decorenoverzicht|Decors - overzichten)$/i
const WERKBLAD_DECORS = /^Werkbladen Decors$/i

const KAST_HOOFDSTUKKEN = [/^Onderkasten$/i, /^Hangkasten$/i, /^Hogekasten$/i, /^Greeploo?se keuken$/i]

function greepPaginaBereik(outline: OutlineEntry[]): number[] {
  const starts = outline
    .filter((o) => o.page && (/^Knoppen$/i.test(o.title) || /^Boorafstand \d+ ?mm$/i.test(o.title)))
    .map((o) => o.page!)
  if (!starts.length) return []
  const van = Math.min(...starts)
  // Tot het eerstvolgende hoofdstuk na de laatste boorafstand (Greepsysteem e.d.).
  const tot = Math.max(...starts) + 1
  return Array.from({ length: tot - van + 1 }, (_, k) => van + k)
}

// Welke pagina's de browser moet uitlezen: tekst voor alle hoofdstukken die
// we gebruiken, afbeeldingsposities alleen waar stalen staan.
export function benodigdePaginas(outline: OutlineEntry[], pageCount: number): { tekst: number[]; afbeeldingen: number[] } {
  const stalen = [
    ...sectionPages(outline, CORPUS_DECORS, pageCount),
    ...sectionPages(outline, DECOR_OVERZICHT, pageCount),
    ...sectionPages(outline, WERKBLAD_DECORS, pageCount),
    ...greepPaginaBereik(outline),
  ]
  const tekst = [
    ...stalen,
    ...sectionPages(outline, /^Modeloverzicht$/i, pageCount),
    ...KAST_HOOFDSTUKKEN.flatMap((re) => sectionPages(outline, re, pageCount)),
    ...sectionPages(outline, /^Toebehoor$/i, pageCount),
    1,
  ]
  const uniek = (xs: number[]) => [...new Set(xs)].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)
  return { tekst: uniek(tekst), afbeeldingen: uniek(stalen) }
}

// ---------- alles ----------

export function parseCatalogus(outline: OutlineEntry[], pages: Map<number, PdfPage>, pageCount: number): Catalogus {
  const waarschuwingen: string[] = []
  // De gekleurde tabs langs de rand ("models", "grepen", ...) staan op elke
  // pagina en horen nergens bij.
  const get = (nums: number[]) => nums
    .map((n) => pages.get(n))
    .filter((p): p is PdfPage => !!p)
    .map((p) => ({ ...p, texts: p.texts.filter((t) => t.x >= 30 || t.x + t.w > 45) }))
  const section = (title: RegExp, label: string) => {
    const nums = sectionPages(outline, title, pageCount)
    if (!nums.length) waarschuwingen.push(`Hoofdstuk "${label}" niet gevonden in de inhoudsopgave`)
    return get(nums)
  }

  // Zonder randfilter: in 2026 staan de eerste stalen tegen de linkermarge.
  const corpusNums = sectionPages(outline, CORPUS_DECORS, pageCount)
  if (!corpusNums.length) waarschuwingen.push('Hoofdstuk "Corpusdecors" niet gevonden in de inhoudsopgave')
  const corpus = parseCorpus(corpusNums.map((n) => pages.get(n)).filter((p): p is PdfPage => !!p))
  // Werkbladtabel: in 2027 in het decorenoverzicht, in 2026 bij de werkbladen.
  const werkbladPaginas = [
    ...get(sectionPages(outline, DECOR_OVERZICHT, pageCount)).filter((p) => p.texts.some((t) => /WERKBLADEN/.test(t.s))),
    ...get(sectionPages(outline, WERKBLAD_DECORS, pageCount)),
  ]
  if (!werkbladPaginas.length) waarschuwingen.push('Geen werkbladdecors gevonden (hoofdstuk "Decorenoverzicht" of "Werkbladen Decors")')
  const werkbladen = parseWerkbladen(werkbladPaginas)

  // Knoppen en grepen per boorafstand staan achter elkaar in "Grepen"; de
  // boorafstand komt uit de kopjes op de pagina's zelf.
  const greepPaginas = greepPaginaBereik(outline)
  const grepen = parseGrepen(get(greepPaginas))
  if (!greepPaginas.length) waarschuwingen.push('Geen greephoofdstukken (Knoppen / Boorafstand) gevonden')

  const modellen = parseModellen(section(/^Modeloverzicht$/i, 'Modeloverzicht'))

  const kasten = parseKasten(KAST_HOOFDSTUKKEN.flatMap((re) => section(re, re.source)))
  const accessoires = parseAccessoires(section(/^Toebehoor$/i, 'Toebehoor'))

  const titel = pages.get(1)?.texts.map((t) => t.s).join(' ').match(/SK\s?\d{3}[^\n]{0,20}\d{4}/)?.[0] ?? null

  for (const [naam, lijst, min] of [
    ['corpuskleuren', corpus, 10], ['werkbladdecors', werkbladen, 20], ['grepen', grepen, 40],
    ['modellen', modellen, 20], ['kastprijzen', kasten, 500], ['accessoires', accessoires, 100],
  ] as const) {
    if (lijst.length < min) waarschuwingen.push(`Weinig ${naam} gevonden (${lijst.length}); controleer de catalogus`)
  }

  return { titel, corpus, werkbladen, grepen, modellen, kasten, accessoires, waarschuwingen }
}
