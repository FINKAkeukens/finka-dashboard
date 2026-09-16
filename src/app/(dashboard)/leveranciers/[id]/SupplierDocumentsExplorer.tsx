'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, File, Folder, FolderPlus, Trash2, Upload } from 'lucide-react'
import type { SupplierDocument, SupplierFolder } from '@/lib/types'

// Interne drag van een documentkaart naar een map draagt het document-id mee
// via een eigen dataTransfer-type. Een drag van bestanden vanaf het bureau-
// blad heeft altijd het type "Files" — zo onderscheiden onDrop-handlers een
// interne verplaatsing van een externe upload.
const DOC_DRAG_TYPE = 'application/x-finka-supplier-document'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SupplierDocumentsExplorer({
  supplierId,
  initialFolders,
  initialDocuments,
}: {
  supplierId: string
  initialFolders: SupplierFolder[]
  initialDocuments: SupplierDocument[]
}) {
  const supabase = createClient()
  const [folders, setFolders] = useState<SupplierFolder[]>(initialFolders)
  const [documents, setDocuments] = useState<SupplierDocument[]>(initialDocuments)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dropTarget, setDropTarget] = useState<'zone' | string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const breadcrumb = useMemo(() => {
    const chain: SupplierFolder[] = []
    let cursor = currentFolderId
    while (cursor) {
      const folder = folders.find((f) => f.id === cursor)
      if (!folder) break
      chain.unshift(folder)
      cursor = folder.parent_folder_id
    }
    return chain
  }, [folders, currentFolderId])

  const visibleFolders = folders.filter((f) => f.parent_folder_id === currentFolderId)
  const visibleDocuments = documents.filter((d) => d.folder_id === currentFolderId)

  function countInside(folderId: string) {
    return (
      folders.filter((f) => f.parent_folder_id === folderId).length +
      documents.filter((d) => d.folder_id === folderId).length
    )
  }

  async function uploadFiles(files: FileList | File[], targetFolderId: string | null) {
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('supplierId', supplierId)
        if (targetFolderId) formData.append('folderId', targetFolderId)
        const res = await fetch('/api/leveranciers/documenten/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Uploaden mislukt')
          continue
        }
        setDocuments((prev) => [data.document as SupplierDocument, ...prev])
      }
    } finally {
      setUploading(false)
    }
  }

  async function createFolder() {
    const name = window.prompt('Naam van de nieuwe map:')
    if (!name || !name.trim()) return
    const { data, error } = await supabase
      .from('finka_supplier_folders')
      .insert({ supplier_id: supplierId, parent_folder_id: currentFolderId, name: name.trim() })
      .select()
      .single()
    if (error) { setError(error.message); return }
    setFolders((prev) => [...prev, data as SupplierFolder])
  }

  async function deleteFolder(folder: SupplierFolder) {
    if (!confirm(`Map "${folder.name}" en alles erin verwijderen?`)) return
    const { error } = await supabase.from('finka_supplier_folders').delete().eq('id', folder.id)
    if (error) { setError(error.message); return }
    // Cascade gebeurt in de database; hier lokaal ook alle nakomelingen
    // (submappen + documenten, op elke diepte) uit de state halen.
    const removedFolderIds = new Set<string>([folder.id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of folders) {
        if (f.parent_folder_id && removedFolderIds.has(f.parent_folder_id) && !removedFolderIds.has(f.id)) {
          removedFolderIds.add(f.id)
          grew = true
        }
      }
    }
    setFolders((prev) => prev.filter((f) => !removedFolderIds.has(f.id)))
    setDocuments((prev) => prev.filter((d) => !(d.folder_id && removedFolderIds.has(d.folder_id))))
  }

  async function deleteDocument(doc: SupplierDocument) {
    if (!confirm(`"${doc.filename}" verwijderen?`)) return
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    const { error } = await supabase.from('finka_supplier_documents').delete().eq('id', doc.id)
    if (error) setError(error.message)
  }

  async function moveDocument(docId: string, targetFolderId: string | null) {
    setDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, folder_id: targetFolderId } : d)))
    const { error } = await supabase.from('finka_supplier_documents').update({ folder_id: targetFolderId }).eq('id', docId)
    if (error) setError(error.message)
  }

  function handleZoneDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropTarget(null)
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files, currentFolderId)
  }

  function handleFolderDrop(e: React.DragEvent, folder: SupplierFolder) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    if (e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files, folder.id)
      return
    }
    const docId = e.dataTransfer.getData(DOC_DRAG_TYPE)
    if (docId) moveDocument(docId, folder.id)
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 text-sm min-w-0 overflow-x-auto">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={currentFolderId === null ? 'font-medium text-[#1C1B19]' : 'text-[#6B6560] hover:text-[#1C1B19]'}
          >
            Hoofdmap
          </button>
          {breadcrumb.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={13} className="text-[#9A948D]" />
              <button
                onClick={() => setCurrentFolderId(folder.id)}
                className={folder.id === currentFolderId ? 'font-medium text-[#1C1B19]' : 'text-[#6B6560] hover:text-[#1C1B19]'}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={createFolder}
            className="flex items-center gap-1.5 rounded-lg border border-[#DDD8D2] bg-white px-3 py-1.5 text-sm text-[#1C1B19] hover:border-[#C9A96E] transition-colors"
          >
            <FolderPlus size={14} />
            Nieuwe map
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#DDD8D2] bg-white px-3 py-1.5 text-sm text-[#1C1B19] hover:border-[#C9A96E] transition-colors">
            <Upload size={14} />
            {uploading ? 'Bezig...' : 'Document toevoegen'}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files, currentFolderId)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDropTarget('zone') }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={handleZoneDrop}
        className={`rounded-xl border p-4 min-h-[180px] transition-colors ${
          dropTarget === 'zone' ? 'border-[#C9A96E] bg-[#FBF8F3]' : 'border-[#DDD8D2] bg-white'
        }`}
      >
        {!visibleFolders.length && !visibleDocuments.length ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[#6B6560]">Nog niets in deze map.</p>
            <p className="text-xs text-[#9A948D] mt-1">Sleep bestanden hierheen, of gebruik de knoppen hierboven.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {!!visibleFolders.length && (
              <div className="flex flex-wrap gap-2.5">
                {visibleFolders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolderId(folder.id)}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(folder.id) }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => handleFolderDrop(e, folder)}
                    className={`group flex items-center gap-2 rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors ${
                      dropTarget === folder.id ? 'border-[#C9A96E] bg-[#FBF8F3]' : 'border-[#DDD8D2] bg-white hover:border-[#C9A96E]'
                    }`}
                  >
                    <Folder size={16} className="text-[#C9A96E] shrink-0" />
                    <span className="text-sm text-[#1C1B19] max-w-[160px] truncate">{folder.name}</span>
                    {countInside(folder.id) > 0 && (
                      <span className="text-xs text-[#9A948D]">{countInside(folder.id)}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFolder(folder) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                      title="Map verwijderen"
                    >
                      <Trash2 size={13} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!!visibleDocuments.length && (
              <div className="divide-y divide-[#DDD8D2] border border-[#DDD8D2] rounded-lg overflow-hidden">
                {visibleDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id)}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white cursor-grab active:cursor-grabbing"
                  >
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 min-w-0 text-sm font-medium text-[#1C1B19] hover:underline truncate"
                    >
                      <File size={15} className="text-[#6B6560] shrink-0" />
                      {doc.filename}
                    </a>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-[#9A948D]">
                      <span>{formatSize(doc.size_bytes)}</span>
                      <span>
                        {new Date(doc.uploaded_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <button onClick={() => deleteDocument(doc)} title="Document verwijderen">
                        <Trash2 size={13} className="text-[#9A948D] hover:text-red-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
