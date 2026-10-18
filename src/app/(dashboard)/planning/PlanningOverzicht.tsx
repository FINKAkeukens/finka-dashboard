'use client'

import { useState } from 'react'
import Link from 'next/link'
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Assignee, ChecklistItem, ChecklistTemplateItem, MilestoneStatus, ProjectMilestone } from '@/lib/types'
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_ORDER, assigneeNames } from '@/lib/planning'
import { buildSteps, refreshUnlocks, setStepDone } from '@/lib/draaiboek'
import {
  BUCKET_ORDER,
  BUCKET_TITLES,
  PlanningBucket,
  PlanningEntry,
  PlanningProjectInfo,
  buildPlanningEntries,
  entryBucket,
} from '@/lib/planning-overzicht'

// /planning — één lijst over alle lopende projecten: prio bovenaan, dan op
// urgentie. Alles slaat direct op, net als de Planning-tab per project;
// datums van draaiboekstappen en afspraken lopen hier en daar gelijk.

const PERSON_ALL = '__iedereen__'
const PERSON_NONE = '__niemand__'
const GENERAL = '__algemeen__'

const BUCKET_COLORS: Record<PlanningBucket, string> = {
  prio: 'text-red-600',
  laat: 'text-red-600',
  vandaag: 'text-[#8A6A2E]',
  week: 'text-[#1C1B19]',
  later: 'text-[#6B6560]',
  geen: 'text-[#6B6560]',
}

function projectName(p: PlanningProjectInfo): string {
  return `${p.referenceNumber} · ${p.customerName}`
}

