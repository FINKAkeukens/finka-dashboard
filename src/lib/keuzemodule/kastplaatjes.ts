// Kastafbeeldingen uit een Winner Flex-elementenlijst (Montagebon): onder
// elke positieregel staat een plaatje van de kast. We zoeken de plaatjes
// in de pdf.js-operatorlijst en koppelen elk plaatje aan de dichtstbijzijnde
// positie erboven. Plaatjes onder een subpositie (3.4 maatwijziging e.d.)
// vallen af. Puur, zodat het ook buiten de browser te testen is.

import type { PdfText } from '../catalogus/parse'

export interface Box { x: number; y: number; w: number; h: number }

type Mat = [number, number, number, number, number, number]
const maal = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]

// Kaders (schermcoördinaten, y omlaag) van alle plaatjes op een pagina.
export function plaatjesOpPagina(
  ol: { fnArray: number[]; argsArray: unknown[] },
  OPS: Record<string, number>,
  naarScherm: (x: number, y: number) => number[],
): Box[] {
  const out: Box[] = []
  let ctm: Mat = [1, 0, 0, 1, 0, 0]
  const stapel: Mat[] = []
  const beeld = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].filter((x) => x !== undefined))
  ol.fnArray.forEach((fn, i) => {
    const a = ol.argsArray[i] as number[] | null
    if (fn === OPS.save) stapel.push(ctm)
    else if (fn === OPS.restore) ctm = stapel.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (fn === OPS.transform && a) ctm = maal(ctm, [a[0], a[1], a[2], a[3], a[4], a[5]])
    else if (beeld.has(fn)) {
      const hoeken = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) =>
        naarScherm(ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]))
      const xs = hoeken.map((p) => p[0])
      const ys = hoeken.map((p) => p[1])
      const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      if (box.w > 20 && box.h > 20) out.push(box)
    }
  })
  return out
}

// Koppelt plaatjes aan posities. texts = tekst van dezelfde pagina.
export function koppelPlaatjes(boxes: Box[], texts: PdfText[], posities: Set<string>): Record<string, Box> {
  // Positiekolom: links van de kop "Code", anders de meest linkse getallen.
  const codeKop = texts.find((t) => t.s.trim() === 'Code')
  const kolomGrens = codeKop ? codeKop.x - 2 : Math.min(...texts.map((t) => t.x)) + 25
  const pos = texts
    .filter((t) => t.x < kolomGrens && /^\d+(\.\d+)?$/.test(t.s.trim()))
    .map((t) => ({ s: t.s.trim(), y: t.y }))
  const out: Record<string, Box> = {}
  for (const b of boxes) {
    const boven = pos.filter((p) => p.y <= b.y + 8).sort((p, q) => q.y - p.y)[0]
    if (boven && posities.has(boven.s) && !out[boven.s]) out[boven.s] = b
  }
  return out
}
