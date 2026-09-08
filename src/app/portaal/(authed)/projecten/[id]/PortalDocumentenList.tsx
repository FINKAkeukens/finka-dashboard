'use client'

import { useState } from 'react'
import { CheckCircle2, FileText } from 'lucide-react'

// Documenten die staff zichtbaar heeft gemaakt (zie het oogje op het
// Documenten-tabblad). Zowel automatisch bewaarde offerte-PDF's als zelf
// geüploade bestanden — voor de klant is dat hetzelfde, alleen het `kind`
// bepaalt welk id de akkoord-route krijgt. Sommige vragen om een officieel
// akkoord; de klant tekent daarvoor via /api/portaal/documenten/akkoord
// (nooit rechtstreeks naar Supabase vanuit de klant-browser).
export interface PortalDocumentRow {
  kind: 'download' | 'document'
  id: string
  name: string
  url: string
  date: string
  approval_required: boolean
  approved_at: string | null
}

export default function PortalDocumentenList({ documents: initialDocuments }: { documents: PortalDocumentRow[] }) {
  const [documents, setDocuments] = useState<PortalDocumentRow[]>(initialDocuments)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function approve(d: PortalDocumentRow) {
    const confirmed = window.confirm(
      `Ga je akkoord met "${d.name}"? Dit wordt geregistreerd als officieel akkoord.`
    )
    if (!confirmed) return

    setError('')
    setApprovingId(d.id)
    try {
      const res = await fetch('/api/portaal/documenten/akkoord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d.kind === 'download' ? { downloadId: d.id } : { documentId: d.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Akkoord geven mislukt')
        return
      }
      setDocuments((prev) => prev.map((x) => (x.id === d.id ? { ...x, approved_at: data.approved_at } : x)))
    } catch {
      setError('Akkoord geven mislukt')
    } finally {
      setApprovingId(null)
    }
  }

  if (!documents.length) {
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
        {documents.map((d) => (
          <div key={`${d.kind}-${d.id}`} className="flex items-center gap-2.5 px-5 py-3 text-sm">
            <FileText size={14} className="text-[#6B6560] shrink-0" />
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-[#1C1B19] hover:underline"
            >
              {d.name}
            </a>
            <span className="text-xs text-[#9A948D] shrink-0">
              {new Date(d.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
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
