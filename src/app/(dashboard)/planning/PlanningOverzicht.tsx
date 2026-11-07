'use client'

import { useState } from 'react'
import Link from 'next/link'
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { CalendarPlus, ListChecks, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Assignee, ChecklistItem, ChecklistTemplateItem, MilestoneStatus, ProjectMilestone } from '@/lib/types'
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_ORDER, RETIRED_MILESTONE_KEY, assigneeNames } from '@/lib/planning'
import { refreshUnlocks } from '@/lib/draaiboek'
import {
  BUCKET_ORDER,
  BUCKET_TITLES,
  PlanningBucket,
  PlanningEntry,
  PlanningProjectInfo,
  buildPlanningEntries,
  compareEntries,
  entryBucket,
  milestoneEntry,
} from '@/lib/planning-overzicht'
import { syncAgenda } from '@/lib/google-calendar-client'
import AfsprakenAgenda from './AfsprakenAgenda'
import AfspraakEditor, { AfspraakValues } from './AfspraakEditor'

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
  volgende: 'text-[#1C1B19]',
  later: 'text-[#6B6560]',
  geen: 'text-[#6B6560]',
}

function projectName(p: PlanningProjectInfo): string {
  return `${p.referenceNumber} · ${p.customerName}`
}

export default function PlanningOverzicht({
  projects,
  initialEntries,
  templates,
  assignees,
  calendarAccount,
  agendaMessage,
}: {
  projects: PlanningProjectInfo[]
  // Al op de server samengesteld (zie page.tsx) — na een wijziging laden we
  // alleen dat ene project opnieuw.
  initialEntries: PlanningEntry[]
  templates: ChecklistTemplateItem[]
  assignees: Assignee[]
  // Google-account waar afspraken in komen; null = nog niet gekoppeld.
  calendarAccount: string | null
  // Melding na het koppelen van Google Agenda (?agenda=… in de URL).
  agendaMessage: { text: string; error: boolean } | null
}) {
  const supabase = createClient()
  const today = startOfDay(new Date())
  const [allEntries, setAllEntries] = useState(initialEntries)
  const [person, setPerson] = useState(PERSON_ALL)
  // Ophogen = datumvelden opnieuw opbouwen, zodat een open datumkiezer sluit
  const [pickerReset, setPickerReset] = useState(0)
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

  // Afspraak-editor: 'new', de key van een afspraak, of dicht.
  const [afspraakKey, setAfspraakKey] = useState<string | null>(null)
  const [savingAfspraak, setSavingAfspraak] = useState(false)

  const names = assigneeNames(assignees)
  const sortedProjects = [...projects].sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber))

  // Persoon- en prio-filter gelden voor allebei; het projectfilter alleen
  // voor de projecttaken. Algemene taken (bedrijf, dashboard) staan apart.
  const matchesPerson = (e: PlanningEntry) =>
    (!onlyPrio || e.priority) &&
    (person === PERSON_ALL || (person === PERSON_NONE ? !e.assignee : e.assignee === person))
  const inProjectFilter = (e: PlanningEntry) => !!e.project && matchesPerson(e) && (!projectFilter || e.project.id === projectFilter)
  // Afspraken staan in de weekagenda, de rest in de takenlijst.
  const afspraken = allEntries.filter((e) => e.isAfspraak && inProjectFilter(e))
  const entries = allEntries.filter((e) => !e.isAfspraak && inProjectFilter(e))
  const editingAfspraak = afspraakKey && afspraakKey !== 'new' ? allEntries.find((e) => e.key === afspraakKey) ?? null : null
  const byBucket = new Map<PlanningBucket, PlanningEntry[]>()
  for (const e of entries) {
    const b = entryBucket(e, today)
    byBucket.set(b, [...(byBucket.get(b) ?? []), e])
  }

  function flash(message: string) {
    setNotice(message)
    setTimeout(() => setNotice(''), 8000)
  }

  function patchEntry(key: string, patch: Partial<PlanningEntry>) {
    setAllEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)))
  }

  // Eén project opnieuw opbouwen uit de database (na afvinken of een nieuwe
  // taak). Geeft de stappen terug die er nieuw bij kwamen.
  async function reloadProject(project: PlanningProjectInfo): Promise<PlanningEntry[]> {
    const { items, error: unlockError } = await refreshUnlocks(supabase, project.id)
    if (unlockError) setError(unlockError)
    const { data: msData, error: msError } = await supabase
      .from('finka_project_milestones')
      .select('*')
      .eq('project_id', project.id)
      .neq('milestone_key', RETIRED_MILESTONE_KEY)
    if (msError) setError(msError.message)
    const fresh = buildPlanningEntries({
      projects: [project],
      items,
      templates,
      milestones: (msData ?? []) as ProjectMilestone[],
      generalTasks: [],
    })
    let added: PlanningEntry[] = []
    setAllEntries((prev) => {
      const before = new Set(prev.filter((e) => e.project?.id === project.id).map((e) => e.key))
      added = fresh.filter((e) => !before.has(e.key))
      return [...prev.filter((e) => e.project?.id !== project.id), ...fresh].sort(compareEntries)
    })
    return added
  }

  // --- Opslaan --------------------------------------------------------------

  async function save(e: PlanningEntry, itemPatch: Partial<ChecklistItem> | null, msPatch: Partial<ProjectMilestone> | null, entryPatch: Partial<PlanningEntry>) {
    patchEntry(e.key, entryPatch)
    const nowIso = new Date().toISOString()
    const { error: updError } =
      itemPatch && e.itemId
        ? await supabase.from('finka_checklist_items').update({ ...itemPatch, updated_at: nowIso }).eq('id', e.itemId)
        : msPatch && e.milestoneId
          ? await supabase.from('finka_project_milestones').update({ ...msPatch, updated_at: nowIso }).eq('id', e.milestoneId)
          : { error: null }
    if (updError) setError(`Opslaan mislukt: ${updError.message}`)
  }

  function togglePriority(e: PlanningEntry) {
    const priority = !e.priority
    save(e, e.itemId ? { priority } : null, e.itemId ? null : { priority }, { priority })
  }

  function setAssignee(e: PlanningEntry, name: string | null) {
    save(e, e.itemId ? { assigned_to: name } : null, e.itemId ? null : { assigned_to: name }, { assignee: name })
  }

  // Bij een stap met afspraak is de datum die van de afspraak.
  function setDate(e: PlanningEntry, date: string | null) {
    if (e.milestoneId) save(e, null, { date }, { date })
    else save(e, { due_date: date }, null, { date })
  }

  function setNotes(e: PlanningEntry, notes: string | null) {
    save(e, e.itemId ? { notes } : null, e.itemId ? null : { notes }, { notes })
  }

  function setStatus(e: PlanningEntry, status: MilestoneStatus) {
    save(e, null, { status }, { milestoneStatus: status })
  }

  // Afvinken. Bij een draaiboekstap gaat de gekoppelde afspraak mee en
  // komen daarna de stappen vrij die erop wachtten.
  async function setDone(e: PlanningEntry, done: boolean) {
    setError('')
    setLastDone(done ? e : null)
    if (done) setAllEntries((prev) => prev.filter((x) => x.key !== e.key))
    const nowIso = new Date().toISOString()
    if (e.itemId) {
      const { error: updError } = await supabase
        .from('finka_checklist_items')
        .update({ checked: done, checked_at: done ? nowIso : null, nvt: false, updated_at: nowIso })
        .eq('id', e.itemId)
      if (updError) {
        setError(`Opslaan mislukt: ${updError.message}`)
        return
      }
    }
    if (e.milestoneId) {
      // Zelfde regel als setStepDone: klaar, of bij heropenen terug naar
      // gepland.
      const status: MilestoneStatus = done ? 'klaar' : e.milestoneStatus === 'klaar' || !e.milestoneStatus ? 'gepland' : e.milestoneStatus
      const { error: msError } = await supabase
        .from('finka_project_milestones')
        .update({ status, updated_at: nowIso })
        .eq('id', e.milestoneId)
      if (msError) {
        setError(`Opslaan mislukt: ${msError.message}`)
        return
      }
    }
    if (e.project) {
      const released = (await reloadProject(e.project)).filter((x) => x.key !== e.key)
      if (released.length) flash(`Vrijgegeven bij ${e.project.customerName}: ${released.map((x) => x.label).join(', ')}`)
    } else if (!done) {
      setAllEntries((prev) => [...prev, { ...e, milestoneStatus: 'gepland' as MilestoneStatus }].sort(compareEntries))
    }
  }

  async function renameGeneral(e: PlanningEntry, label: string) {
    if (!e.milestoneId || !label.trim() || label.trim() === e.label) return
    save(e, null, { label: label.trim() }, { label: label.trim() })
  }

  async function deleteGeneral(e: PlanningEntry) {
    if (!e.milestoneId || !confirm(`"${e.label}" verwijderen?`)) return
    setAllEntries((prev) => prev.filter((x) => x.key !== e.key))
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
      const { data: lastGeneral } = await supabase
        .from('finka_project_milestones')
        .select('sort_order')
        .is('project_id', null)
        .order('sort_order', { ascending: false })
        .limit(1)
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
          sort_order: (lastGeneral?.[0]?.sort_order ?? -1) + 1,
        })
        .select()
        .single()
      setCreating(false)
      if (insError) {
        setError(`Aanmaken mislukt: ${insError.message}`)
        return
      }
      setAllEntries((prev) => [...prev, milestoneEntry(data as ProjectMilestone, null)].sort(compareEntries))
    } else {
      const project = projects.find((p) => p.id === newTarget)
      if (!project) return
      const { data: last } = await supabase
        .from('finka_checklist_items')
        .select('sort_order')
        .eq('project_id', newTarget)
        .order('sort_order', { ascending: false })
        .limit(1)
      const { error: insError } = await supabase.from('finka_checklist_items').insert({
        project_id: newTarget,
        item_key: null,
        category: project.phaseLabel ?? 'Overig',
        label: newLabel.trim(),
        due_date: newDate || null,
        assigned_to: newAssignee || null,
        priority: newPriority,
        unlocked_at: new Date().toISOString(),
        sort_order: (last?.[0]?.sort_order ?? -1) + 1,
      })
      setCreating(false)
      if (insError) {
        setError(`Aanmaken mislukt: ${insError.message}`)
        return
      }
      await reloadProject(project)
    }
    resetNewTask()
  }

  // --- Afspraken --------------------------------------------------------------

  // Na opslaan: naar Google Agenda (de server kijkt zelf of dat moet) en
  // het project opnieuw opbouwen, zodat Meet-link en fouten zichtbaar zijn.
  async function pushToAgenda(milestoneId: string, project: PlanningProjectInfo, wasInGoogle: boolean, inGoogle: boolean) {
    if (inGoogle || wasInGoogle) {
      const result = await syncAgenda(milestoneId)
      if (!result.ok) setError(`Google Agenda: ${result.error ?? 'onbekende fout'}`)
      else if (inGoogle) flash(result.meet_link ? 'In Google Agenda gezet, met Meet-link.' : 'In Google Agenda gezet.')
    }
    await reloadProject(project)
  }

  async function saveAfspraak(v: AfspraakValues) {
    const project = projects.find((p) => p.id === v.projectId)
    if (!project) return
    setSavingAfspraak(true)
    setError('')
    const nowIso = new Date().toISOString()
    const fields = {
      date: v.date || null,
      start_time: v.startTime || null,
      end_time: v.endTime || null,
      assigned_to: v.assignee || null,
      notes: v.notes.trim() || null,
      in_google_calendar: v.inGoogle,
      with_meet: v.inGoogle && v.withMeet,
      invite_customer: v.inGoogle && v.inviteCustomer,
      updated_at: nowIso,
    }

    let milestoneId: string | null = null
    let wasInGoogle = false
    if (editingAfspraak?.milestoneId) {
      milestoneId = editingAfspraak.milestoneId
      wasInGoogle = !!editingAfspraak.agenda?.inGoogle
      // Bij een draaiboekstap is de naam die van de stap.
      const labelChanged = v.label.trim() && v.label.trim() !== editingAfspraak.label
      if (labelChanged && editingAfspraak.itemId) {
        await supabase.from('finka_checklist_items').update({ label: v.label.trim(), updated_at: nowIso }).eq('id', editingAfspraak.itemId)
      }
      const { error: updError } = await supabase
        .from('finka_project_milestones')
        .update({ ...fields, ...(labelChanged && !editingAfspraak.itemId ? { label: v.label.trim() } : {}) })
        .eq('id', milestoneId)
      if (updError) {
        setError(`Opslaan mislukt: ${updError.message}`)
        setSavingAfspraak(false)
        return
      }
    } else {
      // Een vaste afspraak (Meting, Levering, …) bestaat al per project:
      // die rij krijgt de datum. "Anders" wordt een eigen afspraak.
      if (v.milestoneKey !== 'custom') {
        const { data: existing } = await supabase
          .from('finka_project_milestones')
          .select('id, status, in_google_calendar')
          .eq('project_id', project.id)
          .eq('milestone_key', v.milestoneKey)
          .maybeSingle()
        if (existing) {
          milestoneId = existing.id
          wasInGoogle = !!existing.in_google_calendar
          const { error: updError } = await supabase
            .from('finka_project_milestones')
            .update({ ...fields, status: existing.status === 'klaar' ? 'gepland' : existing.status })
            .eq('id', existing.id)
          if (updError) {
            setError(`Opslaan mislukt: ${updError.message}`)
            setSavingAfspraak(false)
            return
          }
        }
      }
      if (!milestoneId) {
        const { data: last } = await supabase
          .from('finka_project_milestones')
          .select('sort_order')
          .eq('project_id', project.id)
          .order('sort_order', { ascending: false })
          .limit(1)
        const { data, error: insError } = await supabase
          .from('finka_project_milestones')
          .insert({
            ...fields,
            project_id: project.id,
            milestone_key: v.milestoneKey,
            label: v.milestoneKey === 'custom' ? v.label.trim() : null,
            status: 'gepland',
            priority: false,
            sort_order: (last?.[0]?.sort_order ?? -1) + 1,
          })
          .select('id')
          .single()
        if (insError) {
          setError(`Aanmaken mislukt: ${insError.message}`)
          setSavingAfspraak(false)
          return
        }
        milestoneId = data.id
      }
    }

    await pushToAgenda(milestoneId!, project, wasInGoogle, v.inGoogle)
    setSavingAfspraak(false)
    setAfspraakKey(null)
  }

  async function finishAfspraak(e: PlanningEntry) {
    setAfspraakKey(null)
    await setDone(e, true)
  }

  // Alleen eigen afspraken ("Anders") kunnen weg; vaste afspraken horen bij
  // elk project. Eerst het event uit Google Agenda halen.
  async function deleteAfspraak(e: PlanningEntry) {
    if (!e.milestoneId || !e.project || !confirm(`Afspraak "${e.label}" verwijderen?${e.agenda?.inGoogle ? ' Hij gaat ook uit Google Agenda.' : ''}`)) return
    setSavingAfspraak(true)
    if (e.agenda?.inGoogle) {
      const result = await syncAgenda(e.milestoneId, 'remove')
      if (!result.ok) {
        setError(`Google Agenda: ${result.error ?? 'onbekende fout'}`)
        setSavingAfspraak(false)
        return
      }
    }
    const { error: delError } = await supabase.from('finka_project_milestones').delete().eq('id', e.milestoneId)
    if (delError) setError(`Verwijderen mislukt: ${delError.message}`)
    await reloadProject(e.project)
    setSavingAfspraak(false)
    setAfspraakKey(null)
  }

  // --- Weergave -------------------------------------------------------------

  function dateText(date: string | null): { text: string; className: string } {
    if (!date) return { text: 'Geen datum', className: 'text-[#9A948D]' }
    const days = differenceInCalendarDays(new Date(date), today)
    const short = format(new Date(date), 'EEEEEE d MMM', { locale: nl })
    if (days < 0) return { text: format(new Date(date), 'd MMM', { locale: nl }), className: 'text-red-600 font-medium' }
    if (days === 0) return { text: 'Vandaag', className: 'text-[#8A6A2E] font-medium' }
    if (days === 1) return { text: 'Morgen', className: 'text-[#8A6A2E] font-medium' }
    return { text: short, className: 'text-[#6B6560]' }
  }

  // Klik op de datum opent meteen de datumkiezer; zonder showPicker (oudere
  // browsers) klapt de rij open met het datumveld. Het onzichtbare veld krijgt
  // geen focus, dus de browser sluit de kiezer niet zelf bij een klik ernaast:
  // daarom bouwen we het veld bij de volgende klik op de pagina opnieuw op.
  function dateButton(e: PlanningEntry, date: { text: string; className: string }, className: string) {
    return (
      <span className={`relative inline-block ${className}`}>
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
            setEditingKey(e.key)
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
          value={e.date ?? ''}
          onChange={(ev) => setDate(e, ev.target.value || null)}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      </span>
    )
  }

  // compact = het smalle FINKA intern-vak: persoon en datum als één regel
  // onder de naam; persoon kiezen kan in het uitklapdeel.
  function renderRow(e: PlanningEntry, compact = false) {
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
            {compact ? (
              (e.assignee || e.date || e.notes) && (
                <p className="text-[13px] text-[#6B6560] truncate">
                  {[e.assignee, e.notes].filter(Boolean).join(' · ')}
                  {e.date && (
                    <>
                      {e.assignee || e.notes ? ' · ' : ''}
                      {dateButton(e, date, '')}
                    </>
                  )}
                </p>
              )
            ) : (
            <p className="text-[13px] text-[#6B6560] truncate">
              {e.project ? (
                <>
                  <Link href={`/projecten/${e.project.id}?tab=planning`} className="hover:text-[#8A6A2E] hover:underline">
                    {projectName(e.project)}
                  </Link>
                  {e.phase && <> · {e.phase}</>}
                </>
              ) : (
                'FINKA intern'
              )}
              {e.notes && <> · {e.notes}</>}
            </p>
            )}
          </div>
          {!compact && (
          <>
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
          {dateButton(e, date, 'w-24 text-right text-[13px] shrink-0')}
          </>
          )}
        </div>
        {isEditing && (
          <div className={`flex flex-wrap items-center gap-2 px-4 pb-3 ${compact ? '' : 'sm:pl-[88px]'}`}>
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
            {compact && (
              <select
                aria-label="Toegewezen aan"
                value={e.assignee ?? ''}
                onChange={(ev) => setAssignee(e, ev.target.value || null)}
                className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
              >
                <option value="">Niemand</option>
                {assigneeNames(assignees, e.assignee).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
            {e.milestoneId && !e.itemId && (
              <select
                aria-label="Status"
                value={e.milestoneStatus ?? 'gepland'}
                onChange={(ev) => setStatus(e, ev.target.value as MilestoneStatus)}
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

  const undated = byBucket.get('geen') ?? []
  const undatedGroups = new Map<string, { title: string; entries: PlanningEntry[] }>()
  for (const e of undated) {
    const key = e.project!.id
    const group = undatedGroups.get(key) ?? { title: projectName(e.project!), entries: [] }
    group.entries.push(e)
    undatedGroups.set(key, group)
  }

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Toegewezen aan
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className="h-8 w-44 px-2 text-[13px] text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          >
            <option value={PERSON_ALL}>Iedereen</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value={PERSON_NONE}>Niemand</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Project
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-8 w-64 max-w-full px-2 text-[13px] text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="">Alle</option>
            {sortedProjects.map((p) => (
              <option key={p.id} value={p.id}>{projectName(p)}</option>
            ))}
          </select>
        </label>
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
        <Button size="sm" variant="outline" className="ml-auto border-[#C9A96E] bg-[#FBF7EF] text-[#6E5322] hover:bg-[#F6EFE2]" onClick={() => setAfspraakKey('new')}>
          <CalendarPlus size={13} />
          Afspraak
        </Button>
      </div>

      {agendaMessage && (
        <p className={`text-sm rounded-lg px-4 py-2.5 border ${agendaMessage.error ? 'text-red-600 bg-red-50 border-red-100' : 'text-[#5E4A20] bg-[#F6EFE2] border-[#EADBC0]'}`}>
          {agendaMessage.text}
        </p>
      )}

      {afspraakKey && (afspraakKey === 'new' || editingAfspraak) && (
        <AfspraakEditor
          key={afspraakKey}
          entry={editingAfspraak}
          projects={sortedProjects}
          names={names}
          calendarAccount={calendarAccount}
          saving={savingAfspraak}
          onSave={saveAfspraak}
          onCancel={() => setAfspraakKey(null)}
          onDone={editingAfspraak ? () => finishAfspraak(editingAfspraak) : undefined}
          onDelete={editingAfspraak && !editingAfspraak.itemId && editingAfspraak.agenda?.custom ? () => deleteAfspraak(editingAfspraak) : undefined}
        />
      )}

      <AfsprakenAgenda
        afspraken={afspraken}
        today={today}
        calendarAccount={calendarAccount}
        selectedKey={afspraakKey}
        onOpen={(e) => setAfspraakKey(e.key)}
      />

      <div className="flex items-center gap-2.5 pt-2">
        <ListChecks size={18} className="text-[#1C1B19]" aria-hidden />
        <h2 className="text-[15px] font-semibold text-[#1C1B19]">Taken</h2>
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

      <div className="space-y-5">
      {entries.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-14 text-center">
          <p className="text-sm text-[#6B6560]">Geen projecttaken voor dit filter.</p>
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
            <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">{list.map((e) => renderRow(e))}</div>
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
                  {isOpen && <div className="bg-[#FCFBF9] border-t border-[#EFEBE6]">{group.entries.map((e) => renderRow(e))}</div>}
                </div>
              )
            })}
          </div>
        </section>
      )}
      </div>
    </div>
  )
}
