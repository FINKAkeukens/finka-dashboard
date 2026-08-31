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

export default function DownloadButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch(`/api/offerte/${projectId}/pdf`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(`PDF-download mislukt: ${body.error ?? res.statusText}`)
        return
      }
      const filename = filenameFromContentDisposition(res.headers.get('Content-Disposition')) ?? `offerte-${projectId}.pdf`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
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
