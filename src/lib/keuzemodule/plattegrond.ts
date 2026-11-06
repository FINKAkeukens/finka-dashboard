// Getekende plattegrond uit het Winner Flex-bovenaanzicht (met
// positienummers). Puur: krijgt de operatorlijst van pdf.js binnen en geeft
// muren en een vak per kast terug, in punten van de PDF-pagina (y omlaag).
//
// Winner Flex tekent elke kast als een gesloten rechthoek (wit gevuld,
// gekleurde rand) en het front als een smalle strook tegen één zijde aan.
// Het positienummer staat als losse tekst midden in de kast; maatcijfers
// staan erbuiten. Muren zijn grijs gevulde vlakken zonder rand.

export type Front = 'up' | 'down' | 'left' | 'right'

// lx/ly: waar Winner Flex het positienummer zette. Gebruikt voor
// bovenkasten, zodat hun nummer niet over dat van de onderkast valt.
export type Vak = { x: number; y: number; w: number; h: number; lx: number; ly: number; front: Front | null; wand?: boolean }

export type Plattegrond = {
  // viewBox van de tekening: [x, y, breedte, hoogte]
  kader: [number, number, number, number]
  muren: string[] // SVG-paden, te tekenen met fill-rule evenodd
}

type Punt = [number, number]
// groep: alle subpaden van één pad (een muur is buitenrand + binnenrand
// met even-odd vulling).
type Vorm = { pts: Punt[]; gesloten: boolean; rand: string | null; vulling: string | null; groep: number }
type Tekst = { s: string; cx: number; cy: number }
type Box = { x1: number; y1: number; x2: number; y2: number }
type Matrix = [number, number, number, number, number, number]

const ID: Matrix = [1, 0, 0, 1, 0, 0]
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m: Matrix, x: number, y: number): Punt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

type OperatorList = { fnArray: number[]; argsArray: unknown[] }
type Ops = Record<string, number>

