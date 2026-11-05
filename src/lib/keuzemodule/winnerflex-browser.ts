'use client'

// Browserkant van "Inlezen uit Winner Flex": tekst per pagina ophalen met
// pdf.js (dezelfde opzet als de cataloguslezer), uitlezen met
// parseWinnerFlex, en het bovenaanzicht als PNG renderen voor de
// plattegrond. Geen enkele pixel van de tekening wordt aangepast, alleen
// bijgesneden tot binnen het tekenkader.

import type { PdfPage, PdfText } from '../catalogus/parse'
import { openPdf } from '../catalogus/extract'
import { parseWinnerFlex, type WinnerUitdraai } from './winnerflex'

// Langste zijde van de PNG — scherp genoeg voor de kleine maatcijfers.
const TARGET_LONG_SIDE_PX = 2600

export async function leesUitdraai(bron: Blob | string): Promise<{ uitdraai: WinnerUitdraai; plattegrond: Blob | null }> {
  const blob = typeof bron === 'string' ? await (await fetch(bron)).blob() : bron
  const pdf = await openPdf(blob)
  try {
    const pages: PdfPage[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      const texts: PdfText[] = []
      for (const item of tc.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const [x, y] = vp.convertToViewportPoint(item.transform[4], item.transform[5])
        texts.push({ s: item.str, x, y, w: item.width, h: item.height })
      }
      pages.push({ n, w: vp.width, h: vp.height, texts, images: [] })
      page.cleanup()
    }
    const uitdraai = parseWinnerFlex(pages)

    let plattegrond: Blob | null = null
    if (uitdraai.bovenaanzicht) {
      const page = await pdf.getPage(uitdraai.bovenaanzicht)
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
      plattegrond = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
    }
    return { uitdraai, plattegrond }
  } finally {
    pdf.destroy()
  }
}

// Een Winner Flex-tekenpagina is altijd: kopregel → kader met de tekening →
// titelblok onderaan. Het kader herkennen we aan doorlopende donkere lijnen
// over (bijna) de hele breedte/hoogte; daarbinnen worden de witranden
// weggesneden. Wordt geen kader gevonden, dan blijft de hele pagina staan.
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
