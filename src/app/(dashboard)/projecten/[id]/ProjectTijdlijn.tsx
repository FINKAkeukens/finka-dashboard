'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { differenceInCalendarDays, format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { Check, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Assignee,
  ChecklistCategoryItem,
  ChecklistItem,
  ChecklistTemplateItem,
  MilestoneStatus,
  ProjectMilestone,
} from '@/lib/types'
import { categoryLabel, checklistItemLabel } from '@/lib/checklist'
import { MILESTONE_STATUS_LABELS, MILESTONE_STATUS_ORDER, assigneeNames, milestoneLabel } from '@/lib/planning'
import {
  DraaiboekStep,
  buildSteps,
  createProjectSteps,
  milestonePhases,
  refreshUnlocks,
  releaseStep,
  setStepDone,
  setStepNvt,
  stepDate,
} from '@/lib/draaiboek'

// Planning + checklist in één verticale tijdlijn: één rij per fase (de
// checklist-kopjes, die gelijklopen met de projectstatussen), de huidige
// fase opengeklapt met de open punten op datum, en de afspraken
// (mijlpalen) als labeltjes bij de fase waar ze bij horen. Bewust verticaal
// — de horizontale Gantt is eerder afgewezen (zie /planning).
//
// Alles slaat direct op (zelfde aanpak als de instellingen); na afvinken
// spelen we via refreshUnlocks de stappen vrij die daarop wachtten.

type Phase = {
  label: string
  steps: DraaiboekStep[]
  milestones: ProjectMilestone[]
}

const STEP_SORT_FALLBACK = '9999-12-31'

// Prio bovenaan, daarna op datum.
function sortOpen(steps: DraaiboekStep[]): DraaiboekStep[] {
  return [...steps].sort((a, b) => {
    if (a.item.priority !== b.item.priority) return a.item.priority ? -1 : 1
    const da = stepDate(a) ?? STEP_SORT_FALLBACK
    const db = stepDate(b) ?? STEP_SORT_FALLBACK
    return da !== db ? da.localeCompare(db) : a.item.sort_order - b.item.sort_order
  })
}

function stepLabel(item: ChecklistItem): string {
  return item.item_key ? checklistItemLabel(item) : item.label?.trim() || 'Naamloze taak'
}

