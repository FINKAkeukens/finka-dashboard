'use client'

import { useRef, useState } from 'react'
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ExternalLink, FileText, GripVertical, Link2, Pin, Plus, Trash2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AutoTextarea from '@/components/ui/auto-textarea'
import { Assignee, InternalInspiration, InternalNote, MilestoneStatus, ProjectMilestone } from '@/lib/types'
import { MILESTONE_STATUS_COLORS, MILESTONE_STATUS_LABELS, MILESTONE_STATUS_ORDER, assigneeNames } from '@/lib/planning'
import { fileHref } from '@/lib/storage-url'
import { INTERN_BORDER, INTERN_TEXT, INTERN_TINT } from '@/lib/intern'


const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

// Eigen volgorde: de to do's staan zoals ze versleept zijn (sort_order).
function sortTodos(list: ProjectMilestone[]): ProjectMilestone[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order)
}

// Status van een open to do; "Klaar" gaat via het vinkje.
const OPEN_STATUSES: MilestoneStatus[] = MILESTONE_STATUS_ORDER.filter((s) => s !== 'klaar')

function sortNotes(list: InternalNote[]): InternalNote[] {
  return [...list].sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.updated_at.localeCompare(a.updated_at)))
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Section({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border ${INTERN_BORDER} bg-white overflow-hidden`}>
      <div className={`flex items-center justify-between gap-3 px-5 py-3 ${INTERN_TINT} border-b ${INTERN_BORDER}`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${INTERN_TEXT}`}>
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal text-[#6B6560]">({count})</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function InternView({
  initialTodos,
  initialNotes,
  initialInspiration,
  assignees,
}: {
  initialTodos: ProjectMilestone[]
  initialNotes: InternalNote[]
  initialInspiration: InternalInspiration[]
  assignees: Assignee[]
}) {
  const supabase = createClient()
  const today = startOfDay(new Date())
  const [todos, setTodos] = useState(initialTodos)
  const [notes, setNotes] = useState(sortNotes(initialNotes))
  const [inspiration, setInspiration] = useState(initialInspiration)
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [editingTodo, setEditingTodo] = useState<string | null>(null)
  const [newTodo, setNewTodo] = useState('')
  const [newTodoDate, setNewTodoDate] = useState('')
  const [newTodoAssignee, setNewTodoAssignee] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [uploading, setUploading] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const savingTodo = useRef(false)
  const [draggedTodo, setDraggedTodo] = useState<string | null>(null)
  const [pickerReset, setPickerReset] = useState(0)

  const names = assigneeNames(assignees)
  const openTodos = sortTodos(todos.filter((t) => t.status !== 'klaar'))
  const doneTodos = todos
    .filter((t) => t.status === 'klaar')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  function fail(message: string) {
    setError(message)
  }

  // --- To do's (algemene taken) ---------------------------------------------

  async function saveTodo(id: string, patch: Partial<ProjectMilestone>) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t)))
    const { error: updError } = await supabase
      .from('finka_project_milestones')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) fail(`Opslaan mislukt: ${updError.message}`)
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault()
    const label = newTodo.trim()
    // Enter + klik mag geen dubbele to do opleveren.
    if (!label || savingTodo.current) return
    savingTodo.current = true
    const maxSort = todos.reduce((max, t) => Math.max(max, t.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_project_milestones')
      .insert({
        project_id: null,
        milestone_key: 'custom',
        label,
        date: newTodoDate || null,
        status: 'nog_doen',
        assigned_to: newTodoAssignee || null,
        sort_order: maxSort + 1,
      })
      .select()
      .single()
    savingTodo.current = false
    if (insError) {
      fail(`Toevoegen mislukt: ${insError.message}`)
      return
    }
    setTodos((prev) => [...prev, data as ProjectMilestone])
    setNewTodo('')
    setNewTodoDate('')
    setNewTodoAssignee('')
  }

  // Sleep een to do naar de plek van een andere; daarna krijgen de open
  // to do's opnieuw oplopende nummers en slaan we alleen de gewijzigde op.
  async function moveTodo(fromId: string, toId: string) {
    if (fromId === toId) return
    const list = [...openTodos]
    const from = list.findIndex((t) => t.id === fromId)
    const to = list.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    const changed = list.map((t, i) => ({ id: t.id, sort_order: i })).filter((x) => todos.find((t) => t.id === x.id)?.sort_order !== x.sort_order)
    const orderOf = new Map(changed.map((x) => [x.id, x.sort_order]))
    setTodos((prev) => prev.map((t) => (orderOf.has(t.id) ? { ...t, sort_order: orderOf.get(t.id)! } : t)))
    const results = await Promise.all(
      changed.map((x) => supabase.from('finka_project_milestones').update({ sort_order: x.sort_order }).eq('id', x.id))
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) fail(`Volgorde opslaan mislukt: ${failed.error.message}`)
  }

  async function removeTodo(todo: ProjectMilestone) {
    if (!confirm(`"${todo.label}" verwijderen?`)) return
    setTodos((prev) => prev.filter((t) => t.id !== todo.id))
    const { error: delError } = await supabase.from('finka_project_milestones').delete().eq('id', todo.id)
    if (delError) fail(`Verwijderen mislukt: ${delError.message}`)
  }

  // Zelfde datumweergave als de takenlijst op /planning.
  function dateText(date: string | null): { text: string; className: string } {
    if (!date) return { text: 'Geen datum', className: 'text-[#9A948D]' }
    const days = differenceInCalendarDays(new Date(date), today)
    if (days < 0) return { text: format(new Date(date), 'd MMM', { locale: nl }), className: 'text-red-600 font-medium' }
    if (days === 0) return { text: 'Vandaag', className: 'text-[#8A6A2E] font-medium' }
    if (days === 1) return { text: 'Morgen', className: 'text-[#8A6A2E] font-medium' }
    return { text: format(new Date(date), 'EEEEEE d MMM', { locale: nl }), className: 'text-[#6B6560]' }
  }

  // Klik op de datum opent meteen de datumkiezer, net als op /planning; bij
  // de volgende klik op de pagina bouwen we het veld opnieuw op zodat de
  // kiezer sluit.
  function dateButton(todo: ProjectMilestone, date: { text: string; className: string }) {
    return (
      <span className="relative inline-block w-24 text-right text-[13px] shrink-0">
        <button
          type="button"
          title="Datum aanpassen"
          onClick={(ev) => {
            const input = ev.currentTarget.nextElementSibling as HTMLInputElement | null
            if (input?.showPicker) {
              try {
                input.showPicker()
                setTimeout(() => {
                  document.addEventListener('pointerdown', () => setPickerReset((n) => n + 1), { once: true })
                }, 0)
                return
              } catch {}
            }
            setEditingTodo(todo.id)
          }}
          className={`hover:underline hover:text-[#8A6A2E] ${date.className}`}
        >
          {date.text}
        </button>
        <input
          key={pickerReset}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={todo.date ?? ''}
          onChange={(ev) => saveTodo(todo.id, { date: ev.target.value || null })}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      </span>
    )
  }

  function renderTodo(todo: ProjectMilestone) {
    const done = todo.status === 'klaar'
    const isEditing = editingTodo === todo.id
    const date = dateText(todo.date)
    const status: MilestoneStatus = OPEN_STATUSES.includes(todo.status) ? todo.status : 'nog_doen'
    return (
      <div
        key={todo.id}
        className={`border-t border-[#EFEBE6] first:border-t-0 ${draggedTodo === todo.id ? 'opacity-40' : ''}`}
        onDragOver={(e) => {
          if (draggedTodo && !done) e.preventDefault()
        }}
        onDrop={(e) => {
          if (!draggedTodo || done) return
          e.preventDefault()
          moveTodo(draggedTodo, todo.id)
          setDraggedTodo(null)
        }}
      >
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 min-h-14 ${done ? 'px-4' : 'pl-1.5 pr-4'}`}>
          {!done && (
            <span
              draggable
              onDragStart={() => setDraggedTodo(todo.id)}
              onDragEnd={() => setDraggedTodo(null)}
              title="Sleep om de volgorde te veranderen"
              className="shrink-0 cursor-grab text-[#C7C2BB] hover:text-[#6B6560] active:cursor-grabbing"
            >
              <GripVertical size={15} />
            </span>
          )}
          <input
            type="checkbox"
            aria-label={done ? 'Heropenen' : 'Afvinken'}
            checked={done}
            onChange={() => saveTodo(todo.id, { status: done ? 'nog_doen' : 'klaar' })}
            className="w-5 h-5 accent-[#1C1B19] shrink-0 cursor-pointer"
          />
          {!done && (
            <button
              type="button"
              onClick={() => saveTodo(todo.id, { priority: !todo.priority })}
              aria-label={todo.priority ? 'Prio uitzetten' : 'Prio'}
              aria-pressed={todo.priority}
              className={`w-7 h-7 rounded-lg border text-sm font-bold shrink-0 transition-colors ${
                todo.priority ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-[#DDD8D2] text-[#C7C2BB] hover:text-red-600 hover:border-red-300'
              }`}
            >
              !
            </button>
          )}
          <div className="flex-[999_1_260px] min-w-0">
            <button
              type="button"
              onClick={() => setEditingTodo(isEditing ? null : todo.id)}
              className={`text-left text-[15px] ${done ? 'line-through text-[#9A948D]' : 'text-[#1C1B19] hover:text-[#8A6A2E]'}`}
              title="Datum, notitie en details"
            >
              {todo.label || 'Naamloze to do'}
            </button>
            <p className="text-[13px] text-[#6B6560] truncate">
              FINKA intern
              {todo.notes && <> · {todo.notes}</>}
            </p>
          </div>
          {!done && (
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => saveTodo(todo.id, { status: e.target.value as MilestoneStatus })}
              style={{ color: MILESTONE_STATUS_COLORS[status], borderColor: status === 'nog_doen' ? undefined : MILESTONE_STATUS_COLORS[status] }}
              className="h-8 max-w-36 px-2 text-[13px] font-medium bg-white border border-[#DDD8D2] rounded-full shrink-0 focus:outline-none"
            >
              {OPEN_STATUSES.map((s) => (
                <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}
          {!done && (
            <select
              aria-label="Toegewezen aan"
              value={todo.assigned_to ?? ''}
              onChange={(e) => saveTodo(todo.id, { assigned_to: e.target.value || null })}
              className="h-8 max-w-40 px-2 text-[13px] bg-[#FAF8F5] border border-[#DDD8D2] rounded-full focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">Niemand</option>
              {assigneeNames(assignees, todo.assigned_to).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
          {!done && dateButton(todo, date)}
        </div>
        {isEditing && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:pl-[106px]">
            <Input
              key={`label-${todo.id}`}
              aria-label="Naam"
              defaultValue={todo.label ?? ''}
              onBlur={(e) => {
                const label = e.target.value.trim()
                if (label && label !== todo.label) saveTodo(todo.id, { label })
              }}
              className="h-8 basis-full"
            />
            <Input
              type="date"
              aria-label="Datum"
              value={todo.date ?? ''}
              onChange={(e) => saveTodo(todo.id, { date: e.target.value || null })}
              className="h-8 w-40"
            />
            <Input
              key={`notes-${todo.id}`}
              aria-label="Notitie"
              placeholder="Notitie"
              defaultValue={todo.notes ?? ''}
              onBlur={(e) => {
                const value = e.target.value.trim() || null
                if (value !== todo.notes) saveTodo(todo.id, { notes: value })
              }}
              className="h-8 flex-1 min-w-[180px]"
            />
            <button type="button" onClick={() => removeTodo(todo)} aria-label="To do verwijderen" className="p-1.5">
              <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
            </button>
            <button type="button" onClick={() => setEditingTodo(null)} aria-label="Sluiten" className="p-1.5 text-[#6B6560] hover:text-[#1C1B19]">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  // --- Aantekeningen --------------------------------------------------------

  function updateNoteLocal(id: string, patch: Partial<InternalNote>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  async function saveNote(id: string, patch: Partial<InternalNote>) {
    const updated_at = new Date().toISOString()
    updateNoteLocal(id, { ...patch, updated_at })
    const { error: updError } = await supabase.from('finka_internal_notes').update({ ...patch, updated_at }).eq('id', id)
    if (updError) fail(`Opslaan mislukt: ${updError.message}`)
  }

  async function addNote() {
    const { data, error: insError } = await supabase.from('finka_internal_notes').insert({ title: '', body: '' }).select().single()
    if (insError) {
      fail(`Toevoegen mislukt: ${insError.message}`)
      return
    }
    setNotes((prev) => sortNotes([data as InternalNote, ...prev]))
  }

  async function removeNote(note: InternalNote) {
    if ((note.title || note.body) && !confirm(`Aantekening "${note.title || note.body.slice(0, 40)}" verwijderen?`)) return
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    const { error: delError } = await supabase.from('finka_internal_notes').delete().eq('id', note.id)
    if (delError) fail(`Verwijderen mislukt: ${delError.message}`)
  }

  // --- Inspiratie -----------------------------------------------------------

  // Rechtstreeks naar Storage (geen API-route: Vercel laat >4,5 MB niet door).
  async function uploadFiles(files: FileList | File[]) {
    setError('')
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        fail(`"${file.name}" is groter dan 20 MB.`)
        continue
      }
      setUploading((n) => n + 1)
      const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : ''
      const path = `inspiratie/${crypto.randomUUID()}${extension}`
      const { error: upError } = await supabase.storage
        .from('intern')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (upError) {
        fail(`Uploaden mislukt: ${upError.message}`)
        setUploading((n) => n - 1)
        continue
      }
      const { data: urlData } = supabase.storage.from('intern').getPublicUrl(path)
      const { data, error: insError } = await supabase
        .from('finka_internal_inspiration')
        .insert({
          kind: file.type.startsWith('image/') ? 'afbeelding' : 'bestand',
          title: file.name.replace(/\.[^.]+$/, ''),
          file_url: urlData.publicUrl,
          storage_path: path,
        })
        .select()
        .single()
      setUploading((n) => n - 1)
      if (insError) {
        fail(`Opslaan mislukt: ${insError.message}`)
        await supabase.storage.from('intern').remove([path])
        continue
      }
      setInspiration((prev) => [data as InternalInspiration, ...prev])
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault()
    let url = linkUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    const { data, error: insError } = await supabase
      .from('finka_internal_inspiration')
      .insert({ kind: 'link', title: linkTitle.trim() || hostOf(url), url })
      .select()
      .single()
    if (insError) {
      fail(`Toevoegen mislukt: ${insError.message}`)
      return
    }
    setInspiration((prev) => [data as InternalInspiration, ...prev])
    setLinkUrl('')
    setLinkTitle('')
    setAddingLink(false)
  }

  async function saveInspiration(id: string, patch: Partial<InternalInspiration>) {
    setInspiration((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    const { error: updError } = await supabase.from('finka_internal_inspiration').update(patch).eq('id', id)
    if (updError) fail(`Opslaan mislukt: ${updError.message}`)
  }

  async function removeInspiration(item: InternalInspiration) {
    if (!confirm(`"${item.title}" verwijderen?`)) return
    setInspiration((prev) => prev.filter((i) => i.id !== item.id))
    const { error: delError } = await supabase.from('finka_internal_inspiration').delete().eq('id', item.id)
    if (delError) {
      fail(`Verwijderen mislukt: ${delError.message}`)
      return
    }
    if (item.storage_path) await supabase.storage.from('intern').remove([item.storage_path])
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files)
    if (files.length) {
      e.preventDefault()
      uploadFiles(files)
    }
  }

  const inputClass = 'h-9 px-2.5 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#4E6B5A] min-w-0'

  return (
    <div className="space-y-6">
      {error && (
        <p className="flex items-start gap-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Sluiten"><X size={14} /></button>
        </p>
      )}

      {/* Onder elkaar, elk over de volle breedte: to do's, aantekeningen, inspiratie. */}
      <div className="space-y-6">
        <Section title="To do's" count={openTodos.length}>
          <form onSubmit={addTodo} className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#EEF2EF]">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Nieuwe to do"
              aria-label="Nieuwe to do"
              className="h-9 flex-[1_1_200px]"
            />
            <Input type="date" aria-label="Datum" value={newTodoDate} onChange={(e) => setNewTodoDate(e.target.value)} className="h-9 w-36" />
            <select
              aria-label="Toegewezen aan"
              value={newTodoAssignee}
              onChange={(e) => setNewTodoAssignee(e.target.value)}
              className={`${inputClass} w-32`}
            >
              <option value="">Niemand</option>
              {names.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <Button type="submit" size="sm" className="h-9" disabled={!newTodo.trim()}>
              <Plus size={13} />
              Toevoegen
            </Button>
          </form>
          {openTodos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[#6B6560]">Geen open to do&apos;s.</p>
          ) : (
            // Op de computer een vaste hoogte met eigen scroll, zodat een lange
            // lijst de aantekeningen ernaast niet uit balans trekt.
            <div className="lg:max-h-[620px] lg:overflow-y-auto">{openTodos.map(renderTodo)}</div>
          )}
          {doneTodos.length > 0 && (
            <div className="border-t border-[#EEF2EF]">
              <button
                type="button"
                onClick={() => setShowDone(!showDone)}
                aria-expanded={showDone}
                className={`w-full text-left px-5 py-2.5 text-[13px] text-[#6B6560] hover:text-[#1C1B19] ${INTERN_TINT}`}
              >
                {showDone ? '▾' : '▸'} Afgerond ({doneTodos.length})
              </button>
              {showDone && <div>{doneTodos.map(renderTodo)}</div>}
            </div>
          )}
        </Section>

        <Section
          title="Aantekeningen"
          count={notes.length}
          action={
            <button type="button" onClick={addNote} className={`inline-flex items-center gap-1 text-[13px] ${INTERN_TEXT} hover:text-[#1C1B19]`}>
              <Plus size={13} />
              Aantekening
            </button>
          }
        >
          {notes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[#6B6560]">Nog geen aantekeningen.</p>
          ) : (
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => (
                <article
                  key={note.id}
                  className={`group relative rounded-xl border p-3.5 transition-colors ${
                    note.pinned ? `${INTERN_BORDER} ${INTERN_TINT}` : 'border-[#ECE8E3] bg-[#FDFCFB] hover:border-[#DDD8D2]'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <input
                      aria-label="Titel"
                      placeholder="Titel"
                      value={note.title}
                      onChange={(e) => updateNoteLocal(note.id, { title: e.target.value })}
                      onBlur={(e) => saveNote(note.id, { title: e.target.value.trim() })}
                      className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold text-[#1C1B19] placeholder:text-[#B9B2A9] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveNote(note.id, { pinned: !note.pinned })}
                      aria-label={note.pinned ? 'Losmaken' : 'Vastpinnen'}
                      aria-pressed={note.pinned}
                      className={`p-1 rounded-md ${note.pinned ? INTERN_TEXT : 'text-[#C7C2BB] hover:text-[#4E6B5A]'}`}
                    >
                      <Pin size={14} />
                    </button>
                    <button type="button" onClick={() => removeNote(note)} aria-label="Aantekening verwijderen" className="p-1 rounded-md text-[#C7C2BB] hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <AutoTextarea
                    value={note.body}
                    onChange={(body) => updateNoteLocal(note.id, { body })}
                    onBlur={() => saveNote(note.id, { body: notes.find((n) => n.id === note.id)?.body ?? '' })}
                    placeholder="Schrijf hier…"
                    className="mt-1 w-full min-h-16 bg-transparent text-sm leading-relaxed text-[#1C1B19] placeholder:text-[#B9B2A9] focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-[#9A948D]">{format(new Date(note.updated_at), 'd MMM yyyy', { locale: nl })}</p>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div onPaste={onPaste}>
        <Section
          title="Inspiratie"
          count={inspiration.length}
          action={
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setAddingLink(!addingLink)} className={`inline-flex items-center gap-1 text-[13px] ${INTERN_TEXT} hover:text-[#1C1B19]`}>
                <Link2 size={13} />
                Link
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} className={`inline-flex items-center gap-1 text-[13px] ${INTERN_TEXT} hover:text-[#1C1B19]`}>
                <Upload size={13} />
                Uploaden
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          }
        >
          {addingLink && (
            <form onSubmit={addLink} className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#EEF2EF]">
              <Input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Webadres" aria-label="Webadres" className="h-9 flex-[2_1_240px]" />
              <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Titel (optioneel)" aria-label="Titel" className="h-9 flex-[1_1_180px]" />
              <Button type="submit" size="sm" className="h-9" disabled={!linkUrl.trim()}>Toevoegen</Button>
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setAddingLink(false)}>Annuleren</Button>
            </form>
          )}
          {uploading > 0 && <p className={`px-5 py-2 text-sm ${INTERN_TEXT}`}>Uploaden… ({uploading})</p>}
          {inspiration.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="w-full px-5 py-10 text-sm text-[#6B6560] hover:text-[#1C1B19]"
            >
              Upload afbeeldingen of bestanden, of plak een afbeelding (Ctrl/Cmd+V).
            </button>
          ) : (
            <div className="p-4 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {inspiration.map((item) => {
                const href = item.kind === 'link' ? item.url! : fileHref(item.file_url!)
                return (
                  <figure key={item.id} className="group rounded-xl border border-[#ECE8E3] bg-[#FDFCFB] overflow-hidden flex flex-col">
                    <a href={href} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-[#F3F0EC] overflow-hidden">
                      {item.kind === 'afbeelding' ? (
                        // eslint-disable-next-line @next/next/no-img-element -- privé bestand via /api/bestand (redirect naar signed URL), niet via next/image
                        <img src={href} alt={item.title} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" />
                      ) : (
                        <span className={`w-full h-full flex flex-col items-center justify-center gap-2 ${INTERN_TEXT}`}>
                          {item.kind === 'link' ? <ExternalLink size={22} /> : <FileText size={22} />}
                          <span className="text-xs text-[#6B6560] px-2 truncate max-w-full">
                            {item.kind === 'link' ? hostOf(item.url!) : (item.storage_path ?? '').split('.').pop()?.toUpperCase()}
                          </span>
                        </span>
                      )}
                    </a>
                    <figcaption className="p-2.5 space-y-1">
                      <div className="flex items-start gap-1">
                        <input
                          aria-label="Titel"
                          defaultValue={item.title}
                          onBlur={(e) => {
                            const title = e.target.value.trim()
                            if (title !== item.title) saveInspiration(item.id, { title })
                          }}
                          className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-[#1C1B19] focus:outline-none"
                        />
                        <button type="button" onClick={() => removeInspiration(item)} aria-label="Verwijderen" className="p-0.5 text-[#C7C2BB] hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <AutoTextarea
                        value={item.note ?? ''}
                        onChange={(note) => setInspiration((prev) => prev.map((i) => (i.id === item.id ? { ...i, note } : i)))}
                        onBlur={() => saveInspiration(item.id, { note: inspiration.find((i) => i.id === item.id)?.note?.trim() || null })}
                        placeholder="Notitie"
                        className="w-full bg-transparent text-xs text-[#6B6560] placeholder:text-[#C7C2BB] focus:outline-none"
                      />
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
