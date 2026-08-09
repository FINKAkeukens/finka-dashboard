'use client'

import { useState } from 'react'

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
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `offerte-${projectId}.pdf`
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
