'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, File as FileIcon, Folder, FolderPlus, FolderUp, Trash2, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

type DroppedFile = { file: File; folderPath: string[] }

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

// readEntries geeft maximaal ~100 entries per aanroep terug — pas een lege
// batch betekent dat de map uitgelezen is.
async function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  for (;;) {
    const batch = await readDirectoryEntries(reader)
    if (!batch.length) break
    all.push(...batch)
  }
  return all
}

function readFileFromEntry(entry: FileSystemEntry): Promise<File> {
  return new Promise((resolve, reject) => (entry as unknown as { file: (cb: (f: File) => void, eb: (e: unknown) => void) => void }).file(resolve, reject))
}

async function walkEntry(entry: FileSystemEntry, folderPath: string[], out: DroppedFile[]) {
  if (entry.isFile) {
    out.push({ file: await readFileFromEntry(entry), folderPath })
  } else if (entry.isDirectory) {
    const reader = (entry as unknown as { createReader: () => FileSystemDirectoryReader }).createReader()
    for (const child of await readAllDirectoryEntries(reader)) {
      await walkEntry(child, [...folderPath, entry.name], out)
    }
  }
}

// Leest zowel losse bestanden als hele mappen uit een drag-event, inclusief
// de mapstructuur. Chrome/Edge/Safari ondersteunen hiervoor de non-standaard
// webkitGetAsEntry-API; zonder die entries bevat dataTransfer.files voor een
// gesleepte map geen bruikbare inhoud (hooguit een 0-byte placeholder) — dat
// was de oorzaak van "een map slepen doet niets". `usedFallback` laat de
// aanroeper weten of dit pad is genomen, zodat die een placeholder kan
// herkennen i.p.v. 'm als een leeg document te uploaden.
async function readDroppedFiles(dataTransfer: DataTransfer): Promise<{ items: DroppedFile[]; usedFallback: boolean }> {
  const items = Array.from(dataTransfer.items ?? [])
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => !!entry)

  if (!entries.length) {
    return { items: Array.from(dataTransfer.files).map((file) => ({ file, folderPath: [] })), usedFallback: true }
  }

  const out: DroppedFile[] = []
  for (const entry of entries) {
    await walkEntry(entry, [], out)
  }
  return { items: out, usedFallback: false }
}

// Een gesleepte map komt zonder entries-support (of wanneer de browser de
// map om een andere reden niet kon uitlezen) binnen als een 0-byte bestand
// zonder mimetype en zonder extensie in de naam — daar is een losse, echt
// lege upload praktisch nooit van te onderscheiden, maar dit patroon komt in
// de praktijk vrijwel alleen van een niet-uitgelezen map.
function looksLikeUnreadableFolderPlaceholder(file: File): boolean {
  return file.size === 0 && !file.type && !file.name.includes('.')
}

type PreviewKind = 'pdf' | 'image' | 'office' | 'unsupported'

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])

function previewKindFor(filename: string): PreviewKind {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : ''
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  return 'unsupported'
}

// webkitdirectory/directory zijn non-standard HTML-attributen (geen React-
// typering) waarmee input[type=file] een mappicker i.p.v. bestandspicker
// toont — breed ondersteund (Chrome/Edge/Firefox/Safari) en betrouwbaarder
// dan slepen, omdat de browser dan altijd élk bestand in de map levert
// (met webkitRelativePath) i.p.v. afhankelijk te zijn van de niet-overal
// even goed ondersteunde drag-entries-API hierboven.
const FOLDER_PICKER_PROPS = { webkitdirectory: '', directory: '' } as unknown as React.InputHTMLAttributes<HTMLInputElement>

