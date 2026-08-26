'use client'

import { useState } from 'react'
import Link from 'next/link'
import { differenceInCalendarDays, format, isSameMonth, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MilestoneAssignee, MilestoneStatus, ProjectMilestone } from '@/lib/types'
import {
  ASSIGNEE_OPTIONS,
  MILESTONE_STATUS_COLORS,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_ORDER,
  milestoneLabel,
  urgencyClass,
} from '@/lib/planning'

export interface PlanningProject {
  id: string
  title: string
  referenceNumber: string
  customerName: string
  statusLabel: string | null
  statusColor: string
  milestones: ProjectMilestone[]
}

interface AgendaEntry {
  project: PlanningProject
  milestone: ProjectMilestone
}

const ASSIGNEE_FILTER_NONE = '__niemand__'
const GENERAL_TASK_OPTION = '__algemeen__'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Groepskopjes — vaste labels dichtbij vandaag, daarna per kalendermaand.
// Omdat alles chronologisch gesorteerd is, verandert dit label monotoon
// tijdens het doorlopen van de lijst (geen aparte sorteerstap nodig).
function bucketLabel(date: Date, today: Date): string {
  const days = differenceInCalendarDays(date, today)
  if (days < 0) return 'Te laat'
  if (days === 0) return 'Vandaag'
  if (days === 1) return 'Morgen'
  if (days <= 7) return 'Deze week'
  if (days <= 14) return 'Volgende week'
  if (isSameMonth(date, today)) return 'Deze maand'
  return capitalize(format(date, 'MMMM yyyy', { locale: nl }))
}

function relativeLabel(date: Date, today: Date): string {
  const days = differenceInCalendarDays(date, today)
  if (days === 0) return 'vandaag'
  if (days === 1) return 'morgen'
  if (days === -1) return 'gisteren'
  if (days > 0) return `over ${days} dagen`
  return `${Math.abs(days)} dagen geleden`
}

function UnplannedList({ projects }: { projects: PlanningProject[] }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
      <h2 className="text-sm font-medium text-[#1C1B19] mb-3">Nog niet (volledig) gepland</h2>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projecten/${p.id}`}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-[#DDD8D2] text-[#6B6560] hover:border-[#C9A96E] hover:text-[#1C1B19] transition-colors"
          >
            {p.customerName} · {p.title}
          </Link>
        ))}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
        active
          ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
          : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
      }`}
    >
      {children}
    </button>
  )
}

