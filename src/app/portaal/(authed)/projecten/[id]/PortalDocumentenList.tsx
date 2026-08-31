'use client'

import { useState } from 'react'
import { CheckCircle2, FileText } from 'lucide-react'
import type { QuoteDownload } from '@/lib/types'

// Documenten die staff zichtbaar heeft gemaakt (zie het oogje op het
// Documenten-tabblad). Sommige vragen daarnaast een officieel akkoord — de
// klant tekent daar hier voor, via /api/portaal/documenten/akkoord (nooit
// rechtstreeks naar Supabase vanuit de klant-browser, zelfde model als de
// vragenlijst).
export default function PortalDocumentenList({ downloads: initialDownloads }: { downloads: QuoteDownload[] }) {
  const [downloads, setDownloads] = useState<QuoteDownload[]>(initialDownloads)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function approve(d: QuoteDownload) {
    const confirmed = window.confirm(
      `Ga je akkoord met "${d.filename ?? 'dit document'}"? Dit wordt geregistreerd als officieel akkoord.`
    )
    if (!confirmed) return

    setError('')
    setApprovingId(d.id)
    try {
      const res = await fetch('/api/portaal/documenten/akkoord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadId: d.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Akkoord geven mislukt')
        return
      }
      setDownloads((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, approved_at: data.approved_at, approved_by: data.approved_by } : x))
      )
    } catch {
      setError('Akkoord geven mislukt')
    } finally {
      setApprovingId(null)
    }
  }

  if (!downloads.length) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 text-center">
        Nog geen documenten beschikbaar.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
        {downloads.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5 px-5 py-3 text-sm">
            <FileText size={14} className="text-[#6B6560] shrink-0" />
            <a
              href={d.pdf_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-[#1C1B19] hover:underline"
            >
              {d.filename ?? 'Offerte'}.pdf
            </a>
            <span className="text-xs text-[#9A948D] shrink-0">
              {new Date(d.downloaded_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {d.approval_required && (
              d.approved_at ? (
                <span className="flex items-center gap-1 text-xs text-[#3F7D4F] shrink-0" title={new Date(d.approved_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}>
                  <CheckCircle2 size={13} />
                  Akkoord op {new Date(d.approved_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : (
                <button
                  onClick={() => approve(d)}
                  disabled={approvingId === d.id}
                  className="text-xs px-3 py-1.5 rounded-full bg-[#1C1B19] text-white hover:bg-[#3d3a37] transition-colors disabled:opacity-50 shrink-0"
                >
                  {approvingId === d.id ? 'Bezig...' : 'Akkoord geven'}
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