export default function ProjectTijdlijn({
  projectId,
  currentPhaseLabel,
  items: initialItems,
  templates,
  categories,
  milestones: initialMilestones,
  assignees,
}: {
  projectId: string
  currentPhaseLabel: string | null
  items: ChecklistItem[]
  templates: ChecklistTemplateItem[]
  categories: ChecklistCategoryItem[]
  milestones: ProjectMilestone[]
  assignees: Assignee[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<ChecklistItem[]>(initialItems)
  const [milestones, setMilestones] = useState<ProjectMilestone[]>(initialMilestones)
  // Na router.refresh() (bv. na opslaan in de afspraken-editor eronder)
  // komen er nieuwe mijlpalen binnen via de props — die nemen we over.
  const [prevInitialMilestones, setPrevInitialMilestones] = useState(initialMilestones)
  if (initialMilestones !== prevInitialMilestones) {
    setPrevInitialMilestones(initialMilestones)
    setMilestones(initialMilestones)
  }

  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  const [showLater, setShowLater] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState<Set<string>>(new Set())
  const [openStepId, setOpenStepId] = useState<string | null>(null)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newPhase, setNewPhase] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newPriority, setNewPriority] = useState(false)
  const savingTask = useRef(false)
  const [savingTaskState, setSavingTaskState] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const steps = buildSteps(items, templates, milestones)
  const templateLabels = new Map(templates.map((t) => [t.id, t.label]))

  // Fases in instellingen-volgorde; kopjes die alleen nog bij dit project
  // bestaan (oude sleutels, hernoemde kopjes) daarna, op hun eerste punt.
  const phaseLabels: string[] = categories.map((c) => c.label)
  const extraOrder = new Map<string, number>()
  for (const s of steps) {
    const label = categoryLabel(s.item.category)
    if (phaseLabels.includes(label)) continue
    extraOrder.set(label, Math.min(extraOrder.get(label) ?? Infinity, s.item.sort_order))
  }
  phaseLabels.push(...Array.from(extraOrder.entries()).sort((a, b) => a[1] - b[1]).map(([label]) => label))

  const phases: Phase[] = phaseLabels.map((label) => ({
    label,
    steps: steps.filter((s) => categoryLabel(s.item.category) === label),
    milestones: [],
  }))

  // Huidige fase = de projectstatus. Is daar alles al klaar (status nog
  // niet bijgezet), dan de eerstvolgende fase waar iets open staat; staat
  // de status niet in de lijst (bv. "On hold" of "Opgeleverd"), dan de
  // eerste fase waar nog iets open staat.
  const hasOpen = (p: Phase) => p.steps.some((s) => !s.done && s.visible)
  let currentIdx = phases.findIndex((p) => p.label === currentPhaseLabel && p.steps.length > 0)
  if (currentIdx >= 0 && !hasOpen(phases[currentIdx])) {
    const nextOpen = phases.findIndex((p, i) => i > currentIdx && hasOpen(p))
    if (nextOpen >= 0) currentIdx = nextOpen
  }
  if (currentIdx < 0) currentIdx = phases.findIndex(hasOpen)
  if (currentIdx < 0) currentIdx = phases.findIndex((p) => p.steps.some((s) => !s.done))
  if (currentIdx < 0) currentIdx = Math.max(phases.length - 1, 0)
  const currentLabel = phases[currentIdx]?.label ?? null

  const linkedMilestoneIds = new Set(steps.filter((s) => s.milestone).map((s) => s.milestone!.id))
  const phaseByMilestone = milestonePhases(templates, categories)
  for (const m of milestones) {
    const label = (m.milestone_key !== 'custom' && phaseByMilestone.get(m.milestone_key)) || currentLabel
    phases.find((p) => p.label === label)?.milestones.push(m)
  }
  const visiblePhases = phases.filter((p) => p.steps.length > 0 || p.milestones.length > 0)

  // Stappen in een látere fase die al vrijgespeeld zijn (draaiboek: alle
  // voorgangers klaar) staan ook al klaar om opgepakt te worden — zo'n fase
  // klapt standaard mee open. Oude punten zonder sjabloon zijn altijd
  // "zichtbaar", die tellen in een latere fase dus niet als klaarstaand.
  function readyLater(phase: Phase): DraaiboekStep[] {
    return phases.indexOf(phase) > currentIdx
      ? phase.steps.filter((s) => !s.done && s.visible && !!s.item.template_id)
      : []
  }
  const defaultExpanded = new Set<string>(currentLabel ? [currentLabel] : [])
  for (const p of visiblePhases) if (readyLater(p).length > 0) defaultExpanded.add(p.label)
  const expandedSet = expanded ?? defaultExpanded
  const allExpanded = visiblePhases.every((p) => expandedSet.has(p.label))

  const total = steps.length
  const doneCount = steps.filter((s) => s.done).length
  const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0

  function toggleIn(set: Set<string>, key: string): Set<string> {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  // Na elke statuswijziging: wachtende stappen vrijspelen en melden welke
  // er nieuw bij zijn gekomen.
  async function afterStatusChange(visibleBefore: Set<string>) {
    const { items: next, error: unlockError } = await refreshUnlocks(supabase, projectId)
    if (unlockError) setError(unlockError)
    if (!next.length) return
    setItems(next)
    const fresh = buildSteps(next, templates, milestones).filter(
      (s) => s.visible && !s.done && !visibleBefore.has(s.item.id)
    )
    if (fresh.length) {
      setNotice(`Vrijgegeven: ${fresh.map((s) => stepLabel(s.item)).join(', ')}`)
      setTimeout(() => setNotice(''), 8000)
    }
  }

  function visibleIds(): Set<string> {
    return new Set(steps.filter((s) => s.visible && !s.done).map((s) => s.item.id))
  }

  async function toggleDone(step: DraaiboekStep) {
    const before = visibleIds()
    const done = !step.done
    const nowIso = new Date().toISOString()
    setError('')
    setItems((prev) =>
      prev.map((i) => (i.id === step.item.id ? { ...i, checked: done, checked_at: done ? nowIso : null, nvt: false } : i))
    )
    if (step.milestone) {
      const msId = step.milestone.id
      const status: MilestoneStatus = done ? 'klaar' : step.milestone.status === 'klaar' ? 'gepland' : step.milestone.status
      setMilestones((prev) => prev.map((m) => (m.id === msId ? { ...m, status } : m)))
    }
    const updError = await setStepDone(supabase, step, done)
    if (updError) {
      setError(updError)
      return
    }
    await afterStatusChange(before)
    if (step.milestone) router.refresh()
  }

  async function toggleNvt(step: DraaiboekStep) {
    const before = visibleIds()
    const nvt = !step.item.nvt
    setError('')
    setItems((prev) => prev.map((i) => (i.id === step.item.id ? { ...i, nvt, checked: false, checked_at: null } : i)))
    const updError = await setStepNvt(supabase, step, nvt)
    if (updError) {
      setError(updError)
      return
    }
    await afterStatusChange(before)
  }

  // Vooruit werken: een toekomstige stap nu al vrijgeven.
  async function release(step: DraaiboekStep) {
    setError('')
    const { patch, error: relError } = await releaseStep(supabase, step)
    if (relError) {
      setError(relError)
      return
    }
    setItems((prev) => prev.map((i) => (i.id === step.item.id ? { ...i, ...patch } : i)))
    setNotice(`Vrijgegeven: ${stepLabel(step.item)}`)
    setTimeout(() => setNotice(''), 8000)
  }

  async function saveItem(id: string, patch: Partial<ChecklistItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    const { error: updError } = await supabase
      .from('finka_checklist_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function saveMilestone(id: string, patch: Partial<ProjectMilestone>) {
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    const { error: updError } = await supabase
      .from('finka_project_milestones')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) {
      setError(updError.message)
      return
    }
    // Projectkop (doorlooptijd) en de afspraken-editor eronder lezen
    // dezelfde mijlpalen server-side.
    router.refresh()
  }

  // Bij een mijlpaal-stap is de datum de afspraakdatum van de mijlpaal.
  function saveDate(step: DraaiboekStep, date: string | null) {
    if (step.milestone) saveMilestone(step.milestone.id, { date })
    else saveItem(step.item.id, { due_date: date })
  }

  async function removeStep(step: DraaiboekStep) {
    if (!window.confirm(`"${stepLabel(step.item)}" verwijderen bij dit project?`)) return
    setItems((prev) => prev.filter((i) => i.id !== step.item.id))
    setOpenStepId(null)
    const { error: delError } = await supabase.from('finka_checklist_items').delete().eq('id', step.item.id)
    if (delError) setError(delError.message)
  }

  function resetNewTask() {
    setNewLabel('')
    setNewDate('')
    setNewPhase('')
    setNewAssignee('')
    setNewPriority(false)
    setAdding(false)
  }

  async function addTask() {
    const phaseLabel = newPhase || currentLabel
    if (!newLabel.trim() || !phaseLabel) {
      setAdding(false)
      return
    }
    // Enter + klik (of twee keer klikken) mag geen dubbele taak opleveren.
    if (savingTask.current) return
    savingTask.current = true
    setSavingTaskState(true)
    const maxOrder = items.reduce((max, i) => Math.max(max, i.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_checklist_items')
      .insert({
        project_id: projectId,
        item_key: null,
        category: phaseLabel,
        label: newLabel.trim(),
        due_date: newDate || null,
        assigned_to: newAssignee || null,
        priority: newPriority,
        unlocked_at: new Date().toISOString(),
        sort_order: maxOrder + 1,
      })
      .select()
      .single()
    savingTask.current = false
    setSavingTaskState(false)
    if (insError) {
      setError(insError.message)
      return
    }
    setItems((prev) => [...prev, data as ChecklistItem])
    // Taak in een andere fase: die fase openklappen zodat 'ie te zien is.
    if (phaseLabel !== currentLabel) setExpanded(new Set([...expandedSet, phaseLabel]))
    resetNewTask()
  }

  async function createChecklist() {
    setCreating(true)
    setError('')
    const createError = await createProjectSteps(supabase, projectId)
    if (createError) {
      setError(createError)
      setCreating(false)
      return
    }
    const { data, error: loadError } = await supabase.from('finka_checklist_items').select('*').eq('project_id', projectId)
    setCreating(false)
    if (loadError) setError(loadError.message)
    setItems((data ?? []) as ChecklistItem[])
  }

  if (total === 0) {
    return (
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 flex flex-col items-center text-center gap-3">
          <p className="text-sm text-[#6B6560] max-w-sm">
            Dit project heeft nog geen checklist. Maak &apos;m aan op basis van het draaiboek uit Instellingen — daarna
            verschijnen de stappen hier vanzelf op het juiste moment.
          </p>
          <Button onClick={createChecklist} disabled={creating}>
            {creating ? 'Bezig...' : 'Checklist aanmaken'}
          </Button>
        </div>
      </div>
    )
  }

  function renderDate(step: DraaiboekStep) {
    const date = stepDate(step)
    if (!date) {
      if (step.done) return null
      return (
        <span className="text-xs text-[#9A948D] border border-dashed border-[#CFC8BF] rounded-md px-2 py-0.5">+ datum</span>
      )
    }
    const text = format(new Date(date), 'd MMM', { locale: nl })
    if (step.done) return <span className="text-[#9A948D]">{text}</span>
    const days = differenceInCalendarDays(new Date(date), new Date())
    if (days < 0) return <span className="text-red-600 font-medium">te laat · {text}</span>
    if (days === 0) return <span className="text-[#8A6A2E] font-medium">vandaag</span>
    if (days === 1) return <span className="text-[#8A6A2E] font-medium">morgen</span>
    if (days <= 7) return <span className="text-[#8A6A2E] font-medium">{text}</span>
    return <span className="text-[#6B6560]">{text}</span>
  }

  function renderStep(step: DraaiboekStep, opts: { locked?: boolean } = {}) {
    const { item } = step
    const date = stepDate(step)
    const overdue = !step.done && !!date && differenceInCalendarDays(new Date(date), new Date()) < 0
    const isOpen = openStepId === item.id
    const afterSteps = opts.locked
      ? (step.template?.depends_on ?? []).map((id) => templateLabels.get(id)).filter(Boolean).join(', ')
      : ''
    return (
      <div key={item.id} className={`border-b border-[#F3F0EB] last:border-b-0 ${overdue ? 'bg-[#FDF6F5]' : ''}`}>
        <div className="flex items-start gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={() => toggleDone(step)}
            aria-label={step.done ? 'Heropenen' : 'Afvinken'}
            className={`mt-0.5 w-[22px] h-[22px] rounded-md border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
              step.done && !item.nvt
                ? 'bg-[#1C1B19] border-[#1C1B19]'
                : opts.locked
                  ? 'border-dashed border-[#CFC8BF] bg-white hover:border-[#1C1B19]'
                  : 'border-[#B9B2A9] bg-white hover:border-[#1C1B19]'
            }`}
          >
            {step.done && !item.nvt && <Check size={14} className="text-white" />}
          </button>
          {!step.done && !opts.locked && (
            <button
              type="button"
              onClick={() => saveItem(item.id, { priority: !item.priority })}
              aria-label={item.priority ? 'Prio uitzetten' : 'Prio'}
              aria-pressed={item.priority}
              title="Prio"
              className={`w-[22px] h-[22px] rounded-md border text-[13px] font-bold leading-none shrink-0 transition-colors ${
                item.priority
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-[#DDD8D2] text-[#C7C2BB] hover:text-red-600 hover:border-red-300'
              }`}
            >
              !
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpenStepId(isOpen ? null : item.id)}
            className="flex-1 min-w-0 text-left"
            title="Datum, persoon of notitie aanpassen"
          >
            <span
              className={`text-sm ${
                step.done ? 'line-through text-[#9A948D]' : opts.locked ? 'text-[#6B6560]' : 'text-[#1C1B19]'
              }`}
            >
              {stepLabel(item)}
            </span>
            {step.milestone && <span className="ml-2 text-[11px] text-[#8A6A2E]">afspraak</span>}
            {item.nvt && <span className="ml-2 text-[11px] text-[#6B6560] bg-[#F0EDE9] rounded px-1.5 py-0.5">n.v.t.</span>}
            {(item.notes || afterSteps || item.assigned_to) && (
              <span className="block text-xs text-[#6B6560] mt-0.5">
                {item.assigned_to && <span className="sm:hidden">{item.assigned_to}{item.notes || afterSteps ? ' · ' : ''}</span>}
                {afterSteps ? `Na: ${afterSteps}` : item.notes}
              </span>
            )}
          </button>
          <span className="hidden sm:block w-20 text-right text-xs text-[#6B6560] mt-0.5 truncate">{item.assigned_to ?? ''}</span>
          {opts.locked ? (
            <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => release(step)}>
              Vrijgeven
            </Button>
          ) : (
          <span className="w-24 text-right text-[13px] mt-0.5 shrink-0">
            {step.done && item.checked_at && !date ? (
              <span className="text-[#9A948D]">{format(new Date(item.checked_at), 'd MMM', { locale: nl })}</span>
            ) : (
              renderDate(step)
            )}
          </span>
          )}
        </div>
        {isOpen && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:pl-[50px]">
            <Input
              key={`label-${item.id}`}
              aria-label="Naam taak"
              className="h-8 basis-full"
              defaultValue={stepLabel(item)}
              onBlur={(e) => {
                const label = e.target.value.trim()
                if (label && label !== stepLabel(item)) saveItem(item.id, { label })
              }}
            />
            <Input
              type="date"
              aria-label="Datum"
              className="h-8 w-40"
              value={date ?? ''}
              onChange={(e) => saveDate(step, e.target.value || null)}
            />
            <select
              aria-label="Wacht op"
              value={item.assigned_to ?? ''}
              onChange={(e) => saveItem(item.id, { assigned_to: e.target.value || null })}
              className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">Wacht op: niemand</option>
              {assigneeNames(assignees, item.assigned_to).map((a) => (
                <option key={a} value={a}>Wacht op: {a}</option>
              ))}
            </select>
            <Input
              key={`notes-${item.id}`}
              aria-label="Notitie"
              placeholder="Notitie (optioneel)"
              className="h-8 flex-1 min-w-[180px]"
              defaultValue={item.notes ?? ''}
              onBlur={(e) => {
                const notes = e.target.value.trim() || null
                if (notes !== item.notes) saveItem(item.id, { notes })
              }}
            />
            {!item.checked && (
              <Button variant="outline" size="sm" onClick={() => toggleNvt(step)}>
                {item.nvt ? 'Wel van toepassing' : 'N.v.t.'}
              </Button>
            )}
            <button
              type="button"
              onClick={() => saveItem(item.id, { visible_to_customer: !item.visible_to_customer })}
              className="inline-flex items-center gap-1.5 h-8 px-2 text-xs text-[#6B6560] hover:text-[#1C1B19]"
            >
              {item.visible_to_customer ? <Eye size={14} /> : <EyeOff size={14} className="text-[#C9A96E]" />}
              {item.visible_to_customer ? 'Zichtbaar voor klant' : 'Verborgen voor klant'}
            </button>
            <button type="button" onClick={() => removeStep(step)} title="Taak verwijderen" aria-label="Taak verwijderen" className="p-1.5">
              <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderMilestoneChips(phase: Phase, isPast: boolean) {
    // Alleen afspraken waar nog iets mee moet — afgeronde staan in "Alle
    // afspraken bewerken". In een fase die al achter ons ligt alleen nog
    // gedateerde (een lege "Datum invullen" is daar ruis). Een afspraak die
    // al als taak in de lijst staat (bv. "Levering bij klant") niet dubbel.
    const shown = phase.milestones.filter(
      (m) => m.status !== 'klaar' && (!isPast || !!m.date) && !linkedMilestoneIds.has(m.id)
    )
    if (!shown.length) return null
    const editing = shown.find((m) => m.id === editingMilestoneId)
    return (
      <div className="mt-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#6B6560] mr-0.5">Afspraken:</span>
          {shown.map((m) => {
            const label = milestoneLabel(m)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setEditingMilestoneId(editingMilestoneId === m.id ? null : m.id)}
                className={`inline-flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-full transition-colors ${
                  m.date
                    ? 'bg-[#F6EFE2] text-[#5E4A20] hover:bg-[#EFE4CF]'
                    : 'border border-dashed border-[#CFC8BF] text-[#6B6560] hover:border-[#1C1B19]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#C9A96E]" />
                {m.date ? (
                  <>
                    {label} · {format(new Date(m.date), 'EEEEEE d MMM', { locale: nl })}
                  </>
                ) : (
                  <>{label} · Datum invullen</>
                )}
              </button>
            )
          })}
        </div>
        {editing && (
          <div className="flex flex-wrap items-center gap-2 bg-[#FAF8F5] border border-[#EFEBE4] rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-[#1C1B19] mr-1">{milestoneLabel(editing)}</span>
            <Input
              type="date"
              aria-label="Datum afspraak"
              className="h-8 w-40 bg-white"
              value={editing.date ?? ''}
              onChange={(e) => saveMilestone(editing.id, { date: e.target.value || null })}
            />
            <select
              aria-label="Status afspraak"
              value={editing.status}
              onChange={(e) => saveMilestone(editing.id, { status: e.target.value as MilestoneStatus })}
              className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
            >
              {MILESTONE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setEditingMilestoneId(null)}
              aria-label="Sluiten"
              className="ml-auto p-1 text-[#6B6560] hover:text-[#1C1B19]"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-[#6B6560]">
          <div className="w-32 sm:w-40 h-1.5 rounded-full bg-[#E6E1DA] overflow-hidden">
            <div className="h-full rounded-full bg-[#C9A96E] transition-all" style={{ width: `${percentage}%` }} />
          </div>
          <span>{doneCount} van {total} klaar</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(allExpanded ? defaultExpanded : new Set(visiblePhases.map((p) => p.label)))}
          >
            {allExpanded ? 'Alles inklappen' : 'Alles uitklappen'}
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} />
            Taak
          </Button>
        </div>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-[#DDD8D2] p-3 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTask()
              if (e.key === 'Escape') resetNewTask()
            }}
            placeholder="Nieuwe taak"
            aria-label="Nieuwe taak"
            className="h-8 flex-1 min-w-[200px]"
          />
          <select
            aria-label="Fase"
            value={newPhase || currentLabel || ''}
            onChange={(e) => setNewPhase(e.target.value)}
            className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
          >
            {phases.map((p) => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
          </select>
          <Input type="date" aria-label="Datum" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 w-40" />
          <select
            aria-label="Wacht op"
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded-md focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="">Wacht op: niemand</option>
            {assigneeNames(assignees).map((a) => (
              <option key={a} value={a}>Wacht op: {a}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-[#1C1B19] px-1">
            <input
              type="checkbox"
              checked={newPriority}
              onChange={(e) => setNewPriority(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            Prio
          </label>
          <Button size="sm" onClick={addTask} disabled={savingTaskState}>{savingTaskState ? 'Bezig...' : 'Toevoegen'}</Button>
          <Button size="sm" variant="outline" onClick={resetNewTask}>Annuleren</Button>
        </div>
      )}

      {notice && <p className="text-sm text-[#5E4A20] bg-[#F6EFE2] border border-[#EADBC0] rounded-lg px-4 py-2.5">{notice}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <div className="bg-white rounded-xl border border-[#DDD8D2] px-4 py-5 md:px-6">
        {visiblePhases.map((phase, index) => {
          const phaseIdx = phases.indexOf(phase)
          const isPast = phaseIdx < currentIdx
          const isCurrent = phaseIdx === currentIdx
          const isLast = index === visiblePhases.length - 1
          const isExpanded = expandedSet.has(phase.label)

          const done = phase.steps.filter((s) => s.done)
          const open = sortOpen(phase.steps.filter((s) => !s.done && s.visible))
          const later = phase.steps.filter((s) => !s.done && !s.visible)
          const allDone = phase.steps.length > 0 && done.length === phase.steps.length
          const lastChecked = done
            .map((s) => s.item.checked_at)
            .filter((d): d is string => !!d)
            .sort()
            .pop()

          const ready = readyLater(phase)
          const readyOverdue = ready.filter((s) => {
            const d = stepDate(s)
            return !!d && differenceInCalendarDays(new Date(d), new Date()) < 0
          }).length
          let summary = `${done.length} van ${phase.steps.length} klaar`
          if (isPast && allDone && lastChecked) summary += ` · afgerond ${format(new Date(lastChecked), 'd MMM', { locale: nl })}`

          return (
            <div key={phase.label} className="flex gap-4">
              <div className="flex flex-col items-center w-6 shrink-0">
                {allDone ? (
                  <span className="w-5 h-5 rounded-full bg-[#1C1B19] flex items-center justify-center mt-0.5">
                    <Check size={12} className="text-white" strokeWidth={3} />
                  </span>
                ) : isCurrent ? (
                  <span className="w-5 h-5 rounded-full border-[5px] border-[#C9A96E] bg-white mt-0.5" />
                ) : (
                  <span className={`w-5 h-5 rounded-full border-2 bg-white mt-0.5 ${isPast ? 'border-red-400' : 'border-[#CFC8BF]'}`} />
                )}
                {!isLast && <span className={`w-0.5 flex-1 min-h-6 ${isPast ? 'bg-[#1C1B19]' : 'bg-[#E6E1DA]'}`} />}
              </div>

              <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-5'}`}>
                <button
                  type="button"
                  onClick={() => setExpanded(toggleIn(expandedSet, phase.label))}
                  aria-expanded={isExpanded}
                  className="w-full flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-left"
                >
                  <span
                    className={`text-[15px] ${
                      isCurrent ? 'font-semibold text-[#8A6A2E]' : isPast ? 'font-medium text-[#1C1B19]' : 'font-medium text-[#6B6560]'
                    }`}
                  >
                    {phase.label}
                    {isCurrent && ' · huidig'}
                  </span>
                  <span className="text-[13px] text-[#6B6560]">
                    {summary}
                    {isPast && !allDone && open.length > 0 && (
                      <span className="text-red-600 font-medium"> · {open.length} open</span>
                    )}
                    {ready.length > 0 && (
                      <span className={readyOverdue ? 'text-red-600 font-medium' : 'text-[#8A6A2E] font-medium'}>
                        {' '}· {ready.length} actief{readyOverdue ? `, ${readyOverdue} te laat` : ''}
                      </span>
                    )}
                  </span>
                </button>

                {renderMilestoneChips(phase, isPast)}

                {isExpanded && phase.steps.length > 0 && (
                  <div className="mt-3 border border-[#EFEBE4] rounded-xl overflow-hidden">
                    {open.map((s) => renderStep(s))}
                    {open.length === 0 && (
                      <p className="px-4 py-3 text-sm text-[#6B6560]">
                        {allDone ? 'Fase afgerond.' : 'Geen open taken. Overige stappen wachten op eerdere stappen.'}
                      </p>
                    )}

                    {showLater.has(phase.label) && later.length > 0 && (
                      <div className="bg-[#FCFBF9] border-t border-[#EFEBE4]">
                        {later.map((s) => renderStep(s, { locked: true }))}
                      </div>
                    )}
                    {showDone.has(phase.label) && done.length > 0 && (
                      <div className="bg-[#FCFBF9] border-t border-[#EFEBE4]">
                        {done.map((s) => renderStep(s))}
                      </div>
                    )}

                    {(later.length > 0 || done.length > 0) && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2.5 bg-[#FAF8F5] border-t border-[#EFEBE4] text-[13px] text-[#6B6560]">
                        {later.length > 0 && (
                          <button type="button" onClick={() => setShowLater(toggleIn(showLater, phase.label))} className="hover:text-[#1C1B19]">
                            {showLater.has(phase.label) ? '▾' : '▸'} Toekomstig ({later.length})
                          </button>
                        )}
                        {done.length > 0 && (
                          <button type="button" onClick={() => setShowDone(toggleIn(showDone, phase.label))} className="hover:text-[#1C1B19]">
                            {showDone.has(phase.label) ? '▾' : '▸'} Afgerond ({done.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
