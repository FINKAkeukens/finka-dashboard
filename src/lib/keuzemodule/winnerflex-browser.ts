'use client'

// Browserkant van "Inlezen uit Winner Flex": tekst per pagina ophalen met
// pdf.js (dezelfde opzet als de cataloguslezer), de artikellijst uitlezen
// met parseWinnerFlex, en uit het bovenaanzicht met positienummers de
// getekende plattegrond opbouwen (plattegrond.ts). Uit een elementenlijst
// komen ook de kastafbeeldingen mee (kastplaatjes.ts); die uploadt de aanroeper.

import type { PdfPage, PdfText } from '../catalogus/parse'
import { laadPdfjs, openPdf } from '../catalogus/extract'
import { parseWinnerFlex, type WinnerUitdraai } from './winnerflex'
import { bouwPlattegrond, leesTekening, type Plattegrond, type Vak } from './plattegrond'
import { koppelPlaatjes, plaatjesOpPagina } from './kastplaatjes'

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
  // Kastafbeelding per positie (webp), alleen uit een elementenlijst.
  plaatjes: Record<string, Blob>
}

// Knipt de kastafbeeldingen uit; alleen pagina's met een gekoppeld plaatje
// worden gerenderd (zelfde werkwijze als knipStalen in de cataloguslezer).
const SCALE = 3

async function knipPlaatjes(pdf: Pdf, pages: PdfPage[], posities: Set<string>, OPS: Record<string, number>): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {}
  for (const p of pages) {
    const page = await pdf.getPage(p.n)
    const vp = page.getViewport({ scale: 1 })
    const boxes = plaatjesOpPagina(await page.getOperatorList(), OPS, (x, y) => vp.convertToViewportPoint(x, y))
    const gevonden = Object.entries(koppelPlaatjes(boxes, p.texts, posities)).filter(([pos]) => !out[pos])
    if (gevonden.length) {
      const viewport = page.getViewport({ scale: SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas niet beschikbaar in deze browser')
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      for (const [pos, b] of gevonden) {
        const w = Math.max(1, Math.round(b.w * SCALE))
        const h = Math.max(1, Math.round(b.h * SCALE))
        const knip = document.createElement('canvas')
        knip.width = w
        knip.height = h
        knip.getContext('2d')!.drawImage(canvas, Math.round(b.x * SCALE), Math.round(b.y * SCALE), w, h, 0, 0, w, h)
        const blob = await new Promise<Blob | null>((resolve) => knip.toBlob(resolve, 'image/webp', 0.85))
        if (blob) out[pos] = blob
      }
    }
    page.cleanup()
  }
  return out
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
    const { OPS } = await laadPdfjs()
    const ops = OPS as unknown as Record<string, number>
    const plaatjes = await knipPlaatjes(pdf, pages.filter((p) => !isBovenaanzicht(p)), new Set(posities.map((p) => p.positie)), ops)
    let beste: Ingelezen['tekening'] = null
    for (const n of bov) {
      const page = await doel.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const vormen = leesTekening(await page.getOperatorList(), ops, (x, y) => vp.convertToViewportPoint(x, y))
      page.cleanup()
      const r = bouwPlattegrond(vormen, posities)
      if (r && (!beste || Object.keys(r.vakken).length > Object.keys(beste.vakken).length)) beste = r
    }
    return { uitdraai, tekening: beste, plaatjes }
  } finally {
    pdf.destroy()
    tekenPdf?.destroy()
  }
}
