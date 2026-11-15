'use client'

// Browserkant van "Catalogus vernieuwen": opent de catalogus-PDF met pdf.js,
// haalt tekst- en afbeeldingsposities op van de pagina's die parse.ts nodig
// heeft, en knipt daarna de stalen uit. Bewust in de browser: de PDF is ~46 MB
// (te groot om naar een Vercel-functie te sturen) en canvas-rendering kan
// server-side niet zonder native modules.

import type { ImageRef, OutlineEntry, PdfBox, PdfPage, PdfText } from './parse'
import { benodigdePaginas } from './parse'
import { vulStreamAan } from './stream-polyfill'

// De legacy-build van pdf.js: de gewone build gebruikt gloednieuwe
// JavaScript (o.a. Map.getOrInsertComputed) die Safari 26 nog niet heeft.
// De legacy-build brengt die zelf mee; wat ook die mist staat in stream-polyfill.ts.
export const laadPdfjs = () => {
  vulStreamAan()
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

type PdfDocument = Awaited<ReturnType<Awaited<ReturnType<typeof laadPdfjs>>['getDocument']>['promise']>

export interface Voortgang {
  stap: string
  klaar: number
  totaal: number
}

export async function openPdf(file: Blob): Promise<PdfDocument> {
  const pdfjs = await laadPdfjs()
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    // Kleine module-worker die eerst de stream-aanvulling uitvoert en dan de
    // pdf.js-worker laadt (die pas bij berichten streams doorloopt).
    // Volledig adres nodig: de bundler maakt er een pad als "/_next/…" van, en
    // dat kan een blob-worker niet oplossen (hij blijft dan stil hangen).
    const workerUrl = new URL(new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href, location.href).href
    const code = `import ${JSON.stringify(workerUrl)};\n(${vulStreamAan.toString()})()`
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' })
  }
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}

async function leesOutline(pdf: PdfDocument): Promise<OutlineEntry[]> {
  const out: OutlineEntry[] = []
  type Item = { title: string; dest: string | unknown[] | null; items?: Item[] }
  const walk = async (items: Item[] | null, depth: number) => {
    for (const it of items ?? []) {
      let page: number | null = null
      try {
        const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest
        if (dest && dest[0]) page = (await pdf.getPageIndex(dest[0] as Parameters<PdfDocument['getPageIndex']>[0])) + 1
      } catch {
        // Bladwijzer zonder geldige bestemming: overslaan.
      }
      out.push({ depth, title: it.title, page })
      await walk(it.items ?? null, depth + 1)
    }
  }
  await walk((await pdf.getOutline()) as Item[] | null, 1)
  return out
}

type Matrix = [number, number, number, number, number, number]
const mul = (a: Matrix, b: number[]): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]

async function leesPagina(pdf: PdfDocument, n: number, metAfbeeldingen: boolean): Promise<PdfPage> {
  const pdfjs = await laadPdfjs()
  const page = await pdf.getPage(n)
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const texts: PdfText[] = []
  for (const item of tc.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const [x, y] = vp.convertToViewportPoint(item.transform[4], item.transform[5])
    texts.push({ s: item.str, x, y, w: item.width, h: item.height })
  }
  const images: PdfBox[] = []
  if (metAfbeeldingen) {
    // Positie van elke afbeelding = de transformatiematrix op het moment van
    // tekenen, toegepast op het eenheidsvierkant.
    const ol = await page.getOperatorList()
    const { OPS } = pdfjs
    let ctm: Matrix = [1, 0, 0, 1, 0, 0]
    const stack: Matrix[] = []
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i]
      if (fn === OPS.save) stack.push(ctm)
      else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      else if (fn === OPS.transform) ctm = mul(ctm, ol.argsArray[i] as number[])
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) =>
          vp.convertToViewportPoint(ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5])
        )
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        images.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
      }
    }
  }
  page.cleanup()
  return { n, w: vp.width, h: vp.height, texts, images }
}

export async function leesCatalogus(
  pdf: PdfDocument,
  onVoortgang: (v: Voortgang) => void
): Promise<{ outline: OutlineEntry[]; pages: Map<number, PdfPage> }> {
  onVoortgang({ stap: 'Inhoudsopgave lezen', klaar: 0, totaal: 1 })
  const outline = await leesOutline(pdf)
  const { tekst, afbeeldingen } = benodigdePaginas(outline, pdf.numPages)
  const metAfb = new Set(afbeeldingen)
  const pages = new Map<number, PdfPage>()
  for (let i = 0; i < tekst.length; i++) {
    pages.set(tekst[i], await leesPagina(pdf, tekst[i], metAfb.has(tekst[i])))
    if (i % 5 === 0) onVoortgang({ stap: "Pagina's lezen", klaar: i + 1, totaal: tekst.length })
  }
  return { outline, pages }
}

// Knipt de stalen uit; per pagina één keer renderen.
const SCALE = 3

export async function knipStalen(
  pdf: PdfDocument,
  refs: ImageRef[],
  onVoortgang: (v: Voortgang) => void
): Promise<Map<ImageRef, Blob>> {
  const out = new Map<ImageRef, Blob>()
  const perPagina = new Map<number, ImageRef[]>()
  for (const r of refs) perPagina.set(r.page, [...(perPagina.get(r.page) ?? []), r])
  let klaar = 0
  for (const [n, lijst] of perPagina) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas niet beschikbaar in deze browser')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    for (const ref of lijst) {
      const b = ref.box
      const w = Math.max(1, Math.round(b.w * SCALE))
      const h = Math.max(1, Math.round(b.h * SCALE))
      const knip = document.createElement('canvas')
      knip.width = w
      knip.height = h
      knip.getContext('2d')!.drawImage(canvas, Math.round(b.x * SCALE), Math.round(b.y * SCALE), w, h, 0, 0, w, h)
      const blob = await new Promise<Blob | null>((resolve) => knip.toBlob(resolve, 'image/webp', 0.85))
      if (blob) out.set(ref, blob)
      klaar++
    }
    page.cleanup()
    onVoortgang({ stap: 'Stalen uitknippen', klaar, totaal: refs.length })
  }
  return out
}