// Loopt de operatorlijst door en verzamelt paden (met kleur) en teksten (met
// middelpunt). naarScherm zet PDF-coördinaten om naar paginapunten met y
// omlaag (viewport.convertToViewportPoint).
export function leesTekening(ol: OperatorList, OPS: Ops, naarScherm: (x: number, y: number) => number[]) {
  const vormen: Vorm[] = []
  const losse: { s: string; begin: Punt; eind: Punt; op: Punt }[] = []
  type Staat = { ctm: Matrix; rand: string | null; vulling: string | null; font: number; charSpacing: number; hScale: number; leading: number }
  let st: Staat = { ctm: ID, rand: '#000000', vulling: '#000000', font: 10, charSpacing: 0, hScale: 1, leading: 0 }
  const stapel: Staat[] = []
  let tm: Matrix = ID
  let tlm: Matrix = ID
  const scherm = (m: Matrix, x: number, y: number): Punt => {
    const [px, py] = apply(mul(st.ctm, m), x, y)
    const [sx, sy] = naarScherm(px, py)
    return [sx, sy]
  }

  const STROKE = new Set([OPS.stroke, OPS.closeStroke])
  const FILL = new Set([OPS.fill, OPS.eoFill])
  const BEIDE = new Set([OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]
    const args = ol.argsArray[i] as unknown[]
    if (fn === OPS.save) stapel.push({ ...st })
    else if (fn === OPS.restore) st = stapel.pop() ?? st
    else if (fn === OPS.transform) st.ctm = mul(st.ctm, args as Matrix)
    else if (fn === OPS.setStrokeRGBColor) st.rand = kleur(args)
    else if (fn === OPS.setFillRGBColor) st.vulling = kleur(args)
    else if (fn === OPS.setFont) st.font = Math.abs(Number(args[1]) || 10)
    else if (fn === OPS.setCharSpacing) st.charSpacing = Number(args[0]) || 0
    else if (fn === OPS.setHScale) st.hScale = (Number(args[0]) || 100) / 100
    else if (fn === OPS.setLeading) st.leading = Number(args[0]) || 0
    else if (fn === OPS.beginText) { tm = ID; tlm = ID }
    else if (fn === OPS.setTextMatrix) {
      const m = (Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? args[0] : args) as ArrayLike<number>
      tm = tlm = [m[0], m[1], m[2], m[3], m[4], m[5]]
    } else if (fn === OPS.moveText || fn === OPS.setLeadingMoveText) {
      if (fn === OPS.setLeadingMoveText) st.leading = -Number(args[1])
      tm = tlm = mul(tlm, [1, 0, 0, 1, Number(args[0]), Number(args[1])])
    } else if (fn === OPS.nextLine) {
      tm = tlm = mul(tlm, [1, 0, 0, 1, 0, -st.leading])
    } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      const glyphs = (args[0] ?? []) as (number | { unicode?: string; width?: number })[]
      let s = ''
      let breedte = 0
      for (const g of glyphs) {
        if (typeof g === 'number') breedte -= (g / 1000) * st.font * st.hScale
        else if (g) {
          s += g.unicode ?? ''
          breedte += (((g.width ?? 0) / 1000) * st.font + st.charSpacing) * st.hScale
        }
      }
      if (s.trim()) {
        const begin = scherm(tm, 0, 0)
        const eind = scherm(tm, breedte, 0)
        const hoog = scherm(tm, 0, st.font * 0.7)
        const vorige = losse[losse.length - 1]
        // Gedraaide tekst schrijft Winner Flex teken voor teken; plak een
        // stuk dat precies aansluit aan het vorige vast.
        const marge = 0.25 * Math.hypot(hoog[0] - begin[0], hoog[1] - begin[1])
        if (vorige && Math.hypot(vorige.eind[0] - begin[0], vorige.eind[1] - begin[1]) < marge) {
          vorige.s += s
          vorige.eind = eind
        } else {
          losse.push({ s, begin, eind, op: [hoog[0] - begin[0], hoog[1] - begin[1]] })
        }
      }
      tm = mul(tm, [1, 0, 0, 1, breedte, 0])
    } else if (fn === OPS.constructPath) {
      const verf = args[0] as number
      if (verf === OPS.endPath) continue
      const rand = STROKE.has(verf) || BEIDE.has(verf) ? st.rand : null
      const vulling = FILL.has(verf) || BEIDE.has(verf) ? st.vulling : null
      if (!rand && !vulling) continue
      const buf = ((args[1] as unknown[])?.[0] ?? []) as ArrayLike<number>
      let pts: Punt[] = []
      let gesloten = false
      const klaar = () => {
        if (pts.length >= 2) vormen.push({ pts, gesloten: gesloten || verf === OPS.closeStroke || verf === OPS.closeFillStroke || verf === OPS.closeEOFillStroke || !!vulling, rand, vulling, groep: i })
        pts = []
        gesloten = false
      }
      for (let j = 0; j < buf.length; ) {
        const op = buf[j++]
        if (op === 0) { klaar(); pts.push(scherm(ID, buf[j], buf[j + 1])); j += 2 }
        else if (op === 1) { pts.push(scherm(ID, buf[j], buf[j + 1])); j += 2 }
        else if (op === 2) { pts.push(scherm(ID, buf[j + 4], buf[j + 5])); j += 6 }
        else if (op === 3) { pts.push(scherm(ID, buf[j + 2], buf[j + 3])); j += 4 }
        else if (op === 4) gesloten = true
        else break
      }
      klaar()
    }
  }
  const teksten: Tekst[] = losse
    .map((t) => ({ s: t.s.trim(), cx: (t.begin[0] + t.eind[0] + t.op[0]) / 2, cy: (t.begin[1] + t.eind[1] + t.op[1]) / 2 }))
    .filter((t) => t.s)
  return { vormen, teksten }
}

