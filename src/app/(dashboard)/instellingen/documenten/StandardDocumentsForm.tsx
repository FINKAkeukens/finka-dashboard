'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, RefreshCw, Trash2, Upload } from 'lucide-react'
import { AUDIENCE_LABELS } from '@/lib/standard-documents'
import type { StandardDocument, StandardDocumentAudience } from '@/lib/types'
import { fileHref } from '@/lib/storage-url'

const BUCKET = 'project-documenten'

const selectClass =
  'px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'
const inputClass =
  'w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

// Wijzigingen worden direct opgeslagen (titel bij verlaten van het veld,
// de rest bij klikken/kiezen). Uploads gaan rechtstreeks vanuit de browser
// naar Supabase Storage — niet via een API-route, vanwege de harde ~4,5MB-
// limiet van Vercel Functions (zie DocumentenTab.tsx).
export default function StandardDocumentsForm({ documents: initial }: { documents: StandardDocument[] }) {
  const supabase = createClient()
  const [documents, setDocuments] = useState<StandardDocument[]>(initial)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newAudience, setNewAudience] = useState<StandardDocumentAudience>('iedereen')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  async function uploadFile(file: File) {
    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
    const path = `standaard/${crypto.randomUUID()}${extension}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (uploadError) throw new Error(uploadError.message)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { path, url: data.publicUrl }
  }

  // Best-effort: een achtergebleven oud bestand is geen ramp, dus een fout
  // hier mag het vervangen/verwijderen niet tegenhouden. Via een API-route,
  // zie de uitleg daar.
  async function removeFile(path: string | null) {
    if (!path) return
    try {
      await fetch('/api/instellingen/standaarddocumenten/bestand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    } catch {}
  }

  async function currentUserEmail() {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? null
  }

  async function update(id: string, patch: Partial<StandardDocument>) {
    const full = { ...patch, updated_at: new Date().toISOString() }
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...full } : d)))
    const { error: updError } = await supabase.from('finka_standard_documents').update(full).eq('id', id)
    if (updError) setError(updError.message)
  }

  async function addDocument(e: React.FormEvent) {
    e.preventDefault()
    if (!newFile) return
    setAdding(true)
    setError('')
    try {
      const { path, url } = await uploadFile(newFile)
      const title = newTitle.trim() || newFile.name.replace(/\.[^.]+$/, '')
      const sortOrder = documents.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1
      const { data, error: insertError } = await supabase
        .from('finka_standard_documents')
        .insert({
          title,
          audience: newAudience,
          filename: newFile.name,
          file_url: url,
          storage_path: path,
          sort_order: sortOrder,
          updated_by: await currentUserEmail(),
        })
        .select()
        .single()
      if (insertError) {
        await removeFile(path)
        throw new Error(insertError.message)
      }
      setDocuments((prev) => [...prev, data as StandardDocument])
      setNewTitle('')
      setNewAudience('iedereen')
      setNewFile(null)
      setFileInputKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toevoegen mislukt')
    } finally {
      setAdding(false)
    }
  }

  async function replaceFile(doc: StandardDocument, file: File) {
    setBusyId(doc.id)
    setError('')
    try {
      const { path, url } = await uploadFile(file)
      await update(doc.id, { filename: file.name, file_url: url, storage_path: path, updated_by: await currentUserEmail() })
      await removeFile(doc.storage_path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vervangen mislukt')
    } finally {
      setBusyId(null)
    }
  }

  async function removeDocument(doc: StandardDocument) {
    if (!confirm(`"${doc.title}" verwijderen? Het verdwijnt dan bij alle klanten uit het portaal.`)) return
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    const { error: delError } = await supabase.from('finka_standard_documents').delete().eq('id', doc.id)
    if (delError) {
      setError(delError.message)
      return
    }
    await removeFile(doc.storage_path)
  }

  async function move(index: number, direction: -1 | 1) {
    const other = index + direction
    if (other < 0 || other >= documents.length) return
    const reordered = [...documents]
    ;[reordered[index], reordered[other]] = [reordered[other], reordered[index]]
    const withOrder = reordered.map((d, i) => ({ ...d, sort_order: i }))
    setDocuments(withOrder)
    // Alle rijen opnieuw nummeren (het zijn er maar een paar), zodat gaten
    // na een verwijdering de volgorde niet kunnen verstoren.
    const results = await Promise.all(
      withOrder.map((d) =>
        supabase.from('finka_standard_documents').update({ sort_order: d.sort_order }).eq('id', d.id)
      )
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) setError(failed.error.message)
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {!documents.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-12 px-6 text-center space-y-1">
          <p className="text-sm text-[#6B6560]">Nog geen standaarddocumenten.</p>
          <p className="text-xs text-[#9A948D]">
            Tip: voeg de algemene voorwaarden twee keer toe — de B2C-versie met &quot;Alleen consumenten&quot; en de
            B2B-versie met &quot;Alleen bedrijven&quot; — en de onderhoudsinstructies met &quot;Alle klanten&quot;.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
          {documents.map((doc, index) => (
            <div key={doc.id} className={`px-5 py-4 space-y-3 ${doc.active ? '' : 'bg-[#FAF9F7]'}`}>
              <div className="flex items-center gap-3">
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Omhoog"
                    className="text-[#9A948D] hover:text-[#1C1B19] disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === documents.length - 1}
                    title="Omlaag"
                    className="text-[#9A948D] hover:text-[#1C1B19] disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
                <input
                  defaultValue={doc.title}
                  onBlur={(e) => {
                    const title = e.target.value.trim()
                    if (!title) {
                      e.target.value = doc.title
                      return
                    }
                    if (title !== doc.title) update(doc.id, { title })
                  }}
                  className={`${inputClass} font-medium ${doc.active ? '' : 'text-[#9A948D]'}`}
                  aria-label="Titel"
                />
                <select
                  value={doc.audience}
                  onChange={(e) => update(doc.id, { audience: e.target.value as StandardDocumentAudience })}
                  className={`${selectClass} shrink-0`}
                  aria-label="Voor wie"
                >
                  {(Object.keys(AUDIENCE_LABELS) as StandardDocumentAudience[]).map((a) => (
                    <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                  ))}
                </select>
                <button
                  onClick={() => update(doc.id, { active: !doc.active })}
                  title={doc.active ? 'Zichtbaar in het portaal — klik om tijdelijk te verbergen' : 'Verborgen — klik om weer te tonen in het portaal'}
                  className="shrink-0"
                >
                  {doc.active ? (
                    <Eye size={15} className="text-[#9A948D] hover:text-[#1C1B19]" />
                  ) : (
                    <EyeOff size={15} className="text-[#C9A96E]" />
                  )}
                </button>
                <button onClick={() => removeDocument(doc)} title="Verwijderen" className="shrink-0">
                  <Trash2 size={15} className="text-[#9A948D] hover:text-red-600" />
                </button>
              </div>
              <div className="flex items-center gap-3 pl-[25px] text-xs text-[#6B6560]">
                <FileText size={13} className="shrink-0" />
                <a href={fileHref(doc.file_url)} target="_blank" rel="noopener noreferrer" className="truncate hover:underline text-[#1C1B19]">
                  {doc.filename}
                </a>
                <span className="text-[#9A948D] shrink-0">
                  bijgewerkt {new Date(doc.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {doc.updated_by ? ` door ${doc.updated_by}` : ''}
                </span>
                <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 text-[#6B6560] hover:text-[#1C1B19]">
                  <RefreshCw size={12} className={busyId === doc.id ? 'animate-spin' : ''} />
                  {busyId === doc.id ? 'Bezig...' : 'Bestand vervangen'}
                  <input
                    type="file"
                    className="hidden"
                    disabled={busyId === doc.id}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) replaceFile(doc, file)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addDocument} className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Document toevoegen</h2>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Titel, bv. Algemene voorwaarden (consumenten)"
            className={inputClass}
          />
          <select
            value={newAudience}
            onChange={(e) => setNewAudience(e.target.value as StandardDocumentAudience)}
            className={selectClass}
          >
            {(Object.keys(AUDIENCE_LABELS) as StandardDocumentAudience[]).map((a) => (
              <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <input
            key={fileInputKey}
            type="file"
            onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-sm text-[#6B6560] file:mr-3 file:rounded-lg file:border file:border-[#DDD8D2] file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-[#1C1B19]"
          />
          <button
            type="submit"
            disabled={!newFile || adding}
            className="flex items-center gap-1.5 rounded-lg bg-[#1C1B19] px-4 py-2 text-sm text-white transition-colors hover:bg-[#3d3a37] disabled:opacity-40"
          >
            <Upload size={14} />
            {adding ? 'Bezig met uploaden...' : 'Toevoegen'}
          </button>
        </div>
      </form>
    </div>
  )
}