export default function PlanningOverzicht({
  projects,
  items: initialItems,
  templates,
  milestones: initialMilestones,
  generalTasks: initialGeneralTasks,
  assignees,
}: {
  projects: PlanningProjectInfo[]
  items: ChecklistItem[]
  templates: ChecklistTemplateItem[]
  milestones: ProjectMilestone[]
  generalTasks: ProjectMilestone[]
  assignees: Assignee[]
}) {
  const supabase = createClient()
  const today = startOfDay(new Date())
  const [items, setItems] = useState(initialItems)
  const [milestones, setMilestones] = useState(initialMilestones)
  const [generalTasks, setGeneralTasks] = useState(initialGeneralTasks)
  const [person, setPerson] = useState(PERSON_ALL)
  const [projectFilter, setProjectFilter] = useState('')
  const [onlyPrio, setOnlyPrio] = useState(false)
  const [openUndated, setOpenUndated] = useState<Set<string>>(new Set())
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastDone, setLastDone] = useState<PlanningEntry | null>(null)

  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newPriority, setNewPriority] = useState(false)
  const [creating, setCreating] = useState(false)

  const names = assigneeNames(assignees)
  const sortedProjects = [...projects].sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber))

  const allEntries = buildPlanningEntries({ projects, items, templates, milestones, generalTasks })
  const entries = allEntries.filter((e) => {
    if (onlyPrio && !e.priority) return false
    if (person === PERSON_NONE && e.assignee) return false
    if (person !== PERSON_ALL && person !== PERSON_NONE && e.assignee !== person) return false
    if (projectFilter === GENERAL && e.project) return false
    if (projectFilter && projectFilter !== GENERAL && e.project?.id !== projectFilter) return false
    return true
  })
  const byBucket = new Map<PlanningBucket, PlanningEntry[]>()
  for (const e of entries) {
    const b = entryBucket(e, today)
    byBucket.set(b, [...(byBucket.get(b) ?? []), e])
  }

  function flash(message: string) {
    setNotice(message)
    setTimeout(() => setNotice(''), 8000)
  }

  // --- Opslaan --------------------------------------------------------------

  async function updateItem(id: string, patch: Partial<ChecklistItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    const { error: updError } = await supabase
      .from('finka_checklist_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(`Opslaan mislukt: ${updError.message}`)
  }

  async function updateMilestone(id: string, patch: Partial<ProjectMilestone>) {
    const apply = (list: ProjectMilestone[]) => list.map((m) => (m.id === id ? { ...m, ...patch } : m))
    setMilestones(apply)
    setGeneralTasks(apply)
    const { error: updError } = await supabase
      .from('finka_project_milestones')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(`Opslaan mislukt: ${updError.message}`)
  }

  function togglePriority(e: PlanningEntry) {
    if (e.itemId) updateItem(e.itemId, { priority: !e.priority })
    else if (e.milestoneId) updateMilestone(e.milestoneId, { priority: !e.priority })
  }

  function setAssignee(e: PlanningEntry, name: string | null) {
    if (e.itemId) updateItem(e.itemId, { assigned_to: name })
    else if (e.milestoneId) updateMilestone(e.milestoneId, { assigned_to: name })
  }

  // Bij een stap met afspraak is de datum die van de afspraak.
  function setDate(e: PlanningEntry, date: string | null) {
    if (e.milestoneId) updateMilestone(e.milestoneId, { date })
    else if (e.itemId) updateItem(e.itemId, { due_date: date })
  }

  function setNotes(e: PlanningEntry, notes: string | null) {
    if (e.itemId) updateItem(e.itemId, { notes })
    else if (e.milestoneId) updateMilestone(e.milestoneId, { notes })
  }

  // Afvinken. Bij een draaiboekstap gaat de gekoppelde afspraak mee en
  // komen daarna de stappen vrij die erop wachtten.
  async function setDone(e: PlanningEntry, done: boolean) {
    setError('')
    setLastDone(done ? e : null)
    if (e.itemId && e.project) {
      const projectId = e.project.id
      const projectItems = items.filter((i) => i.project_id === projectId)
      const projectMilestones = milestones.filter((m) => m.project_id === projectId)
      const before = buildSteps(projectItems, templates, projectMilestones)
      const step = before.find((s) => s.item.id === e.itemId)
      if (!step) return
      const nowIso = new Date().toISOString()
      setItems((prev) =>
        prev.map((i) => (i.id === e.itemId ? { ...i, checked: done, checked_at: done ? nowIso : null, nvt: false } : i))
      )
      const nextMilestones = step.milestone
        ? milestones.map((m) =>
            m.id === step.milestone!.id
              ? { ...m, status: (done ? 'klaar' : m.status === 'klaar' ? 'gepland' : m.status) as MilestoneStatus }
              : m
          )
        : milestones
      setMilestones(nextMilestones)
      const updError = await setStepDone(supabase, step, done)
      if (updError) {
        setError(`Opslaan mislukt: ${updError}`)
        return
      }
      const { items: fresh, error: unlockError } = await refreshUnlocks(supabase, projectId)
      if (unlockError) setError(unlockError)
      if (!fresh.length) return
      setItems((prev) => [...prev.filter((i) => i.project_id !== projectId), ...fresh])
      const visibleBefore = new Set(before.filter((s) => s.visible && !s.done).map((s) => s.item.id))
      const released = buildSteps(fresh, templates, nextMilestones.filter((m) => m.project_id === projectId)).filter(
        (s) => s.visible && !s.done && !visibleBefore.has(s.item.id)
      )
      if (released.length) flash(`Vrijgegeven bij ${e.project.customerName}: ${released.map((s) => s.item.label).join(', ')}`)
    } else if (e.milestoneId) {
      await updateMilestone(e.milestoneId, { status: done ? 'klaar' : e.milestoneStatus === 'klaar' ? 'gepland' : e.milestoneStatus ?? 'gepland' })
    }
  }

  async function renameGeneral(e: PlanningEntry, label: string) {
    if (!e.milestoneId || !label.trim() || label.trim() === e.label) return
    updateMilestone(e.milestoneId, { label: label.trim() })
  }

  async function deleteGeneral(e: PlanningEntry) {
    if (!e.milestoneId || !confirm(`"${e.label}" verwijderen?`)) return
    setGeneralTasks((prev) => prev.filter((m) => m.id !== e.milestoneId))
    setEditingKey(null)
    const { error: delError } = await supabase.from('finka_project_milestones').delete().eq('id', e.milestoneId)
    if (delError) setError(`Verwijderen mislukt: ${delError.message}`)
  }

  function resetNewTask() {
    setNewLabel('')
    setNewTarget('')
    setNewDate('')
    setNewAssignee('')
    setNewPriority(false)
    setAdding(false)
  }

  // Projecttaak = losse stap in de huidige fase van dat project (direct
  // vrijgegeven). Algemeen = mijlpaal zonder project, zoals voorheen.
  async function addTask(ev: React.FormEvent) {
    ev.preventDefault()
    if (!newLabel.trim() || !newTarget) return
    setCreating(true)
    setError('')
    if (newTarget === GENERAL) {
      const maxSort = generalTasks.reduce((max, m) => Math.max(max, m.sort_order), -1)
      const { data, error: insError } = await supabase
        .from('finka_project_milestones')
        .insert({
          project_id: null,
          milestone_key: 'custom',
          label: newLabel.trim(),
          date: newDate || null,
          status: 'nog_doen',
          assigned_to: newAssignee || null,
          priority: newPriority,
          sort_order: maxSort + 1,
        })
        .select()
        .single()
      setCreating(false)
      if (insError) {
        setError(`Aanmaken mislukt: ${insError.message}`)
        return
      }
      setGeneralTasks((prev) => [...prev, data as ProjectMilestone])
    } else {
      const project = projects.find((p) => p.id === newTarget)
      const maxSort = items.filter((i) => i.project_id === newTarget).reduce((max, i) => Math.max(max, i.sort_order), -1)
      const { data, error: insError } = await supabase
        .from('finka_checklist_items')
        .insert({
          project_id: newTarget,
          item_key: null,
          category: project?.phaseLabel ?? 'Overig',
          label: newLabel.trim(),
          due_date: newDate || null,
          assigned_to: newAssignee || null,
          priority: newPriority,
          unlocked_at: new Date().toISOString(),
          sort_order: maxSort + 1,
        })
        .select()
        .single()
      setCreating(false)
      if (insError) {
        setError(`Aanmaken mislukt: ${insError.message}`)
        return
      }
      setItems((prev) => [...prev, data as ChecklistItem])
    }
    resetNewTask()
  }

  // --- Weergave -------------------------------------------------------------

  function dateText(date: string | null): { text: string; className: string } {
    if (!date) return { text: 'Geen datum', className: 'text-[#9A948D]' }
    const days = differenceInCalendarDays(new Date(date), today)
    const short = format(new Date(date), 'EEE d MMM', { locale: nl })
    if (days < 0) return { text: format(new Date(date), 'd MMM', { locale: nl }), className: 'text-red-600 font-medium' }
    if (days === 0) return { text: 'Vandaag', className: 'text-[#8A6A2E] font-medium' }
    if (days === 1) return { text: 'Morgen', className: 'text-[#8A6A2E] font-medium' }
    return { text: short, className: 'text-[#6B6560]' }
  }

  function renderRow(e: PlanningEntry) {
    const isEditing = editingKey === e.key
    const isGeneral = !e.project
    const date = dateText(e.date)
    return (
      <div key={e.key} className="border-t border-[#EFEBE6] first:border-t-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 min-h-14">
          <input
            type="checkbox"
            aria-label="Afvinken"
            checked={false}
            onChange={() => setDone(e, true)}
            className="w-5 h-5 accent-[#1C1B19] shrink-0 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => togglePriority(e)}
            aria-label={e.priority ? 'Prio uitzetten' : 'Prio'}
            aria-pressed={e.priority}
            title="Prio"
            className={`w-7 h-7 rounded-lg border text-sm font-bold shrink-0 transition-colors ${
              e.priority
                ? 'bg-red-600 border-red-600 text-white'
                : 'bg-white border-[#DDD8D2] text-[#C7C2BB] hover:text-red-600 hover:border-red-300'
            }`}
          >
            !
          </button>
          <div className="flex-[999_1_260px] min-w-0">
            <button
              type="button"
              onClick={() => setEditingKey(isEditing ? null : e.key)}
              className="text-left text-[15px] text-[#1C1B19] hover:text-[#8A6A2E]"
              title="Datum, notitie en details"
            >
              {e.label}
              {e.isAfspraak && (
                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-[#8A6A2E] border border-[#E6D6B5] rounded px-1.5 py-px">
                  Afspraak
                </span>
              )}
            </button>
            <p className="text-[13px] text-[#6B6560] truncate">
              {e.project ? (
                <>
                  <Link href={`/projecten/${e.project.id}?tab=planning`} className="hover:text-[#8A6A2E] hover:underline">
                    {projectName(e.project)}
                  </Link>
                  {e.phase && <> · {e.phase}</>}
                </>
              ) : (
                'Algemeen'
              )}
              {e.notes && <> · {e.notes}</>}
            </p>
          </div>
          <select
            aria-label="Toegewezen aan"
            value={e.assignee ?? ''}
            onChange={(ev) => setAssignee(e, ev.target.value || null)}
            className="h-8 max-w-40 px-2 text-[13px] bg-[#FAF8F5] border border-[#DDD8D2] rounded-full focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="">Niemand</option>
            {assigneeNames(assignees, e.assignee).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <span className={`w-24 text-right text-[13px] shrink-0 ${date.className}`}>{date.text}</span>
        </div>
        {isEditing && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:pl-[88px]">
            {isGeneral && (
              <Input
                key={`label-${e.key}`}
                aria-label="Naam taak"
                defaultValue={e.label}
                onBlur={(ev) => renameGeneral(e, ev.target.value)}
                className="h-8 basis-full"
              />
            )}
            <Input
              type="date"
              aria-label="Datum"
              value={e.date ?? ''}
              onChange={(ev) => setDate(e, ev.target.value || null)}
              className="h-8 w-40"
            />
            {e.milestoneId && !e.itemId && (
              <select
                aria-label="Status"
                value={e.milestoneStatus ?? 'gepland'}
                onChange={(ev) => updateMilestone(e.milestoneId!, { status: ev.target.value as MilestoneStatus })}
                className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
              >
                {MILESTONE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            )}
            <Input
              key={`notes-${e.key}`}
              aria-label="Notitie"
              placeholder="Notitie"
              defaultValue={e.notes ?? ''}
              onBlur={(ev) => {
                const notes = ev.target.value.trim() || null
                if (notes !== e.notes) setNotes(e, notes)
              }}
              className="h-8 flex-1 min-w-[180px]"
            />
            {isGeneral && (
              <button type="button" onClick={() => deleteGeneral(e)} aria-label="Taak verwijderen" className="p-1.5">
                <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
              </button>
            )}
            <button type="button" onClick={() => setEditingKey(null)} aria-label="Sluiten" className="p-1.5 text-[#6B6560] hover:text-[#1C1B19]">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  function chip(active: boolean) {
    return `h-8 px-3 text-[13px] rounded-full border transition-colors ${
      active ? 'bg-[#1C1B19] text-white border-[#1C1B19]' : 'bg-white text-[#1C1B19] border-[#DDD8D2] hover:border-[#1C1B19]'
    }`
  }

  const undated = byBucket.get('geen') ?? []
  const undatedGroups = new Map<string, { title: string; entries: PlanningEntry[] }>()
  for (const e of undated) {
    const key = e.project?.id ?? GENERAL
    const group = undatedGroups.get(key) ?? { title: e.project ? projectName(e.project) : 'Algemeen', entries: [] }
    group.entries.push(e)
    undatedGroups.set(key, group)
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#6B6560] mr-1">Toegewezen aan</span>
        <button type="button" className={chip(person === PERSON_ALL)} onClick={() => setPerson(PERSON_ALL)}>Iedereen</button>
        {names.map((n) => (
          <button key={n} type="button" className={chip(person === n)} onClick={() => setPerson(n)}>{n}</button>
        ))}
        <button type="button" className={chip(person === PERSON_NONE)} onClick={() => setPerson(PERSON_NONE)}>Niemand</button>
        <span className="hidden sm:block w-px h-6 bg-[#DDD8D2] mx-1" />
        <select
          aria-label="Project"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 max-w-64 px-2 text-[13px] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
        >
          <option value="">Alle projecten</option>
          <option value={GENERAL}>Algemeen</option>
          {sortedProjects.map((p) => (
            <option key={p.id} value={p.id}>{projectName(p)}</option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={onlyPrio}
          onClick={() => setOnlyPrio(!onlyPrio)}
          className={`h-8 px-3 text-[13px] rounded-full border transition-colors ${
            onlyPrio ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-[#DDD8D2] hover:border-red-300'
          }`}
        >
          ! Alleen prio
        </button>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus size={13} />
          Taak
        </Button>
      </div>

      {adding && (
        <form onSubmit={addTask} className="bg-white rounded-xl border border-[#DDD8D2] p-4 flex flex-wrap items-end gap-2.5">
          <label className="flex-[3_1_240px] flex flex-col gap-1 text-xs text-[#6B6560]">
            Taak
            <Input autoFocus required value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="h-9" />
          </label>
          <label className="flex-[2_1_200px] flex flex-col gap-1 text-xs text-[#6B6560]">
            Project
            <select
              required
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="h-9 px-2 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">— Kies —</option>
              <option value={GENERAL}>Algemeen</option>
              {sortedProjects.map((p) => (
                <option key={p.id} value={p.id}>{projectName(p)}</option>
              ))}
            </select>
          </label>
          <label className="flex-[1_1_140px] flex flex-col gap-1 text-xs text-[#6B6560]">
            Datum
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-9" />
          </label>
          <label className="flex-[1_1_150px] flex flex-col gap-1 text-xs text-[#6B6560]">
            Toegewezen aan
            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              className="h-9 px-2 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">Niemand</option>
              {names.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 h-9 text-sm text-[#1C1B19]">
            <input type="checkbox" checked={newPriority} onChange={(e) => setNewPriority(e.target.checked)} className="w-4 h-4 accent-red-600" />
            Prio
          </label>
          <Button type="submit" size="sm" className="h-9" disabled={creating || !newLabel.trim() || !newTarget}>
            {creating ? 'Bezig...' : 'Toevoegen'}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-9" onClick={resetNewTask}>Annuleren</Button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}
      {notice && <p className="text-sm text-[#5E4A20] bg-[#F6EFE2] border border-[#EADBC0] rounded-lg px-4 py-2.5">{notice}</p>}
      {lastDone && (
        <p className="flex flex-wrap items-center gap-3 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg px-4 py-2.5">
          <span className="flex-1 min-w-0">Afgerond: {lastDone.label}</span>
          <button
            type="button"
            onClick={() => { const e = lastDone; setLastDone(null); setDone(e, false) }}
            className="text-[#8A6A2E] font-medium hover:underline"
          >
            Ongedaan maken
          </button>
        </p>
      )}

      {entries.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-14 text-center">
          <p className="text-sm text-[#6B6560]">Geen taken voor dit filter.</p>
        </div>
      )}

      {BUCKET_ORDER.filter((b) => b !== 'geen').map((bucket) => {
        const list = byBucket.get(bucket)
        if (!list?.length) return null
        return (
          <section key={bucket} className="space-y-2">
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${BUCKET_COLORS[bucket]}`}>
              {BUCKET_TITLES[bucket]} <span className="font-normal text-[#6B6560]">({list.length})</span>
            </h2>
            <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">{list.map(renderRow)}</div>
          </section>
        )
      })}

      {undated.length > 0 && (
        <section className="space-y-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${BUCKET_COLORS.geen}`}>
            {BUCKET_TITLES.geen} <span className="font-normal">({undated.length})</span>
          </h2>
          <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            {Array.from(undatedGroups.entries()).map(([key, group]) => {
              const isOpen = openUndated.has(key)
              return (
                <div key={key} className="border-t border-[#EFEBE6] first:border-t-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      const next = new Set(openUndated)
                      if (isOpen) next.delete(key)
                      else next.add(key)
                      setOpenUndated(next)
                    }}
                    className="w-full flex items-center gap-2.5 px-4 min-h-12 text-left hover:bg-[#FAF8F5]"
                  >
                    <span className="text-[#6B6560] w-3">{isOpen ? '▾' : '▸'}</span>
                    <span className="flex-1 text-sm text-[#1C1B19]">{group.title}</span>
                    <span className="text-[13px] text-[#6B6560]">{group.entries.length} taken</span>
                  </button>
                  {isOpen && <div className="bg-[#FCFBF9] border-t border-[#EFEBE6]">{group.entries.map(renderRow)}</div>}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
