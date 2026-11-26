'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ImagePlus, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AutoTextarea from '@/components/ui/auto-textarea'
import { cn } from '@/lib/utils'
import { StockItem, StockStatus } from '@/lib/types'

export interface StockProject {
  id: string
  name: string
  archived: boolean
}

const STATUS_LABELS: Record<StockStatus, string> = {
  beschikbaar: 'Beschikbaar',
  gereserveerd: 'Gereserveerd',
  gebruikt: 'Gebruikt',
}

const STATUS_COLORS: Record<StockStatus, string> = {
  beschikbaar: 'bg-green-50 text-green-700',
  gereserveerd: 'bg-amber-50 text-amber-700',
  gebruikt: 'bg-[#F0EDE9] text-[#6B6560]',
}

const FILTERS: { value: StockStatus | 'alle'; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'beschikbaar', label: 'Beschikbaar' },
  { value: 'gereserveerd', label: 'Gereserveerd' },
  { value: 'gebruikt', label: 'Gebruikt' },
]

const fieldClass = 'w-full h-9 px-2 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

type Draft = Omit<StockItem, 'id' | 'created_by' | 'created_at' | 'updated_at'>

const EMPTY: Draft = {
  name: '',
  category: null,
  quantity: null,
  dimensions: null,
  location: null,
  photo_url: null,
  notes: null,
  source_project_id: null,
  status: 'beschikbaar',
  target_project_id: null,
}