function kleur(args: unknown[]): string {
  if (typeof args[0] === 'string') return args[0].toLowerCase()
  const [r, g, b] = (args as number[]).map((v) => Math.max(0, Math.min(255, Math.round(v > 1 ? v : v * 255))))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const rgb = (hex: string | null) => {
  if (!hex || !/^#[0-9a-f]{6}$/.test(hex)) return null
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}
// Grijs maar niet wit of zwart: de muurvulling.
const isMuurgrijs = (hex: string | null) => {
  const c = rgb(hex)
  return !!c && Math.max(...c) - Math.min(...c) < 8 && c[0] >= 150 && c[0] <= 245
}
// Groen = onderkasten/hoge kasten in Winner Flex.
const isGroen = (hex: string | null) => {
  const c = rgb(hex)
  return !!c && c[1] > c[0] + 25 && c[1] > c[2] + 25
}

const boxVan = (pts: Punt[]): Box => ({
  x1: Math.min(...pts.map((p) => p[0])),
  y1: Math.min(...pts.map((p) => p[1])),
  x2: Math.max(...pts.map((p) => p[0])),
  y2: Math.max(...pts.map((p) => p[1])),
})

// Gesloten, assen-evenwijdige rechthoek? (4 hoeken, eventueel met het
// beginpunt herhaald.)
function rechthoek(v: Vorm): Box | null {
  if (!v.gesloten) return null
  let pts = v.pts
  const eq = (a: Punt, b: Punt) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05
  if (pts.length === 5 && eq(pts[0], pts[4])) pts = pts.slice(0, 4)
  if (pts.length !== 4) return null
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    if (Math.abs(a[0] - b[0]) > 0.05 && Math.abs(a[1] - b[1]) > 0.05) return null
  }
  return boxVan(pts)
}

const r1 = (n: number) => Math.round(n * 10) / 10

// posities: de kasten uit de artikellijst; wand = bovenkast (Winner Flex
// tekent die grijs over de onderkasten heen, onderkasten zijn groen).
export function bouwPlattegrond(
  { vormen, teksten }: { vormen: Vorm[]; teksten: Tekst[] },
  posities: { positie: string; wand: boolean }[]
): { plattegrond: Plattegrond; vakken: Record<string, Vak> } | null {
  const kastRechthoeken: { box: Box; rand: string; groen: boolean }[] = []
  for (const v of vormen) {
    if (!v.rand || !v.vulling) continue
    const box = rechthoek(v)
    if (box && box.x2 - box.x1 >= 4 && box.y2 - box.y1 >= 4) kastRechthoeken.push({ box, rand: v.rand, groen: isGroen(v.rand) })
  }
  // Smalle stroken (fronten): alles wat in één richting 0,2–1,6 pt dik is.
  const stroken = vormen
    .map((v) => ({ ...boxVan(v.pts), rand: v.rand }))
    .filter((b) => {
      const dun = Math.min(b.x2 - b.x1, b.y2 - b.y1)
      return dun >= 0.2 && dun < 1.6 && Math.max(b.x2 - b.x1, b.y2 - b.y1) >= 3
    })

  const muurGroepen = new Map<number, Vorm[]>()
  for (const v of vormen) {
    if (!v.vulling || v.rand || !isMuurgrijs(v.vulling) || v.pts.length < 3) continue
    muurGroepen.set(v.groep, [...(muurGroepen.get(v.groep) ?? []), v])
  }
  const muurRanden: Box[] = [...muurGroepen.values()].flat().flatMap((v) =>
    v.pts.map((p, i) => boxVan([p, v.pts[(i + 1) % v.pts.length]]))
  )

  const vakken: Record<string, Vak> = {}
  for (const { positie, wand } of posities) {
    if (vakken[positie]) continue
    let beste: { box: Box; rand: string; score: number; t: Tekst } | null = null
    for (const t of teksten) {
      if (t.s !== positie) continue
      for (const r of kastRechthoeken) {
        const b = r.box
        if (t.cx < b.x1 - 0.2 || t.cx > b.x2 + 0.2 || t.cy < b.y1 - 0.2 || t.cy > b.y2 + 0.2) continue
        // Onderkast: groene rand gaat vóór (spoelbak, kookplaat en
        // bovenkasten liggen er soms overheen). Bovenkast: juist niet-groen.
        // Daarbinnen de kleinste rechthoek.
        const score = (r.groen !== wand ? 0 : 1e6) + (b.x2 - b.x1) * (b.y2 - b.y1)
        if (!beste || score < beste.score) beste = { box: b, rand: r.rand, score, t }
      }
    }
    if (beste) {
      vakken[positie] = {
        ...afgerond(beste.box),
        lx: r1(beste.t.cx),
        ly: r1(beste.t.cy),
        front: frontVan(beste.box, stroken.filter((s) => s.rand === beste.rand), muurRanden),
        ...(wand ? { wand: true } : {}),
      }
    }
  }
  const boxes = Object.values(vakken)
  if (!boxes.length) return null

  const x1 = Math.min(...boxes.map((b) => b.x))
  const y1 = Math.min(...boxes.map((b) => b.y))
  const x2 = Math.max(...boxes.map((b) => b.x + b.w))
  const y2 = Math.max(...boxes.map((b) => b.y + b.h))
  const marge = Math.max(12, 0.06 * Math.max(x2 - x1, y2 - y1))
  const kader: Plattegrond['kader'] = [r1(x1 - marge), r1(y1 - marge), r1(x2 - x1 + 2 * marge), r1(y2 - y1 + 2 * marge)]

  const muren = [...muurGroepen.values()]
    .filter((g) => {
      const b = boxVan(g.flatMap((v) => v.pts))
      return b.x2 >= kader[0] && b.x1 <= kader[0] + kader[2] && b.y2 >= kader[1] && b.y1 <= kader[1] + kader[3]
    })
    .map((g) => g.map((v) => `M${v.pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`).join(''))

  return { plattegrond: { kader, muren }, vakken }
}

const afgerond = (b: Box) => ({ x: r1(b.x1), y: r1(b.y1), w: r1(b.x2 - b.x1), h: r1(b.y2 - b.y1) })

// Het front is de zijde met een smalle strook er direct tegenaan, aan de
// buitenkant, over minstens de halve lengte van die zijde. Staat de kast met
// een zijde tegen de muur, dan wint de zijde daartegenover.
function frontVan(b: Box, stroken: Box[], muurRanden: Box[]): Front | null {
  const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
  const w = b.x2 - b.x1
  const h = b.y2 - b.y1
  const score: Record<Front, number> = { up: 0, down: 0, left: 0, right: 0 }
  for (const s of stroken) {
    const horizontaal = s.x2 - s.x1 > s.y2 - s.y1
    if (horizontaal) {
      const o = overlap(b.x1, b.x2, s.x1, s.x2) / w
      if (o < 0.5) continue
      if (s.y2 <= b.y1 + 0.3 && s.y2 >= b.y1 - 2) score.up = Math.max(score.up, o)
      if (s.y1 >= b.y2 - 0.3 && s.y1 <= b.y2 + 2) score.down = Math.max(score.down, o)
    } else {
      const o = overlap(b.y1, b.y2, s.y1, s.y2) / h
      if (o < 0.5) continue
      if (s.x2 <= b.x1 + 0.3 && s.x2 >= b.x1 - 2) score.left = Math.max(score.left, o)
      if (s.x1 >= b.x2 - 0.3 && s.x1 <= b.x2 + 2) score.right = Math.max(score.right, o)
    }
  }
  const MUUR = 8 // pt; een kast staat soms iets van de muur af (plint, leidingen)
  const tegenover: Record<Front, Front> = { up: 'down', down: 'up', left: 'right', right: 'left' }
  for (const m of muurRanden) {
    const horizontaal = m.x2 - m.x1 > m.y2 - m.y1
    const o = horizontaal ? overlap(b.x1, b.x2, m.x1, m.x2) / w : overlap(b.y1, b.y2, m.y1, m.y2) / h
    if (o < 0.5) continue
    const zijde: Front | null = horizontaal
      ? m.y1 <= b.y1 + 0.3 && m.y1 >= b.y1 - MUUR ? 'up' : m.y1 >= b.y2 - 0.3 && m.y1 <= b.y2 + MUUR ? 'down' : null
      : m.x1 <= b.x1 + 0.3 && m.x1 >= b.x1 - MUUR ? 'left' : m.x1 >= b.x2 - 0.3 && m.x1 <= b.x2 + MUUR ? 'right' : null
    if (zijde) {
      score[zijde] = -1
      score[tegenover[zijde]] += 1
    }
  }
  const [beste, waarde] = (Object.entries(score) as [Front, number][]).sort((a, b) => b[1] - a[1])[0]
  return waarde > 0 ? beste : null
}
