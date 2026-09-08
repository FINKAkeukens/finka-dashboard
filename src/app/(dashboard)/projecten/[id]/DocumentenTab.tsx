'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Clock, Eye, EyeOff, FileSignature, FileText, Trash2, Upload } from 'lucide-react'
import type { ProjectDocument, QuoteDownload } from '@/lib/types'

// Twee soorten documenten in één lijst: automatisch bewaarde offerte-PDF's
// (finka_quote_downloads, ontstaan bij het downloaden van een offerte) en
// zelf geüploade bestanden (finka_project_documents). Ze staan in dezelfde
// tabel omdat het voor de gebruiker allebei gewoon "documenten bij dit
// project" zijn — alleen de herkomst en de bewerkbaarheid verschillen:
// een offerte-download kun je niet verwijderen (die hoort bij de historie
// van een offerteversie), een eigen upload wel.
type Row = {
  key: string
  kind: 'download' | 'document'
  id: string
  name: string
  url: string | null
  date: string
  by: string | null
  visible_to_customer: boolean
  approval_required: boolean
  approved_at: string | null
  approved_by: string | null
}

function toRows(downloads: QuoteDownload[], documents: ProjectDocument[]): Row[] {
  const rows: Row[] = [
    ...downloads.map((d) => ({
      key: `download-${d.id}`,
      kind: 'download' as const,
      id: d.id,
      // filename is null bij downloads van vóór deze functionaliteit.
      name: `${d.filename ?? 'Offerte'}.pdf`,
      url: d.pdf_url,
      date: d.downloaded_at,
      by: d.downloaded_by,
      visible_to_customer: d.visible_to_customer,
      approval_required: d.approval_required,
      approved_at: d.approved_at,
      approved_by: d.approved_by,
    })),
    ...documents.map((d) => ({
      key: `document-${d.id}`,
      kind: 'document' as const,
      id: d.id,
      name: d.filename,
      url: d.file_url,
      date: d.uploaded_at,
      by: d.uploaded_by,
      visible_to_customer: d.visible_to_customer,
      approval_required: d.approval_required,
      approved_at: d.approved_at,
      approved_by: d.approved_by,
    })),
  ]
  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export default function DocumentenTab({
  projectId,
  downloads: initialDownloads,
  documents: initialDocuments,
}: {
  projectId: string
  downloads: QuoteDownload[]
  documents: ProjectDocument[]
}) {
  const supabase = createClient()
  const [downloads, setDownloads] = useState<QuoteDownload[]>(initialDownloads)
  const [documents, setDocuments] = useState<ProjectDocument[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const rows = toRows(downloads, documents)

  async function update(row: Row, patch: { visible_to_customer?: boolean; approval_required?: boolean }) {
    if (row.kind === 'download') {
      setDownloads((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...patch } : x)))
    } else {
      setDocuments((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...patch } : x)))
    }
    const table = row.kind === 'download' ? 'finka_quote_downloads' : 'finka_project_documents'
    const { error: updError } = await supabase.from(table).update(patch).eq('id', row.id)
    if (updError) setError(updError.message)
  }

  function toggleVisible(row: Row) {
    update(row, { visible_to_customer: !row.visible_to_customer })
  }

  function toggleApprovalRequired(row: Row) {
    const approval_required = !row.approval_required
    // Een document dat om akkoord vraagt moet de klant ook kunnen zíen —
    // anders zou het nooit geaccordeerd kunnen worden.
    update(row, approval_required && !row.visible_to_customer
      ? { approval_required, visible_to_customer: true }
      : { approval_required })
  }

  async function uploadDocument(file: File) {
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)
      const res = await fetch('/api/projecten/documenten/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Uploaden mislukt')
        return
      }
      setDocuments((prev) => [data.document as ProjectDocument, ...prev])
    } catch {
      setError('Uploaden mislukt')
    } finally {
      setUploading(false)
    }
  }

  async function removeDocument(row: Row) {
    if (!confirm(`"${row.name}" verwijderen?`)) return
    setDocuments((prev) => prev.filter((x) => x.id !== row.id))
    const { error: delError } = await supabase.from('finka_project_documents').delete().eq('id', row.id)
    if (delError) setError(delError.message)
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-[#DDD8D2] bg-white px-4 py-2 text-sm text-[#1C1B19] transition-colors hover:border-[#C9A96E]">
        <Upload size={14} />
        {uploading ? 'Bezig met uploaden...' : 'Document toevoegen'}
        <input
          type="file"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadDocument(file)
            e.target.value = ''
          }}
        />
      </label>

      {!rows.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Nog geen documenten voor dit project.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
          {rows.map((row) => (
            <div key={row.key} className="px-5 py-3.5 text-sm space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={16} className="text-[#6B6560] shrink-0" />
                  {row.url ? (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#1C1B19] hover:underline truncate"
                    >
                      {row.name}
                    </a>
                  ) : (
                    <span className="font-medium text-[#9A948D] truncate">{row.name} (niet meer beschikbaar)</span>
                  )}
                  {row.kind === 'download' && (
                    <span className="shrink-0 rounded-full bg-[#F0EDE9] px-2 py-0.5 text-xs text-[#6B6560]">Offerte</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-[#1C1B19]">
                      {new Date(row.date).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-[#9A948D]">{row.by ?? 'Onbekend'}</p>
                  </div>
                  <button
                    onClick={() => toggleVisible(row)}
                    disabled={!row.url}
                    title={
                      !row.url
                        ? 'Bestand niet meer beschikbaar — kan niet zichtbaar gemaakt worden'
                        : row.visible_to_customer
                          ? 'Zichtbaar in klantenportaal — klik om te verbergen'
                          : 'Verborgen voor klant — klik om te tonen in klantenportaal'
                    }
                    className="disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {row.visible_to_customer ? (
                      <Eye size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
                    ) : (
                      <EyeOff size={14} className="text-[#C9A96E]" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleApprovalRequired(row)}
                    disabled={!row.url}
                    title={
                      !row.url
                        ? 'Bestand niet meer beschikbaar'
                        : row.approval_required
                          ? 'Klant moet dit document accorderen — klik om dat niet meer te vereisen'
                          : 'Klik om te vereisen dat de klant dit document officieel accordeert in het portaal'
                    }
                    className="disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <FileSignature size={14} className={row.approval_required ? 'text-[#C9A96E]' : 'text-[#9A948D] hover:text-[#1C1B19]'} />
                  </button>
                  {/* Offerte-downloads horen bij de historie van een
                      offerteversie en blijven dus staan; eigen uploads zijn
                      wel te verwijderen. */}
                  {row.kind === 'document' && (
                    <button onClick={() => removeDocument(row)} title="Document verwijderen">
                      <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  )}
                </div>
              </div>

              {row.approval_required && (
                <div className="pl-[26px]">
                  {row.approved_at ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[#3F7D4F]">
                      <CheckCircle2 size={12} />
                      Akkoord gegeven door {row.approved_by ?? 'klant'} op{' '}
                      {new Date(row.approved_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-[#C9A96E]">
                      <Clock size={12} />
                      Wacht op akkoord van de klant
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
