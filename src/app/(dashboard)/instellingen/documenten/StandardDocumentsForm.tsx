'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { amsterdamDate, AUDIENCE_LABELS, seriesId } from '@/lib/standard-documents'
import type { StandardDocument, StandardDocumentAudience } from '@/lib/types'
import { fileHref } from '@/lib/storage-url'

const BUCKET = 'project-documenten'

const selectClass =
  'px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'
const inputClass =
  'w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Versies van één document, nieuwste ingangsdatum bovenaan (NULL = vanaf
// het begin, dus onderaan).
function sortVersions(versions: StandardDocument[]) {
  return [...versions].sort((a, b) => (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))
}

// Welke versie een klant zónder akkoord vandaag ziet — zelfde regel als
// standardDocumentsFor, maar los van het klanttype.
function currentVersionId(versions: StandardDocument[], today: string) {
  const valid = sortVersions(versions).filter((v) => v.active && (!v.valid_from || v.valid_from <= today))
  return valid[0]?.id ?? null
}

// Documenten zijn gegroepeerd per reeks (series_id): elke nieuwe versie van
// bv. de algemene voorwaarden komt naast de vorige te staan met een eigen
// ingangsdatum. Klanten die al akkoord gaven, houden de versie die gold op
// de dag van hun akkoord (zie standardDocumentsFor).
//
// Wijzigingen worden direct opgeslagen (titel bij verlaten van het veld,
// de rest bij klikken/kiezen). Uploads gaan rechtstreeks vanuit de browser
// naar Supabase Storage — niet via een API-route, vanwege de harde ~4,5MB-
// limiet van Vercel Functions (zie DocumentenTab.tsx).
export default function StandardDocumentsForm({ documents: initial }: { documents: StandardDocument[] }) {
  const supabase = createClient()
  const today = amsterdamDate(new Date())
  const [documents, setDocuments] = useState<StandardDocument[]>(initial)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newAudience, setNewAudience] = useState<StandardDocumentAudience>('iedereen')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  // "Nieuwe versie"-formulier, open bij hooguit één reeks tegelijk.
  const [versionSeries, setVersionSeries] = useState<string | null>(null)
  const [versionTitle, setVersionTitle] = useState('')
  const [versionDate, setVersionDate] = useState(today)
  const [versionFile, setVersionFile] = useState<File | null>(null)

  const seriesList = Array.from(
    documents.reduce((map, d) => map.set(seriesId(d), [...(map.get(seriesId(d)) ?? []), d]), new Map<string, StandardDocument[]>())
  )
    .map(([id, versions]) => ({ id, versions: sortVersions(versions), sortOrder: Math.min(...versions.map((v) => v.sort_order)) }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

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

  // "Voor wie" geldt voor de hele reeks: een B2C-versie en een B2B-versie
  // van de voorwaarden zijn twee aparte documenten, geen versies.
  async function updateSeriesAudience(series: string, audience: StandardDocumentAudience) {
    setDocuments((prev) => prev.map((d) => (seriesId(d) === series ? { ...d, audience } : d)))
    const { error: updError } = await supabase.from('finka_standard_documents').update({ audience }).eq('series_id', series)
    if (updError) setError(updError.message)
  }

  // Ook per reeks: een nieuwe versie van de voorwaarden moet net zo goed
  // bovenaan het portaal staan als de vorige.
  async function updateSeriesFeatured(series: string, featured: boolean) {
    setDocuments((prev) => prev.map((d) => (seriesId(d) === series ? { ...d, featured } : d)))
    const { error: updError } = await supabase.from('finka_standard_documents').update({ featured }).eq('series_id', series)
    if (updError) setError(updError.message)
  }

  async function insertDocument(file: File, fields: Partial<StandardDocument>) {
    const { path, url } = await uploadFile(file)
    const { data, error: insertError } = await supabase
      .from('finka_standard_documents')
      .insert({
        ...fields,
        filename: file.name,
        file_url: url,
        storage_path: path,
        updated_by: await currentUserEmail(),
      })
      .select()
      .single()
    if (insertError) {
      await removeFile(path)
      throw new Error(insertError.message)
    }
    setDocuments((prev) => [...prev, data as StandardDocument])
  }

  async function addDocument(e: React.FormEvent) {
    e.preventDefault()
    if (!newFile) return
    setAdding(true)
    setError('')
    try {
      await insertDocument(newFile, {
        title: newTitle.trim() || newFile.name.replace(/\.[^.]+$/, ''),
        audience: newAudience,
        sort_order: documents.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1,
      })
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

  function openVersionForm(series: { id: string; versions: StandardDocument[] }) {
    setVersionSeries(series.id)
    setVersionTitle(series.versions[0].title)
    setVersionDate(today)
    setVersionFile(null)
  }

  async function addVersion(e: React.FormEvent, series: { id: string; versions: StandardDocument[]; sortOrder: number }) {
    e.preventDefault()
    if (!versionFile) return
    setAdding(true)
    setError('')
    try {
      await insertDocument(versionFile, {
        title: versionTitle.trim() || versionFile.name.replace(/\.[^.]+$/, ''),
        audience: series.versions[0].audience,
        featured: series.versions[0].featured,
        sort_order: series.sortOrder,
        series_id: series.id,
        valid_from: versionDate || today,
      })
      setVersionSeries(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieuwe versie toevoegen mislukt')
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

  async function removeDocument(doc: StandardDocument, isOnlyVersion: boolean) {
    const message = isOnlyVersion
      ? `"${doc.title}" verwijderen? Het verdwijnt dan bij alle klanten uit het portaal.`
      : `Versie "${doc.title}" verwijderen? Klanten die akkoord gaven toen deze versie gold, zien dan een andere versie.`
    if (!confirm(message)) return
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
    if (other < 0 || other >= seriesList.length) return
    const reordered = [...seriesList]
    ;[reordered[index], reordered[other]] = [reordered[other], reordered[index]]
    const orderBySeries = new Map(reordered.map((s, i) => [s.id, i]))
    setDocuments((prev) => prev.map((d) => ({ ...d, sort_order: orderBySeries.get(seriesId(d)) ?? d.sort_order })))
    // Alle reeksen opnieuw nummeren (het zijn er maar een paar), zodat gaten
    // na een verwijdering de volgorde niet kunnen verstoren.
    const results = await Promise.all(
      reordered.map((s, i) => supabase.from('finka_standard_documents').update({ sort_order: i }).eq('series_id', s.id))
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) setError(failed.error.message)
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {!seriesList.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-12 px-6 text-center space-y-1">
          <p className="text-sm text-[#6B6560]">Nog geen standaarddocumenten.</p>
          <p className="text-xs text-[#9A948D]">
            Tip: voeg de algemene voorwaarden twee keer toe — de B2C-versie met &quot;Alleen consumenten&quot; en de
            B2B-versie met &quot;Alleen bedrijven&quot; — en de onderhoudsinstructies met &quot;Alle klanten&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {seriesList.map((series, index) => {
            const currentId = currentVersionId(series.versions, today)
            return (
              <div key={series.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-[#F7F5F2] border-b border-[#DDD8D2]">
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
                      disabled={index === seriesList.length - 1}
                      title="Omlaag"
                      className="text-[#9A948D] hover:text-[#1C1B19] disabled:opacity-30"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                  <span className="flex-1 text-xs text-[#6B6560]">
                    {series.versions.length === 1 ? '1 versie' : `${series.versions.length} versies`}
                  </span>
                  <label
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-[#1C1B19]"
                    title="Direct zichtbaar bij het openen van het portaal, boven de tabbladen, met een downloadknop"
                  >
                    <input
                      type="checkbox"
                      checked={!!series.versions[0].featured}
                      onChange={(e) => updateSeriesFeatured(series.id, e.target.checked)}
                      className="accent-[#1C1B19]"
                    />
                    Bovenaan in portaal
                  </label>
                  <select
                    value={series.versions[0].audience}
                    onChange={(e) => updateSeriesAudience(series.id, e.target.value as StandardDocumentAudience)}
                    className={`${selectClass} shrink-0`}
                    aria-label="Voor wie"
                  >
                    {(Object.keys(AUDIENCE_LABELS) as StandardDocumentAudience[]).map((a) => (
                      <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => (versionSeries === series.id ? setVersionSeries(null) : openVersionForm(series))}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-[#DDD8D2] bg-white px-3 py-2 text-sm text-[#1C1B19] hover:border-[#C9A96E]"
                  >
                    <Plus size={14} />
                    Nieuwe versie
                  </button>
                </div>

                {versionSeries === series.id && (
                  <form onSubmit={(e) => addVersion(e, series)} className="px-5 py-4 space-y-3 border-b border-[#DDD8D2] bg-[#FBF8F2]">
                    <p className="text-xs text-[#6B6560]">
                      De nieuwe versie geldt vanaf de ingangsdatum. Klanten die vóór die datum akkoord gaven op hun
                      offerte, blijven de huidige versie zien.
                    </p>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <input
                        value={versionTitle}
                        onChange={(e) => setVersionTitle(e.target.value)}
                        placeholder="Titel, bv. Algemene voorwaarden consumenten (2027-1)"
                        className={inputClass}
                      />
                      <label className="flex items-center gap-2 text-sm text-[#6B6560]">
                        Geldig vanaf
                        <input
                          type="date"
                          value={versionDate}
                          onChange={(e) => setVersionDate(e.target.value)}
                          className={selectClass}
                          required
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        onChange={(e) => setVersionFile(e.target.files?.[0] ?? null)}
                        className="flex-1 text-sm text-[#6B6560] file:mr-3 file:rounded-lg file:border file:border-[#DDD8D2] file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-[#1C1B19]"
                      />
                      <button
                        type="submit"
                        disabled={!versionFile || adding}
                        className="flex items-center gap-1.5 rounded-lg bg-[#1C1B19] px-4 py-2 text-sm text-white transition-colors hover:bg-[#3d3a37] disabled:opacity-40"
                      >
                        <Upload size={14} />
                        {adding ? 'Bezig met uploaden...' : 'Versie toevoegen'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="divide-y divide-[#DDD8D2]">
                  {series.versions.map((doc) => {
                    const status =
                      doc.id === currentId
                        ? { label: 'Actueel', className: 'bg-[#E6F0E8] text-[#3F7D4F]' }
                        : doc.valid_from && doc.valid_from > today
                          ? { label: `Gaat in op ${formatDate(doc.valid_from)}`, className: 'bg-[#F3ECDD] text-[#8A6D3B]' }
                          : !doc.active
                            ? { label: 'Verborgen', className: 'bg-[#F0EDE9] text-[#9A948D]' }
                            : { label: 'Eerdere versie', className: 'bg-[#F0EDE9] text-[#6B6560]' }
                    return (
                      <div key={doc.id} className={`px-5 py-4 space-y-3 ${doc.active ? '' : 'bg-[#FAF9F7]'}`}>
                        <div className="flex items-center gap-3">
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
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${status.className}`}>
                            {status.label}
                          </span>
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
                          <button onClick={() => removeDocument(doc, series.versions.length === 1)} title="Verwijderen" className="shrink-0">
                            <Trash2 size={15} className="text-[#9A948D] hover:text-red-600" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B6560]">
                          <label className="flex items-center gap-1.5">
                            Geldig vanaf
                            <input
                              type="date"
                              value={doc.valid_from ?? ''}
                              onChange={(e) => update(doc.id, { valid_from: e.target.value || null })}
                              className="rounded-md border border-[#DDD8D2] bg-white px-2 py-1 text-xs text-[#1C1B19]"
                              aria-label="Geldig vanaf"
                            />
                            {!doc.valid_from && <span className="text-[#9A948D]">(altijd)</span>}
                          </label>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <FileText size={13} className="shrink-0" />
                            <a href={fileHref(doc.file_url)} target="_blank" rel="noopener noreferrer" className="truncate hover:underline text-[#1C1B19]">
                              {doc.filename}
                            </a>
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
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={addDocument} className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-[#1C1B19]">Nieuw document toevoegen</h2>
          <p className="text-xs text-[#9A948D] mt-0.5">
            Voor een nieuwe versie van een bestaand document (bv. bijgewerkte voorwaarden) gebruik je &quot;Nieuwe
            versie&quot; bij dat document.
          </p>
        </div>
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