function filesFromWebkitRelativePaths(files: FileList): DroppedFile[] {
  return Array.from(files).map((file) => {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const parts = relativePath.split('/')
    const basename = parts[parts.length - 1]
    // file.name is hier altijd al kaal de bestandsnaam (het mappad zit in
    // webkitRelativePath) — maar Chrome's FormData.append() gebruikt zelf
    // webkitRelativePath i.p.v. .name voor de multipart-bestandsnaam zodra
    // die aanwezig is, ook als .name al klopt. Vandaar altijd een nieuw
    // File-object zonder die eigenschap, anders komt het mappad alsnog in
    // de geüploade bestandsnaam terecht.
    const uploadFile = new File([file], basename, { type: file.type })
    return { file: uploadFile, folderPath: parts.slice(0, -1) }
  })
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
  const [previewDoc, setPreviewDoc] = useState<SupplierDocument | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  // Bijgehouden náást de folders-state (i.p.v. die rechtstreeks te lezen) zodat
  // resolveFolderPath tijdens één upload-batch meteen ziet welke (sub)mappen
  // net zijn aangemaakt — anders zou elk bestand in dezelfde nieuwe submap
  // zijn eigen duplicaat van die map aanmaken (de state-update van de vorige
  // is dan nog niet doorgekomen).
  const foldersRef = useRef(folders)
  useEffect(() => {
    foldersRef.current = folders
  }, [folders])

  // Voor een gesleepte map: maakt (of hergebruikt) de submappen op elke
  // niveau onder targetFolderId, en geeft de id van de diepste map terug
  // waar het bestand in moet landen.
  async function resolveFolderPath(folderPath: string[], targetFolderId: string | null): Promise<string | null> {
    let parentId = targetFolderId
    for (const name of folderPath) {
      const existing = foldersRef.current.find((f) => f.parent_folder_id === parentId && f.name === name)
      if (existing) {
        parentId = existing.id
        continue
      }
      const { data, error } = await supabase
        .from('finka_supplier_folders')
        .insert({ supplier_id: supplierId, parent_folder_id: parentId, name })
        .select()
        .single()
      if (error) throw new Error(error.message)
      const created = data as SupplierFolder
      foldersRef.current = [...foldersRef.current, created]
      setFolders((prev) => [...prev, created])
      parentId = created.id
    }
    return parentId
  }

  // Voorkomt dat de browser bij een drop die net naast de dropzone valt de
  // hele pagina vervangt door het gesleepte bestand (het standaardgedrag
  // zonder preventDefault) — alleen voor echte bestandsdrags (type "Files"),
  // zodat het intern slepen van een documentkaart tussen mappen (DOC_DRAG_TYPE)
  // hierdoor niet geraakt wordt.
  useEffect(() => {
    function preventStrayNavigation(e: DragEvent) {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', preventStrayNavigation)
    window.addEventListener('drop', preventStrayNavigation)
    return () => {
      window.removeEventListener('dragover', preventStrayNavigation)
      window.removeEventListener('drop', preventStrayNavigation)
    }
  }, [])

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

  async function uploadFlatFiles(files: FileList | File[], targetFolderId: string | null) {
    await uploadDroppedFiles(Array.from(files).map((file) => ({ file, folderPath: [] })), targetFolderId)
  }

  async function uploadDroppedFiles(items: DroppedFile[], targetFolderId: string | null) {
    setUploading(true)
    setError('')
    try {
      for (const { file, folderPath } of items) {
        let resolvedFolderId: string | null
        try {
          resolvedFolderId = await resolveFolderPath(folderPath, targetFolderId)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Map aanmaken mislukt')
          continue
        }
        const formData = new FormData()
        formData.append('file', file)
        formData.append('supplierId', supplierId)
        if (resolvedFolderId) formData.append('folderId', resolvedFolderId)
        const res = await fetch('/api/leveranciers/documenten/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) {
          setError(`${file.name}: ${data.error ?? 'Uploaden mislukt'}`)
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

  // Filtert map-placeholders eruit (zie looksLikeUnreadableFolderPlaceholder)
  // en meldt het als dat de hele drop was — anders lijkt een drop die alleen
  // hieraan strandde stilletjes niets te doen.
  function filterUnreadableFolders(items: DroppedFile[], usedFallback: boolean): DroppedFile[] {
    if (!usedFallback) return items
    const real = items.filter((i) => !looksLikeUnreadableFolderPlaceholder(i.file))
    if (real.length < items.length) {
      setError('Slepen van een map wordt niet ondersteund in deze browser. Gebruik de knop "Map toevoegen" hierboven.')
    }
    return real
  }

  async function handleZoneDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropTarget(null)
    if (!e.dataTransfer.types.includes('Files')) return
    const dataTransfer = e.dataTransfer
    const { items, usedFallback } = await readDroppedFiles(dataTransfer)
    const realItems = filterUnreadableFolders(items, usedFallback)
    if (realItems.length) uploadDroppedFiles(realItems, currentFolderId)
  }

  async function handleFolderDrop(e: React.DragEvent, folder: SupplierFolder) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    if (e.dataTransfer.types.includes('Files')) {
      const dataTransfer = e.dataTransfer
      const { items, usedFallback } = await readDroppedFiles(dataTransfer)
      const realItems = filterUnreadableFolders(items, usedFallback)
      if (realItems.length) uploadDroppedFiles(realItems, folder.id)
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
                if (e.target.files?.length) uploadFlatFiles(e.target.files, currentFolderId)
                e.target.value = ''
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#DDD8D2] bg-white px-3 py-1.5 text-sm text-[#1C1B19] hover:border-[#C9A96E] transition-colors">
            <FolderUp size={14} />
            {uploading ? 'Bezig...' : 'Map toevoegen'}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              {...FOLDER_PICKER_PROPS}
              onChange={(e) => {
                if (e.target.files?.length) uploadDroppedFiles(filesFromWebkitRelativePaths(e.target.files), currentFolderId)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div
        data-testid="supplier-drop-zone"
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
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="flex items-center gap-2.5 min-w-0 text-sm font-medium text-[#1C1B19] hover:underline truncate text-left"
                    >
                      <FileIcon size={15} className="text-[#6B6560] shrink-0" />
                      {doc.filename}
                    </button>
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

      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  )
}

function DocumentPreviewModal({ doc, onClose }: { doc: SupplierDocument; onClose: () => void }) {
  const kind = previewKindFor(doc.filename)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-[95vw] max-w-5xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="pr-8 truncate">{doc.filename}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-[#DDD8D2] bg-[#F7F5F2]">
          {kind === 'pdf' && <iframe src={doc.file_url} className="w-full h-full" title={doc.filename} />}
          {kind === 'image' && (
            <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- externe Supabase Storage-URL, geen lokaal asset dat next/image kan optimaliseren */}
              <img src={doc.file_url} alt={doc.filename} className="max-w-full max-h-full object-contain" />
            </div>
          )}
          {kind === 'office' && (
            <iframe
              src={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(doc.file_url)}`}
              className="w-full h-full"
              title={doc.filename}
            />
          )}
          {kind === 'unsupported' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <p className="text-sm text-[#6B6560]">Voor dit bestandstype is geen voorbeeld beschikbaar in het dashboard.</p>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#C9A96E] underline"
              >
                Open het bestand in een nieuw tabblad
              </a>
            </div>
          )}
        </div>
        <DialogFooter>
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#6B6560] hover:text-[#1C1B19] underline"
          >
            Open in nieuw tabblad
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
