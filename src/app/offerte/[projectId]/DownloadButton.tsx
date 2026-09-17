'use client'

import { useState } from 'react'

// Leest de bestandsnaam die de server heeft opgebouwd (zie
// contentDispositionHeader in /api/offerte/[projectId]/pdf/route.ts) uit de
// Content-Disposition-header, zodat de browser 'm ook echt zo opslaat i.p.v.
// een generieke "offerte-<id>.pdf". filename* (UTF-8) heeft voorrang op de
// ASCII-only filename-variant.
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      // val door naar de ASCII-variant hieronder
    }
  }
  const asciiMatch = header.match(/filename="([^"]+)"/i)
  return asciiMatch ? asciiMatch[1] : null
}

// Haalt een PDF op bij `endpoint` en start de download in de browser onder
// de bestandsnaam die de server meegeeft (of `fallbackFilename` als die
// ontbreekt). Gedeeld tussen de offerte zelf en — indien aangevinkt — de
// aansluitschema-bijlage, zodat beide als losse bestanden gedownload worden.
async function downloadFromEndpoint(endpoint: string, fallbackFilename: string): Promise<string | null> {
  const res = await fetch(endpoint)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return body.error ?? res.statusText
  }
  const filename = filenameFromContentDisposition(res.headers.get('Content-Disposition')) ?? fallbackFilename
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return null
}

export default function DownloadButton({
  projectId,
  includeAansluitschemaBijlage,
}: {
  projectId: string
  includeAansluitschemaBijlage?: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const error = await downloadFromEndpoint(`/api/offerte/${projectId}/pdf`, `offerte-${projectId}.pdf`)
      if (error) {
        alert(`PDF-download mislukt: ${error}`)
        return
      }
      if (includeAansluitschemaBijlage) {
        const bijlageError = await downloadFromEndpoint(
          `/api/offerte/${projectId}/bijlage-aansluitschema/pdf`,
          `Bijlage-aansluitschema-${projectId}.pdf`
        )
        if (bijlageError) {
          alert(`Download van de bijlage is mislukt: ${bijlageError}`)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="px-5 py-2.5 border border-[#1C1B19] text-[#1C1B19] text-sm rounded-lg hover:bg-[#F7F5F2] transition-colors disabled:opacity-50"
    >
      {loading ? 'PDF maken...' : 'Download PDF'}
    </button>
  )
}
