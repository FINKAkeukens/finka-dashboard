'use client'

import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Eye, EyeOff, ImagePlus, MessageSquare, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AutoTextarea from '@/components/ui/auto-textarea'
import { KEUZE_WEET_NIET, KeuzeOption, ProjectKeuze } from '@/lib/types'
import { choiceText, extraLabel, formatExtra, formatEuro, hasPrices, isAnswered, isOpenVraag, OPEN_VRAAG_TITLE, totalExtra } from '@/lib/keuzes'

export interface KeuzesSourceProject {
  id: string
  label: string
  count: number
}

// Tabblad Keuzes: per project een reeks vragen met foto-opties die de klant
// in het portaal aanklikt (zoals keuzes.finkakeukens.nl). Staff zet hier de
// vragen klaar en ziet de keuzes van de klant meteen terug. Een vraag is pas
// zichtbaar voor de klant met het oogje aan.
export default function KeuzesTab({
  projectId,
  keuzes: initialKeuzes,
  submittedAt: initialSubmittedAt,
  submittedBy,
  sourceProjects,
}: {
  projectId: string
  keuzes: ProjectKeuze[]
  submittedAt: string | null
  submittedBy: string | null
  sourceProjects: KeuzesSourceProject[]
}) {
  const supabase = createClient()
  const [keuzes, setKeuzes] = useState<ProjectKeuze[]>(initialKeuzes)
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copyFrom, setCopyFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sorted = [...keuzes].sort((a, b) => a.sort_order - b.sort_order)
  const visible = sorted.filter((k) => k.visible_to_customer)
  const answered = visible.filter(isAnswered).length
  const showPrices = hasPrices(visible)

  function fail(message: string) {
    setError(message)
    setTimeout(() => setError(''), 6000)
  }

  async function patch(id: string, values: Partial<ProjectKeuze>) {
    setKeuzes((prev) => prev.map((k) => (k.id === id ? { ...k, ...values } : k)))
    const { error: updError } = await supabase
      .from('finka_project_keuzes')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) fail(`Opslaan mislukt: ${updError.message}`)
  }

  // open = vraag zonder opties waarin de klant zelf iets typt.
  async function addKeuze(open = false) {
    setBusy(true)
    const maxSort = keuzes.reduce((max, k) => Math.max(max, k.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_project_keuzes')
      .insert({
        project_id: projectId,
        sort_order: maxSort + 1,
        title: open ? OPEN_VRAAG_TITLE : NEW_TITLE,
        options: open ? [] : [newOption(), newOption()],
      })
      .select()
      .single()
    setBusy(false)
    if (insError || !data) return fail(`Toevoegen mislukt: ${insError?.message}`)
    setKeuzes((prev) => [...prev, data as ProjectKeuze])
    if (!open) setEditingId((data as ProjectKeuze).id)
  }

  async function removeKeuze(k: ProjectKeuze) {
    if (!confirm(`"${k.title}" verwijderen?`)) return
    setKeuzes((prev) => prev.filter((x) => x.id !== k.id))
    const { error: delError } = await supabase.from('finka_project_keuzes').delete().eq('id', k.id)
    if (delError) fail(`Verwijderen mislukt: ${delError.message}`)
  }

  async function move(k: ProjectKeuze, dir: -1 | 1) {
    const i = sorted.findIndex((x) => x.id === k.id)
    const other = sorted[i + dir]
    if (!other) return
    await Promise.all([patch(k.id, { sort_order: other.sort_order }), patch(other.id, { sort_order: k.sort_order })])
  }

  // Vragen (zonder antwoorden, verborgen voor de klant) overnemen uit een
  // ander project, als startpunt.
  async function copyKeuzes() {
    if (!copyFrom) return
    setBusy(true)
    const { data, error: selError } = await supabase
      .from('finka_project_keuzes')
      .select('title, description, options, sort_order')
      .eq('project_id', copyFrom)
      .order('sort_order')
    if (selError || !data?.length) {
      setBusy(false)
      return fail(selError ? `Overnemen mislukt: ${selError.message}` : 'Dat project heeft geen keuzes.')
    }
    const start = keuzes.reduce((max, k) => Math.max(max, k.sort_order), -1) + 1
    const rows = data.map((k, i) => ({
      project_id: projectId,
      sort_order: start + i,
      title: k.title,
      description: k.description,
      options: (k.options as KeuzeOption[]).map((o) => ({ ...o, id: crypto.randomUUID() })),
    }))
    const { data: inserted, error: insError } = await supabase.from('finka_project_keuzes').insert(rows).select()
    setBusy(false)
    if (insError) return fail(`Overnemen mislukt: ${insError.message}`)
    setKeuzes((prev) => [...prev, ...((inserted ?? []) as ProjectKeuze[])])
    setCopyFrom('')
  }

  async function reopen() {
    if (!confirm('Keuzes heropenen? De klant kan dan weer wijzigen en opnieuw versturen.')) return
    const { error: updError } = await supabase
      .from('finka_projects')
      .update({ keuzes_submitted_at: null, keuzes_submitted_by: null })
      .eq('id', projectId)
    if (updError) return fail(`Heropenen mislukt: ${updError.message}`)
    setSubmittedAt(null)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-medium text-[#1C1B19]">
            {visible.length === 0
              ? 'Nog geen vragen zichtbaar voor de klant'
              : `${answered} van ${visible.length} vragen beantwoord`}
            {showPrices && answered > 0 && (
              <span className="font-normal text-[#6B6560]"> · {extraLabel(totalExtra(visible)).toLowerCase()} {formatEuro(Math.abs(totalExtra(visible)))}</span>
            )}
          </p>
          {submittedAt ? (
            <p className="text-xs text-green-700 mt-0.5">
              Definitief verstuurd{submittedBy ? ` door ${submittedBy}` : ''} op{' '}
              {new Date(submittedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <p className="text-xs text-[#6B6560] mt-0.5">De klant ziet deze vragen in het portaal onder Keuzes.</p>
          )}
        </div>
        {submittedAt && (
          <Button variant="outline" size="sm" className="h-8" onClick={reopen}>
            <RotateCcw size={13} /> Heropenen
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {sorted.map((k, i) =>
        editingId === k.id ? (
          <KeuzeEditor
            key={k.id}
            keuze={k}
            projectId={projectId}
            onSave={async (values) => {
              await patch(k.id, values)
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
            onError={fail}
          />
        ) : (
          <KeuzeCard
            key={k.id}
            keuze={k}
            first={i === 0}
            last={i === sorted.length - 1}
            onEdit={() => setEditingId(k.id)}
            onToggleVisible={() => patch(k.id, { visible_to_customer: !k.visible_to_customer })}
            onMove={(dir) => move(k, dir)}
            onRemove={() => removeKeuze(k)}
          />
        )
      )}

      {sorted.length === 0 && (
        <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 text-center">
          Nog geen keuzes voor dit project. Voeg een vraag toe of neem de vragen van een ander project over.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-9" onClick={() => addKeuze()} disabled={busy}>
          <Plus size={14} /> Vraag
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => addKeuze(true)} disabled={busy} title={`Open vraag: "${OPEN_VRAAG_TITLE}"`}>
          <Plus size={14} /> Open vraag
        </Button>
        {sourceProjects.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="h-9 px-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] max-w-[280px]"
            >
              <option value="">Vragen overnemen uit…</option>
              {sourceProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.count})</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-9" onClick={copyKeuzes} disabled={!copyFrom || busy}>
              <Copy size={13} /> Overnemen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Titel van een net toegevoegde vraag; in de editor staat het veld dan leeg
// (met voorbeeldtekst), zodat je meteen kunt typen.
const NEW_TITLE = 'Nieuwe vraag'

function newOption(): KeuzeOption {
  return { id: crypto.randomUUID(), label: '', photo_url: null, link: null, price: null }
}

function KeuzeCard({
  keuze: k,
  first,
  last,
  onEdit,
  onToggleVisible,
  onMove,
  onRemove,
}: {
  keuze: ProjectKeuze
  first: boolean
  last: boolean
  onEdit: () => void
  onToggleVisible: () => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const answer = choiceText(k)
  const iconButton = 'p-1.5 text-[#9A948D] hover:text-[#1C1B19] disabled:opacity-30 disabled:hover:text-[#9A948D]'
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${k.visible_to_customer ? 'border-[#DDD8D2]' : 'border-dashed border-[#CFC8BF]'}`}>
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1C1B19]">{k.title}</h3>
          {k.description && <p className="text-xs text-[#6B6560] mt-0.5 whitespace-pre-line">{k.description}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleVisible}
          aria-pressed={k.visible_to_customer}
          title={k.visible_to_customer ? 'Zichtbaar voor klant, klik om te verbergen' : 'Verborgen voor klant, klik om zichtbaar te maken'}
          className={`w-[26px] h-[26px] rounded-md border flex items-center justify-center shrink-0 ${
            k.visible_to_customer
              ? 'bg-[#FBF7EF] border-[#C9A96E] text-[#8A6A2E]'
              : 'bg-white border-[#DDD8D2] text-[#C7C2BB] hover:text-[#8A6A2E] hover:border-[#C9A96E]'
          }`}
        >
          {k.visible_to_customer ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Omhoog" className={iconButton}><ArrowUp size={14} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Omlaag" className={iconButton}><ArrowDown size={14} /></button>
        <button type="button" onClick={onEdit} aria-label="Bewerken" className={iconButton}><Pencil size={14} /></button>
        <button type="button" onClick={onRemove} aria-label="Verwijderen" className={`${iconButton} hover:text-red-600`}><Trash2 size={14} /></button>
      </div>

      {isOpenVraag(k) ? (
        <div className="p-4 pb-3">
          {k.comment ? (
            <p className="text-sm text-[#1C1B19] bg-[#FBF7EF] border border-[#EFE4CF] rounded-lg px-3 py-2 whitespace-pre-line">{k.comment}</p>
          ) : (
            <p className="text-xs text-[#9A948D]">
              Open vraag, de klant typt zelf een antwoord.{' '}
              {k.visible_to_customer ? 'Nog niet beantwoord.' : 'Verborgen voor de klant.'}
            </p>
          )}
          {k.answered_at && (
            <p className="text-xs text-[#9A948D] mt-1">{new Date(k.answered_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</p>
          )}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4">
        {k.options.map((o) => {
          const chosen = k.choice === o.id
          return (
            <div key={o.id} className={`rounded-lg border overflow-hidden ${chosen ? 'border-[#1C1B19] ring-1 ring-[#1C1B19]' : 'border-[#E4E0DA]'}`}>
              {o.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.photo_url} alt={o.label} className="w-full aspect-[4/3] object-cover bg-[#F5F3EF]" />
              ) : (
                <div className="w-full aspect-[4/3] bg-[#F5F3EF]" />
              )}
              <div className="px-2 py-1.5 text-xs">
                <span className="flex items-start gap-1 text-[#1C1B19]">
                  {chosen && <Check size={13} className="text-green-700 shrink-0 mt-px" />}
                  {o.label || <span className="text-[#9A948D]">(geen naam)</span>}
                </span>
                {o.price != null && <span className={`block ${o.price < 0 ? 'text-green-700' : 'text-[#8A6A2E]'}`}>{formatExtra(o.price)}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-4 pb-3 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
        {answer ? (
          <span className={k.choice === KEUZE_WEET_NIET ? 'text-[#8A6A2E] font-medium' : 'text-green-700 font-medium'}>
            Klant koos: {answer}
          </span>
        ) : (
          <span className="text-[#9A948D]">{k.visible_to_customer ? 'Nog niet beantwoord' : 'Verborgen voor de klant'}</span>
        )}
        {k.answered_at && <span className="text-[#9A948D]">{new Date(k.answered_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>}
      </div>
      {k.comment && (
        <p className="mx-4 mb-3 flex gap-1.5 text-xs text-[#1C1B19] bg-[#FBF7EF] border border-[#EFE4CF] rounded-lg px-2.5 py-2">
          <MessageSquare size={13} className="text-[#8A6A2E] shrink-0 mt-px" />
          <span className="whitespace-pre-line">{k.comment}</span>
        </p>
      )}
      </>
      )}
    </div>
  )
}

function KeuzeEditor({
  keuze,
  projectId,
  onSave,
  onCancel,
  onError,
}: {
  keuze: ProjectKeuze
  projectId: string
  onSave: (values: Pick<ProjectKeuze, 'title' | 'description' | 'options'>) => Promise<void>
  onCancel: () => void
  onError: (message: string) => void
}) {
  const supabase = createClient()
  const [title, setTitle] = useState(keuze.title === NEW_TITLE ? '' : keuze.title)
  const [description, setDescription] = useState(keuze.description ?? '')
  const open = isOpenVraag(keuze)
  const [options, setOptions] = useState<KeuzeOption[]>(keuze.options)
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<string | null>(null)

  const setOption = (id: string, values: Partial<KeuzeOption>) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...values } : o)))

  // Foto's in de bestaande publieke bucket offer-images, onder keuzes/.
  async function upload(file: File) {
    const id = uploadFor.current
    if (!id) return
    setUploading(id)
    const ext = file.name.split('.').pop()
    const path = `keuzes/${projectId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('offer-images').upload(path, file, { contentType: file.type || undefined })
    setUploading(null)
    if (error) return onError(`Foto uploaden mislukt: ${error.message}`)
    setOption(id, { photo_url: supabase.storage.from('offer-images').getPublicUrl(path).data.publicUrl })
  }

  async function save() {
    const cleaned = options
      .map((o) => ({ ...o, label: o.label.trim(), link: o.link?.trim() || null }))
      .filter((o) => o.label || o.photo_url)
    if (!title.trim()) return onError('Geef de vraag een titel.')
    if (!open && cleaned.length < 2) return onError('Een vraag heeft minstens 2 opties nodig.')
    setSaving(true)
    await onSave({ title: title.trim(), description: description.trim() || null, options: open ? [] : cleaned })
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl border border-[#C9A96E] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1C1B19]">Vraag bewerken</h3>
        <button type="button" onClick={onCancel} aria-label="Sluiten" className="p-1 text-[#6B6560] hover:text-[#1C1B19]"><X size={15} /></button>
      </div>
      <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
        Vraag
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Wat voor soort handgrepen wil je?" className="h-9" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
        Toelichting (optioneel)
        <AutoTextarea value={description} onChange={setDescription} className="text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]" />
      </label>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload(file)
          e.target.value = ''
        }}
      />

      {!open && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((o, i) => (
          <div key={o.id} className="rounded-lg border border-[#E4E0DA] p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#6B6560]">
              Optie {String.fromCharCode(65 + i)}
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((prev) => prev.filter((x) => x.id !== o.id))} className="p-1 text-[#9A948D] hover:text-red-600" aria-label="Optie verwijderen">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                uploadFor.current = o.id
                fileInput.current?.click()
              }}
              className="relative w-full aspect-[4/3] rounded-md border border-dashed border-[#CFC8BF] bg-[#F5F3EF] overflow-hidden flex items-center justify-center text-xs text-[#6B6560] hover:border-[#1C1B19]"
            >
              {o.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.photo_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span className="flex items-center gap-1.5">
                  <ImagePlus size={15} /> {uploading === o.id ? 'Uploaden…' : 'Foto kiezen'}
                </span>
              )}
            </button>
            {o.photo_url && (
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => { uploadFor.current = o.id; fileInput.current?.click() }} className="text-[#8A6A2E] hover:underline">
                  {uploading === o.id ? 'Uploaden…' : 'Andere foto'}
                </button>
                <button type="button" onClick={() => setOption(o.id, { photo_url: null })} className="text-[#9A948D] hover:text-red-600">Foto weghalen</button>
              </div>
            )}
            <Input value={o.label} onChange={(e) => setOption(o.id, { label: e.target.value })} placeholder="Naam van de optie" className="h-8 text-sm" />
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                value={o.price ?? ''}
                onChange={(e) => setOption(o.id, { price: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Meer-/minderprijs € (optioneel)"
                title="Meerprijs in euro's; met een min ervoor (bv. -150) is het een minderprijs"
                className="h-8 text-sm w-1/2"
              />
              <div className="relative w-1/2">
                <Input value={o.link ?? ''} onChange={(e) => setOption(o.id, { link: e.target.value })} placeholder="Link (optioneel)" className="h-8 text-sm pr-7" />
                {o.link && (
                  <a href={o.link} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9A948D] hover:text-[#1C1B19]" aria-label="Link openen">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-9" onClick={save} disabled={saving || !!uploading}>{saving ? 'Bezig...' : 'Opslaan'}</Button>
        <Button size="sm" variant="outline" className="h-9" onClick={onCancel}>Annuleren</Button>
        {!open && <button type="button" onClick={() => setOptions((prev) => [...prev, newOption()])} className="ml-auto inline-flex items-center gap-1 text-sm text-[#8A6A2E] hover:underline">
          <Plus size={14} /> Optie
        </button>}
      </div>
      <p className="text-xs text-[#9A948D]">
        {open
          ? 'Open vraag: de klant typt zelf een antwoord. Niet verplicht om te kunnen versturen.'
          : 'De klant kan altijd ook "Weet ik nog niet" kiezen en een opmerking toevoegen.'}
      </p>
    </div>
  )
}