export default function PlanningAgenda({
  projects: initialProjects,
  generalTasks: initialGeneralTasks,
}: {
  projects: PlanningProject[]
  generalTasks: ProjectMilestone[]
}) {
  const supabase = createClient()
  const today = startOfDay(new Date())
  const [projects, setProjects] = useState(initialProjects)
  const [generalTasks, setGeneralTasks] = useState(
    [...initialGeneralTasks].sort((a, b) => a.sort_order - b.sort_order)
  )
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'alle' | MilestoneStatus>('alle')
  const [assigneeFilter, setAssigneeFilter] = useState<'alle' | MilestoneAssignee | typeof ASSIGNEE_FILTER_NONE>('alle')
  // Notitie/titel lokaal apart bijhouden zodat elke toets niet meteen een
  // save + re-render van de hele lijst triggert — opslaan gebeurt pas
  // onBlur (status/toewijzing/filter wel direct, dat zijn geen tekstvelden).
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})

  // Nieuwe-taak-formulier — los van bovenstaande, want dit hangt nog nergens
  // aan een bestaande mijlpaal totdat 'ie is aangemaakt.
  const [addingTask, setAddingTask] = useState(false)
  const [newProjectId, setNewProjectId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newStatus, setNewStatus] = useState<MilestoneStatus>('nog_doen')
  const [newAssignee, setNewAssignee] = useState<MilestoneAssignee | ''>('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const sortedProjectOptions = [...projects].sort((a, b) =>
    `${a.customerName} ${a.title}`.localeCompare(`${b.customerName} ${b.title}`, 'nl')
  )

  function resetNewTaskForm() {
    setNewProjectId('')
    setNewTitle('')
    setNewDate('')
    setNewStatus('nog_doen')
    setNewAssignee('')
    setNewNotes('')
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newProjectId || !newTitle.trim()) return
    setCreating(true)
    setError('')

    const isGeneral = newProjectId === GENERAL_TASK_OPTION
    const targetProject = isGeneral ? undefined : projects.find((p) => p.id === newProjectId)
    const maxSort = isGeneral
      ? generalTasks.reduce((max, m) => Math.max(max, m.sort_order), -1)
      : (targetProject?.milestones.reduce((max, m) => Math.max(max, m.sort_order), -1) ?? -1)

    const { data, error: insError } = await supabase
      .from('finka_project_milestones')
      .insert({
        project_id: isGeneral ? null : newProjectId,
        milestone_key: 'custom',
        label: newTitle.trim(),
        date: newDate || null,
        status: newStatus,
        assigned_to: newAssignee || null,
        notes: newNotes.trim() || null,
        sort_order: maxSort + 1,
      })
      .select()
      .single()

    setCreating(false)
    if (insError) {
      setError(`Aanmaken mislukt: ${insError.message}`)
      return
    }

    if (isGeneral) {
      setGeneralTasks((prev) => [...prev, data as ProjectMilestone])
    } else {
      setProjects((prev) =>
        prev.map((p) => (p.id === newProjectId ? { ...p, milestones: [...p.milestones, data as ProjectMilestone] } : p))
      )
    }
    resetNewTaskForm()
    setAddingTask(false)
  }

  // Wijzigt één mijlpaal, ongeacht in welk project 'ie zit (of geen project,
  // voor algemene taken — projectId dan null) — optimistisch bijgewerkt in
  // de UI, en meteen weggeschreven naar Supabase. Bij een foutmelding draaien
  // we de lokale wijziging terug zodat de UI niet iets toont wat niet is
  // opgeslagen.
  async function updateMilestone(projectId: string | null, milestoneId: string, patch: Partial<ProjectMilestone>) {
    const previousProjects = projects
    const previousGeneral = generalTasks
    if (projectId === null) {
      setGeneralTasks((prev) => prev.map((m) => (m.id === milestoneId ? { ...m, ...patch } : m)))
    } else {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, milestones: p.milestones.map((m) => (m.id === milestoneId ? { ...m, ...patch } : m)) }
        )
      )
    }
    setError('')
    const { error: updError } = await supabase
      .from('finka_project_milestones')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', milestoneId)
    if (updError) {
      setProjects(previousProjects)
      setGeneralTasks(previousGeneral)
      setError(`Opslaan mislukt: ${updError.message}`)
    }
  }

  function saveNoteIfChanged(projectId: string | null, milestone: ProjectMilestone) {
    const draft = noteDrafts[milestone.id]
    if (draft === undefined || draft === (milestone.notes ?? '')) return
    updateMilestone(projectId, milestone.id, { notes: draft || null })
  }

  function saveTitleIfChanged(projectId: string | null, milestone: ProjectMilestone) {
    const draft = titleDrafts[milestone.id]
    if (draft === undefined || draft === (milestone.label ?? '')) return
    updateMilestone(projectId, milestone.id, { label: draft || null })
  }

  async function deleteGeneralTask(milestoneId: string) {
    if (!confirm('Deze algemene taak verwijderen?')) return
    const previous = generalTasks
    setGeneralTasks((prev) => prev.filter((m) => m.id !== milestoneId))
    const { error: delError } = await supabase.from('finka_project_milestones').delete().eq('id', milestoneId)
    if (delError) {
      setGeneralTasks(previous)
      setError(`Verwijderen mislukt: ${delError.message}`)
    }
  }

  let entries: AgendaEntry[] = []
  const unplanned: PlanningProject[] = []

  for (const project of projects) {
    const upcoming = project.milestones.filter((m) => !!m.date && m.status !== 'klaar')
    if (upcoming.length) {
      for (const m of upcoming) entries.push({ project, milestone: m })
    } else if (project.milestones.some((m) => !m.date)) {
      // Alles wat wél een datum had staat al op 'klaar' — verder niks te
      // plannen. Alleen tonen als er nog een leeg mijlpunt openstaat.
      unplanned.push(project)
    }
  }

  entries.sort(
    (a, b) => new Date(a.milestone.date as string).getTime() - new Date(b.milestone.date as string).getTime()
  )

  const hasAnyEntries = entries.length > 0

  if (statusFilter !== 'alle') {
    entries = entries.filter((e) => e.milestone.status === statusFilter)
  }
  if (assigneeFilter !== 'alle') {
    entries = entries.filter((e) =>
      assigneeFilter === ASSIGNEE_FILTER_NONE ? !e.milestone.assigned_to : e.milestone.assigned_to === assigneeFilter
    )
  }

  if (!projects.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">Nog geen projecten om te plannen.</p>
      </div>
    )
  }

  const errorBanner = error && (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>
  )

  const addTaskSection = (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-4">
      {!addingTask ? (
        <button
          type="button"
          onClick={() => setAddingTask(true)}
          className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19]"
        >
          <Plus size={15} />
          Nieuwe taak
        </button>
      ) : (
        <form onSubmit={handleAddTask} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#1C1B19]">Nieuwe taak</span>
            <button
              type="button"
              onClick={() => { setAddingTask(false); resetNewTaskForm() }}
              className="text-[#9A948D] hover:text-[#1C1B19]"
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              required
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">— Kies klant en project —</option>
              <option value={GENERAL_TASK_OPTION}>— Algemeen (geen project) —</option>
              {sortedProjectOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.customerName} · {p.title}</option>
              ))}
            </select>
            <Input
              required
              placeholder="Titel van de taak"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-9"
            />
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-9"
            />
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as MilestoneStatus)}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              {MILESTONE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value as MilestoneAssignee | '')}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">— Niemand —</option>
              {ASSIGNEE_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Input
              placeholder="Notitie (optioneel)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={creating || !newProjectId || !newTitle.trim()}>
              {creating ? 'Aanmaken...' : 'Taak aanmaken'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setAddingTask(false); resetNewTaskForm() }}>
              Annuleren
            </Button>
          </div>
        </form>
      )}
    </div>
  )

  const generalTasksSection = (
    <div className="w-full lg:w-1/3 shrink-0 space-y-3">
      <h2 className="text-sm font-medium text-[#1C1B19]">Algemene taken</h2>
      {!generalTasks.length ? (
        <p className="text-xs text-[#9A948D]">Geen algemene taken — gebruik &quot;Nieuwe taak&quot; hierboven met &quot;Algemeen&quot; als project.</p>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#EFEBE4]">
          {generalTasks.map((m) => {
            const noteValue = noteDrafts[m.id] ?? m.notes ?? ''
            const titleValue = titleDrafts[m.id] ?? m.label ?? ''
            return (
              <div key={m.id} className="px-5 py-3 space-y-2">
                <input
                  placeholder="Naam van deze taak"
                  value={titleValue}
                  onChange={(e) => setTitleDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onBlur={() => saveTitleIfChanged(null, m)}
                  className="w-full h-8 px-2 text-base text-[#1C1B19] placeholder:text-[#1C1B19] bg-transparent border border-transparent rounded-md hover:border-[#DDD8D2] focus:outline-none focus:border-[#DDD8D2] focus:bg-white"
                />
                <div className="flex flex-wrap items-start gap-3">
                  <div className="shrink-0 flex flex-col gap-0.5">
                    <input
                      type="date"
                      value={m.date ?? ''}
                      onChange={(e) => updateMilestone(null, m.id, { date: e.target.value || null })}
                      className="h-7 w-[9.5rem] px-1.5 text-xs text-[#6B6560] tabular-nums bg-transparent border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
                    />
                    {m.date && (
                      <span className={`text-[10px] pl-1.5 tabular-nums ${urgencyClass(m.date)}`}>
                        {relativeLabel(new Date(m.date), today)}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <select
                      value={m.status}
                      onChange={(e) => updateMilestone(null, m.id, { status: e.target.value as MilestoneStatus })}
                      style={{ color: MILESTONE_STATUS_COLORS[m.status] }}
                      className="h-7 px-1.5 text-xs font-medium bg-transparent border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
                    >
                      {MILESTONE_STATUS_ORDER.map((s) => (
                        <option key={s} value={s} style={{ color: MILESTONE_STATUS_COLORS[s] }}>
                          {MILESTONE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={m.assigned_to ?? ''}
                      onChange={(e) =>
                        updateMilestone(null, m.id, { assigned_to: (e.target.value || null) as MilestoneAssignee | null })
                      }
                      className="h-7 px-1.5 text-xs bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
                    >
                      <option value="">— Niemand —</option>
                      {ASSIGNEE_OPTIONS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteGeneralTask(m.id)}
                    title="Algemene taak verwijderen"
                    className="shrink-0 text-[#C7C2BB] hover:text-red-600 mt-1.5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  placeholder="Notitie..."
                  value={noteValue}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onBlur={() => saveNoteIfChanged(null, m)}
                  className="w-full h-7 px-2 text-xs bg-[#FAF8F5] border border-transparent rounded-md focus:outline-none focus:border-[#DDD8D2] focus:bg-white placeholder:text-[#9A948D]"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  if (!hasAnyEntries) {
    return (
      <div className="space-y-6">
        {errorBanner}
        {addTaskSection}
        <div className="flex flex-col lg:flex-row gap-6">
          {generalTasksSection}
          <div className="flex-1 min-w-0 space-y-3">
            <h2 className="text-sm font-medium text-[#1C1B19]">Project taken</h2>
            <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
              <p className="text-sm text-[#6B6560]">Geen aankomende mijlpalen — vul datums in bij de Planning-tab van een project.</p>
            </div>
            {unplanned.length > 0 && <UnplannedList projects={unplanned} />}
          </div>
        </div>
      </div>
    )
  }

  const filtersActive = statusFilter !== 'alle' || assigneeFilter !== 'alle'

  let prevBucket: string | null = null

  return (
    <div className="space-y-6">
      {errorBanner}

      {addTaskSection}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#9A948D] mr-0.5">Status:</span>
          <FilterChip active={statusFilter === 'alle'} onClick={() => setStatusFilter('alle')}>Alle</FilterChip>
          {MILESTONE_STATUS_ORDER.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {MILESTONE_STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#9A948D] mr-0.5">Toegewezen aan:</span>
          <FilterChip active={assigneeFilter === 'alle'} onClick={() => setAssigneeFilter('alle')}>Alle</FilterChip>
          {ASSIGNEE_OPTIONS.map((a) => (
            <FilterChip key={a} active={assigneeFilter === a} onClick={() => setAssigneeFilter(a)}>{a}</FilterChip>
          ))}
          <FilterChip active={assigneeFilter === ASSIGNEE_FILTER_NONE} onClick={() => setAssigneeFilter(ASSIGNEE_FILTER_NONE)}>
            Niemand
          </FilterChip>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
      {generalTasksSection}

      <div className="flex-1 min-w-0 space-y-3">
      <h2 className="text-sm font-medium text-[#1C1B19]">Project taken</h2>

      {!entries.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Geen mijlpalen die aan dit filter voldoen.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#EFEBE4]">
          {entries.map((entry) => {
            const date = new Date(entry.milestone.date as string)
            const bucket = bucketLabel(date, today)
            const showHeader = !filtersActive && bucket !== prevBucket
            prevBucket = bucket
            const noteValue = noteDrafts[entry.milestone.id] ?? entry.milestone.notes ?? ''
            const titleValue = titleDrafts[entry.milestone.id] ?? entry.milestone.label ?? ''
            return (
              <div key={entry.milestone.id}>
                {showHeader && (
                  <div
                    className={`px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider ${
                      bucket === 'Te laat' ? 'text-red-600' : 'text-[#9A948D]'
                    }`}
                  >
                    {bucket}
                  </div>
                )}
                <div className="px-5 py-3 space-y-2">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="shrink-0 flex flex-col gap-0.5">
                      <input
                        type="date"
                        value={entry.milestone.date ?? ''}
                        onChange={(e) =>
                          updateMilestone(entry.project.id, entry.milestone.id, { date: e.target.value || null })
                        }
                        className="h-7 w-[9.5rem] px-1.5 text-xs text-[#6B6560] tabular-nums bg-transparent border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
                      />
                      <span className={`text-[10px] pl-1.5 tabular-nums ${urgencyClass(entry.milestone.date as string)}`}>
                        {relativeLabel(date, today)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        title="Titel van deze taak aanpassen"
                        placeholder={milestoneLabel(entry.milestone)}
                        value={titleValue}
                        onChange={(e) => setTitleDrafts((prev) => ({ ...prev, [entry.milestone.id]: e.target.value }))}
                        onBlur={() => saveTitleIfChanged(entry.project.id, entry.milestone)}
                        className="w-full h-8 px-2 text-base text-[#1C1B19] placeholder:text-[#1C1B19] bg-transparent border border-transparent rounded-md hover:border-[#DDD8D2] focus:outline-none focus:border-[#DDD8D2] focus:bg-white"
                      />
                      <Link href={`/projecten/${entry.project.id}`} className="text-[10px] pl-2 text-[#9A948D] hover:text-[#C9A96E] truncate block">
                        <span className="font-medium">{entry.project.customerName}</span> · {entry.project.title}
                      </Link>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <select
                        value={entry.milestone.status}
                        onChange={(e) =>
                          updateMilestone(entry.project.id, entry.milestone.id, { status: e.target.value as MilestoneStatus })
                        }
                        style={{ color: MILESTONE_STATUS_COLORS[entry.milestone.status] }}
                        className="h-7 px-1.5 text-xs font-medium bg-transparent border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
                      >
                        {MILESTONE_STATUS_ORDER.map((s) => (
                          <option key={s} value={s} style={{ color: MILESTONE_STATUS_COLORS[s] }}>
                            {MILESTONE_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={entry.milestone.assigned_to ?? ''}
                        onChange={(e) =>
                          updateMilestone(entry.project.id, entry.milestone.id, {
                            assigned_to: (e.target.value || null) as MilestoneAssignee | null,
                          })
                        }
                        className="h-7 px-1.5 text-xs bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
                      >
                        <option value="">— Niemand —</option>
                        {ASSIGNEE_OPTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <input
                    placeholder="Notitie..."
                    value={noteValue}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [entry.milestone.id]: e.target.value }))}
                    onBlur={() => saveNoteIfChanged(entry.project.id, entry.milestone)}
                    className="w-full h-7 px-2 text-xs bg-[#FAF8F5] border border-transparent rounded-md focus:outline-none focus:border-[#DDD8D2] focus:bg-white placeholder:text-[#9A948D]"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {unplanned.length > 0 && <UnplannedList projects={unplanned} />}
      </div>
      </div>
    </div>
  )
}
