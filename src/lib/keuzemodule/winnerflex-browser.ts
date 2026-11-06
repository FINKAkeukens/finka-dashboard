'use client'

// Browserkant van "Inlezen uit Winner Flex": tekst per pagina ophalen met
// pdf.js (dezelfde opzet als de cataloguslezer), de artikellijst uitlezen
// met parseWinnerFlex, en uit het bovenaanzicht met positienummers de
// getekende plattegrond opbouwen (plattegrond.ts). Er wordt niets geüpload:
// alleen de uitkomst gaat naar de database.

import type { PdfPage, PdfText } from '../catalogus/parse'
import { openPdf } from '../catalogus/extract'
import { parseWinnerFlex, type WinnerUitdraai } from './winnerflex'
import { bouwPlattegrond, leesTekening, type Plattegrond, type Vak } from './plattegrond'

type Pdf = Awaited<ReturnType<typeof openPdf>>

async function tekstPaginas(pdf: Pdf): Promise<PdfPage[]> {
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
  return pages
}

const isBovenaanzicht = (p: PdfPage) => p.texts.some((t) => /^\s*Bovenaanzicht\b/i.test(t.s))

async function laad(bron: Blob | string) {
  const blob = typeof bron === 'string' ? await (await fetch(bron)).blob() : bron
  return openPdf(blob)
}

export interface Ingelezen {
  uitdraai: WinnerUitdraai
  tekening: { plattegrond: Plattegrond; vakken: Record<string, Vak> } | null
}

// artikelen: de offerte/order met alle artikelen en positienummers.
// tekening: het bovenaanzicht met positienummers; zonder aparte tekening
// wordt het bovenaanzicht in de artikel-PDF zelf geprobeerd.
export async function leesUitdraai(artikelen: Blob | string, tekening?: Blob | string | null): Promise<Ingelezen> {
  const pdf = await laad(artikelen)
  const tekenPdf = tekening ? await laad(tekening) : null
  try {
    const pages = await tekstPaginas(pdf)
    const uitdraai = parseWinnerFlex(pages)

    const doel = tekenPdf ?? pdf
    const doelPages = tekenPdf ? await tekstPaginas(tekenPdf) : pages
    const bov = doelPages.filter(isBovenaanzicht).map((p) => p.n)
    if (!bov.length && tekenPdf && tekenPdf.numPages === 1) bov.push(1)

    const posities = uitdraai.kasten.map((k) => ({ positie: k.positie, wand: k.soort === 'wand' }))
    const { OPS } = await import('pdfjs-dist')
    let beste: Ingelezen['tekening'] = null
    for (const n of bov) {
      const page = await doel.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const vormen = leesTekening(await page.getOperatorList(), OPS as unknown as Record<string, number>, (x, y) => vp.convertToViewportPoint(x, y))
      page.cleanup()
      const r = bouwPlattegrond(vormen, posities)
      if (r && (!beste || Object.keys(r.vakken).length > Object.keys(beste.vakken).length)) beste = r
    }
    return { uitdraai, tekening: beste }
  } finally {
    pdf.destroy()
    tekenPdf?.destroy()
  }
}