// Restvoorraad: alles in één scherm — lijst met filter en zoeken, en een
// formulier bovenaan voor een nieuw of bewerkt item. Opslaan gaat direct
// naar finka_stock_items (staff-only).
export default function RestvoorraadView({ initialItems, projects }: { initialItems: StockItem[]; projects: StockProject[] }) {
  const supabase = createClient()
  const [items, setItems] = useState(initialItems)
  const [status, setStatus] = useState<StockStatus | 'alle'>('beschikbaar')
  const [query, setQuery] = useState('')
  // null = geen formulier, 'new' = nieuw item, anders het id dat bewerkt wordt.
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? 'Onbekend project' : null)
  const categories = [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'nl'))

  const counts = new Map<string, number>([['alle', items.length]])
  for (const i of items) counts.set(i.status, (counts.get(i.status) ?? 0) + 1)

  const q = query.trim().toLowerCase()
  const filtered = items.filter((i) => {
    if (status !== 'alle' && i.status !== status) return false
    if (!q) return true
    return [i.name, i.category, i.quantity, i.dimensions, i.location, i.notes, projectName(i.source_project_id), projectName(i.target_project_id)]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })

  async function save(draft: Draft, id: string | null) {
    setError('')
    const row = {
      ...draft,
      name: draft.name.trim(),
      // Beschikbaar = nergens voor bestemd.
      target_project_id: draft.status === 'beschikbaar' ? null : draft.target_project_id,
      updated_at: new Date().toISOString(),
    }
    if (id) {
      const { data, error: updError } = await supabase.from('finka_stock_items').update(row).eq('id', id).select().single()
      if (updError) return setError(`Opslaan mislukt: ${updError.message}`)
      setItems((prev) => prev.map((i) => (i.id === id ? (data as StockItem) : i)))
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data, error: insError } = await supabase
        .from('finka_stock_items')
        .insert({ ...row, created_by: user?.email ?? null })
        .select()
        .single()
      if (insError) return setError(`Opslaan mislukt: ${insError.message}`)
      setItems((prev) => [data as StockItem, ...prev])
      // Zodat het nieuwe item zichtbaar is.
      if (status !== 'alle' && status !== row.status) setStatus('alle')
    }
    setEditing(null)
  }

  async function remove(item: StockItem) {
    if (!confirm(`"${item.name}" verwijderen?`)) return
    const { error: delError } = await supabase.from('finka_stock_items').delete().eq('id', item.id)
    if (delError) return setError(`Verwijderen mislukt: ${delError.message}`)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setEditing(null)
  }

  const editingItem = editing && editing !== 'new' ? items.find((i) => i.id === editing) ?? null : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-colors',
              status === f.value
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#C9A96E]'
            )}
          >
            {f.label} <span className="opacity-70">{counts.get(f.value) ?? 0}</span>
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
          <Plus size={13} /> Item toevoegen
        </Button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam, soort, maat, locatie of project..."
          className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] transition-colors"
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {editing && (
        <StockEditor
          key={editing}
          item={editingItem}
          projects={projects}
          categories={categories}
          onSave={(d) => save(d, editingItem?.id ?? null)}
          onCancel={() => setEditing(null)}
          onDelete={editingItem ? () => remove(editingItem) : undefined}
          onError={setError}
        />
      )}

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        {!filtered.length ? (
          <p className="py-16 text-center text-sm text-[#6B6560]">
            {items.length ? 'Niets gevonden' : 'Nog niets in de restvoorraad. Voeg het eerste item toe.'}
          </p>
        ) : (
          <ul className="divide-y divide-[#DDD8D2]">
            {filtered.map((i) => {
              const source = projectName(i.source_project_id)
              const target = projectName(i.target_project_id)
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(i.id)}
                    className={cn('w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[#F7F5F2] transition-colors', editing === i.id && 'bg-[#F7F5F2]')}
                  >
                    {i.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.photo_url} alt="" className="w-12 h-12 rounded-md object-cover border border-[#DDD8D2] shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-[#F0EDE9] shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1C1B19] truncate">
                        {i.quantity && <span className="text-[#6B6560] font-normal">{i.quantity} × </span>}
                        {i.name}
                      </p>
                      <p className="text-xs text-[#6B6560] truncate">
                        {[i.category, i.dimensions, i.location && `ligt: ${i.location}`].filter(Boolean).join(' · ')}
                      </p>
                      {(source || target) && (
                        <p className="text-xs text-[#9A948D] truncate mt-0.5">
                          {[source && `over van ${source}`, target && `${i.status === 'gebruikt' ? 'gebruikt bij' : 'voor'} ${target}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', STATUS_COLORS[i.status])}>{STATUS_LABELS[i.status]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StockEditor({
  item,
  projects,
  categories,
  onSave,
  onCancel,
  onDelete,
  onError,
}: {
  item: StockItem | null
  projects: StockProject[]
  categories: string[]
  onSave: (draft: Draft) => Promise<void>
  onCancel: () => void
  onDelete?: () => void
  onError: (message: string) => void
}) {
  const supabase = createClient()
  const [d, setD] = useState<Draft>(() => {
    if (!item) return EMPTY
    return Object.fromEntries(Object.keys(EMPTY).map((k) => [k, item[k as keyof Draft]])) as Draft
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const text = (v: string) => v || null

  // Gearchiveerde projecten alleen als ze al gekozen zijn.
  const projectOptions = (current: string | null) => projects.filter((p) => !p.archived || p.id === current)

  // Foto's in de bestaande bucket offer-images, onder restvoorraad/.
  async function upload(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `restvoorraad/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('offer-images').upload(path, file, { contentType: file.type || undefined })
    setUploading(false)
    if (error) return onError(`Foto uploaden mislukt: ${error.message}`)
    set({ photo_url: supabase.storage.from('offer-images').getPublicUrl(path).data.publicUrl })
  }

  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault()
        if (!d.name.trim()) return
        setSaving(true)
        await onSave(d)
        setSaving(false)
      }}
      className="bg-white rounded-xl border border-[#C9A96E] p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#1C1B19]">{item ? 'Item bewerken' : 'Nieuw item'}</h3>
        <button type="button" onClick={onCancel} aria-label="Sluiten" className="p-1 text-[#6B6560] hover:text-[#1C1B19]">
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <label className="relative w-28 h-28 shrink-0 rounded-lg border border-dashed border-[#DDD8D2] bg-[#F7F5F2] flex items-center justify-center cursor-pointer overflow-hidden hover:border-[#1C1B19]">
          {d.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs text-[#6B6560]">
              <ImagePlus size={18} />
              {uploading ? 'Bezig...' : 'Foto'}
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload(file)
              e.target.value = ''
            }}
          />
          {d.photo_url && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                set({ photo_url: null })
              }}
              aria-label="Foto weghalen"
              className="absolute top-1 right-1 p-0.5 rounded bg-white/90 text-[#6B6560] hover:text-red-600"
            >
              <X size={12} />
            </button>
          )}
        </label>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-[#6B6560]">
            Naam
            <Input autoFocus={!item} required value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Bijv. Front eiken 60 cm" className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
            Soort
            <Input
              list="restvoorraad-soorten"
              value={d.category ?? ''}
              onChange={(e) => set({ category: text(e.target.value) })}
              placeholder="Bijv. Werkblad, Front, Beslag"
              className="h-9"
            />
            <datalist id="restvoorraad-soorten">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
            Aantal
            <Input value={d.quantity ?? ''} onChange={(e) => set({ quantity: text(e.target.value) })} placeholder="Bijv. 2" className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
            Maten / kleur
            <Input value={d.dimensions ?? ''} onChange={(e) => set({ dimensions: text(e.target.value) })} placeholder="Bijv. 600 × 720 mm, mat zwart" className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
            Waar ligt het
            <Input value={d.location ?? ''} onChange={(e) => set({ location: text(e.target.value) })} placeholder="Bijv. Werkplaats, stelling 2" className="h-9" />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Over van project
          <select value={d.source_project_id ?? ''} onChange={(e) => set({ source_project_id: e.target.value || null })} className={fieldClass}>
            <option value="">— Geen / onbekend —</option>
            {projectOptions(d.source_project_id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Status
          <select value={d.status} onChange={(e) => set({ status: e.target.value as StockStatus })} className={fieldClass}>
            {(Object.keys(STATUS_LABELS) as StockStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        {d.status !== 'beschikbaar' && (
          <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
            {d.status === 'gebruikt' ? 'Gebruikt bij project' : 'Gereserveerd voor project'}
            <select value={d.target_project_id ?? ''} onChange={(e) => set({ target_project_id: e.target.value || null })} className={fieldClass}>
              <option value="">— Geen project —</option>
              {projectOptions(d.target_project_id).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
        Notitie
        <AutoTextarea
          value={d.notes ?? ''}
          onChange={(v) => set({ notes: text(v) })}
          placeholder="Bijv. kleine kras aan de achterkant"
          className="w-full min-h-[2.5rem] px-3 py-2 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className="h-9" disabled={saving || uploading || !d.name.trim()}>
          {saving ? 'Bezig...' : 'Opslaan'}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onCancel}>
          Annuleren
        </Button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto inline-flex items-center gap-1 text-xs text-[#9A948D] hover:text-red-600">
            <Trash2 size={13} /> Verwijderen
          </button>
        )}
      </div>
    </form>
  )
}
