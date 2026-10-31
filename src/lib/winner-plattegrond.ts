'use client'

// Rendert één pagina van een Winner Flex-uitdraai (PDF) naar een PNG — voor
// de plattegrond-pagina na de kastenlijst in de klantversie. Bewust in de
// browser (pdf.js + canvas) i.p.v. server-side: op Vercel zou dat een native
// canvas-module vereisen, en de browser heeft de PDF bij het uploaden toch al.
//
// Geen enkele pixel van de tekening zelf wordt aangepast (zie de "niet
// transparant maken"-afspraak in het offerte-geheugen) — alleen bijsnijden.

// Langste zijde van de PNG — scherp genoeg voor de kleine maat- en
// positiecijfers in de PDF-export, zonder een onnodig zwaar bestand.
const TARGET_LONG_SIDE_PX = 2600

export async function loadPdf(source: Blob | string) {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' }
    )
  }
  const data = typeof source === 'string'
    ? new Uint8Array(await (await fetch(source)).arrayBuffer())
    : new Uint8Array(await source.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

// 'laatste': voor uitdraaien van vóór deze functie, waarvan de AI nooit een
// pagina heeft aangewezen — in Winner Flex staat het bovenaanzicht achteraan.
export async function renderPlattegrondPng(
  source: Blob | string,
  requestedPage: number | 'laatste'
): Promise<{ blob: Blob; pageCount: number; pageNumber: number }> {
  const pdf = await loadPdf(source)
  try {
    const pageNumber = requestedPage === 'laatste' ? pdf.numPages : requestedPage
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Pagina ${pageNumber} bestaat niet (de uitdraai heeft ${pdf.numPages} pagina's)`)
    }
    const page = await pdf.getPage(pageNumber)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(4, TARGET_LONG_SIDE_PX / Math.max(base.width, base.height)) })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas niet beschikbaar in deze browser')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const crop = findDrawingArea(ctx.getImageData(0, 0, canvas.width, canvas.height))
    const out = document.createElement('canvas')
    out.width = crop.width
    out.height = crop.height
    out.getContext('2d')!.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)

    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Afbeelding maken mislukt')
    return { blob, pageCount: pdf.numPages, pageNumber }
  } finally {
    pdf.destroy()
  }
}

// Een Winner Flex-tekenpagina is altijd: kopregel (project/verkoper) →
// kader met de tekening → titelblok onderaan (dealeradres, keukenmodel,
// klantnaam) → "Deze tekening is niet bindend". Alleen het stuk binnen het
// kader is voor de klant relevant; het titelblok herhaalt alleen gegevens.
// Het kader herkennen we aan doorlopende donkere lijnen over (bijna) de hele
// breedte/hoogte — muren in de tekening zelf zijn nooit zo lang. Wordt geen
// kader gevonden, dan blijft de hele pagina staan (alleen witranden eraf).
function findDrawingArea(image: ImageData) {
  const { width, height, data } = image
  const isDark = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return data[i] + data[i + 1] + data[i + 2] < 3 * 110
  }

  // Doorlopende horizontale lijnen → [start, eind] per lijn (een lijn is een
  // paar pixels dik bij deze resolutie).
  const lineRuns = (count: number, length: number, darkAt: (pos: number, along: number) => boolean, from = 0, to = length) => {
    const runs: [number, number][] = []
    for (let pos = 0; pos < count; pos++) {
      let dark = 0
      for (let along = from; along < to; along++) if (darkAt(pos, along)) dark++
      if (dark > 0.75 * (to - from)) {
        const last = runs[runs.length - 1]
        if (last && last[1] === pos - 1) last[1] = pos
        else runs.push([pos, pos])
      }
    }
    return runs
  }

  // Een paar pixels extra binnen het kader blijven: de lijn heeft
  // anti-aliasing-randen die anders als "inhoud" meetellen bij het
  // wegsnijden van de witranden hieronder.
  const inset = Math.ceil(Math.max(width, height) * 0.003)
  let top = 0
  let bottom = height - 1
  const hLines = lineRuns(height, width, (y, x) => isDark(x, y))
  if (hLines.length >= 2) {
    top = hLines[0][1] + inset
    bottom = hLines[1][0] - inset
  }

  let left = 0
  let right = width - 1
  const vLines = lineRuns(width, height, (x, y) => isDark(x, y), top, bottom + 1)
  if (vLines.length >= 2) {
    left = vLines[0][1] + inset
    right = vLines[vLines.length - 1][0] - inset
  }

  // Witranden binnen het kader wegsnijden, met wat lucht rondom.
  let minX = right, minY = bottom, maxX = left, maxY = top
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 4
      if (data[i] + data[i + 1] + data[i + 2] < 3 * 235) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, width, height }
  const pad = Math.round(Math.max(width, height) * 0.015)
  const x = Math.max(left, minX - pad)
  const y = Math.max(top, minY - pad)
  return {
    x,
    y,
    width: Math.min(right, maxX + pad) - x + 1,
    height: Math.min(bottom, maxY + pad) - y + 1,
  }
}
