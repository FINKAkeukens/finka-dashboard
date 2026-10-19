'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import {
  Assignee,
  AssigneeKind,
  ChecklistCategoryItem,
  ChecklistTemplateItem,
  MilestoneKey,
  ProjectStatus,
} from '@/lib/types'
import { MILESTONE_LABELS, MILESTONE_ORDER, assigneeNames } from '@/lib/planning'
import { renamePhase } from '@/lib/draaiboek'

// Instellingen > Draaiboek: fases (checklist-kopjes) met hun standaardstappen
// (finka_checklist_templates) én de keuzelijst personen/partijen. Alles slaat
// direct op, zoals de andere instellingen. Volgorde/termijn/persoon gelden
// voor stappen die nog moeten vrijkomen — een al vrijgegeven projectstap
// heeft z'n eigen datum en persoon (zie refreshUnlocks).

type FixedMilestoneKey = Exclude<MilestoneKey, 'custom'>

const KIND_LABELS: Record<AssigneeKind, string> = { persoon: 'Persoon', bedrijf: 'Bedrijf', partij: 'Partij' }

// Naam en "Na stap" delen één kolom (onder elkaar), zodat de naam leesbaar blijft.
const GRID = 'grid grid-cols-[64px_minmax(0,1fr)_100px_150px_170px_48px_36px] gap-2.5 items-start'

export default function DraaiboekForm({
  initialCategories,
  initialTemplates,
  statuses,
  initialAssignees,
}: {
  initialCategories: ChecklistCategoryItem[]
  initialTemplates: ChecklistTemplateItem[]
  statuses: ProjectStatus[]
  initialAssignees: Assignee[]
}) {
  const supabase = createClient()
  const [categories, setCategories] = useState(initialCategories)
  const [templates, setTemplates] = useState(initialTemplates)
  const [assignees, setAssignees] = useState(initialAssignees)
  const [openPhases, setOpenPhases] = useState<Set<string>>(new Set())
  // Oude naam bij het begin van het typen, zodat hernoemen in projecten op
  // de juiste naam zoekt.
  const [labelBefore, setLabelBefore] = useState<Record<string, string>>({})
  const [propagate, setPropagate] = useState(false)
  const [addingStepIn, setAddingStepIn] = useState<string | null>(null)
  const [newStepLabel, setNewStepLabel] = useState('')
  const [addingPhase, setAddingPhase] = useState(false)
  const [newPhaseLabel, setNewPhaseLabel] = useState('')
  const [pickingDepFor, setPickingDepFor] = useState<string | null>(null)
  const [newPerson, setNewPerson] = useState('')
  const [newPersonKind, setNewPersonKind] = useState<AssigneeKind>('partij')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)
  const templateById = new Map(templates.map((t) => [t.id, t]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  function stepsIn(categoryId: string) {
    return templates.filter((t) => t.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  }

  function flash(message: string) {
    setInfo(message)
    setTimeout(() => setInfo(''), 5000)
  }

  function togglePhase(id: string) {
    const next = new Set(openPhases)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpenPhases(next)
  }

  async function swapOrder(table: 'finka_checklist_categories' | 'finka_checklist_templates', a: { id: string; sort_order: number }, b: { id: string; sort_order: number }) {
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from(table).update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from(table).update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    if (err1 || err2) setError((err1 ?? err2)!.message)
  }

  // --- Fases ---------------------------------------------------------------

  async function savePhaseLabel(category: ChecklistCategoryItem) {
    const label = category.label.trim()
    const oldLabel = labelBefore[category.id] ?? label
    if (!label) {
      setError('Een fase heeft een naam nodig.')
      return
    }
    if (label === oldLabel) return
    if (categories.some((c) => c.id !== category.id && c.label === label)) {
      setError(`Er is al een fase "${label}".`)
      return
    }
    const renameError = await renamePhase(supabase, category, oldLabel, label)
    if (renameError) {
      setError(renameError)
      return
    }
    setLabelBefore((prev) => ({ ...prev, [category.id]: label }))
    flash(`Fase hernoemd naar "${label}", ook in alle projecten.`)
  }

  async function savePhaseStatus(category: ChecklistCategoryItem, statusId: string | null) {
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, status_id: statusId } : c)))
    const { error: updError } = await supabase
      .from('finka_checklist_categories')
      .update({ status_id: statusId, updated_at: new Date().toISOString() })
      .eq('id', category.id)
    if (updError) setError(updError.message)
  }

  async function addPhase() {
    if (!newPhaseLabel.trim()) {
      setAddingPhase(false)
      return
    }
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_checklist_categories')
      .insert({ label: newPhaseLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setCategories((prev) => [...prev, data as ChecklistCategoryItem])
    setOpenPhases(new Set([...openPhases, (data as ChecklistCategoryItem).id]))
    setNewPhaseLabel('')
    setAddingPhase(false)
  }

  async function removePhase(category: ChecklistCategoryItem) {
    const count = stepsIn(category.id).length
    const warning = count > 0
      ? `Fase "${category.label}" verwijderen? De ${count} stap(pen) erin worden ook uit het draaiboek verwijderd. Bestaande projecten houden hun taken.`
      : `Fase "${category.label}" verwijderen?`
    if (!confirm(warning)) return
    setCategories((prev) => prev.filter((c) => c.id !== category.id))
    setTemplates((prev) => prev.filter((t) => t.category_id !== category.id))
    const { error: delError } = await supabase.from('finka_checklist_categories').delete().eq('id', category.id)
    if (delError) setError(delError.message)
  }

  function movePhase(id: string, direction: -1 | 1) {
    const index = orderedCategories.findIndex((c) => c.id === id)
    const other = orderedCategories[index + direction]
    if (!other) return
    const current = orderedCategories[index]
    setCategories((prev) =>
      prev.map((c) =>
        c.id === current.id ? { ...c, sort_order: other.sort_order } : c.id === other.id ? { ...c, sort_order: current.sort_order } : c
      )
    )
    swapOrder('finka_checklist_categories', current, other)
  }

  // --- Stappen -------------------------------------------------------------

  function updateLocal(id: string, patch: Partial<ChecklistTemplateItem>) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function saveStep(id: string, patch: Partial<ChecklistTemplateItem>) {
    updateLocal(id, patch)
    const { error: updError } = await supabase
      .from('finka_checklist_templates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function saveStepLabel(step: ChecklistTemplateItem) {
    const label = step.label.trim()
    if (!label) {
      setError('Een stap heeft een naam nodig.')
      return
    }
    const oldLabel = labelBefore[step.id]
    if (oldLabel === undefined || oldLabel === label) return
    await saveStep(step.id, { label })
    setLabelBefore((prev) => ({ ...prev, [step.id]: label }))
    if (!propagate) return
    // Alleen open stappen: een afgeronde taak houdt de naam van toen.
    const { data, error: updError } = await supabase
      .from('finka_checklist_items')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('template_id', step.id)
      .eq('checked', false)
      .eq('nvt', false)
      .select('id')
    if (updError) setError(updError.message)
    else flash(`Ook aangepast in ${data?.length ?? 0} lopende project(en).`)
  }

  function saveDueDays(step: ChecklistTemplateItem, raw: string) {
    const value = raw.trim() === '' ? null : Math.max(0, Math.round(Number(raw)))
    if (value !== null && Number.isNaN(value)) return
    if (value === step.due_days) return
    saveStep(step.id, { due_days: value })
  }

  // Zou stap `depId` (direct of via via) al op `stepId` wachten? Dan zou een
  // koppeling een kringetje maken waardoor geen van beide ooit vrijkomt.
  function dependsOn(fromId: string, targetId: string, seen = new Set<string>()): boolean {
    if (fromId === targetId) return true
    if (seen.has(fromId)) return false
    seen.add(fromId)
    return (templateById.get(fromId)?.depends_on ?? []).some((id) => dependsOn(id, targetId, seen))
  }

  function addDependency(step: ChecklistTemplateItem, depId: string) {
    setPickingDepFor(null)
    if (!depId || step.depends_on.includes(depId)) return
    if (dependsOn(depId, step.id)) {
      setError(`"${templateById.get(depId)?.label}" wacht zelf al op "${step.label}". Die koppeling kan niet.`)
      return
    }
    saveStep(step.id, { depends_on: [...step.depends_on, depId] })
  }

  function removeDependency(step: ChecklistTemplateItem, depId: string) {
    saveStep(step.id, { depends_on: step.depends_on.filter((id) => id !== depId) })
  }

  async function addStep(categoryId: string) {
    if (!newStepLabel.trim()) {
      setAddingStepIn(null)
      return
    }
    const maxOrder = stepsIn(categoryId).reduce((max, t) => Math.max(max, t.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_checklist_templates')
      .insert({ category_id: categoryId, label: newStepLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    const step = data as ChecklistTemplateItem
    setTemplates((prev) => [...prev, step])
    setNewStepLabel('')
    setAddingStepIn(null)
    await fanOutNewStep(categoryId, step)
  }

  // Een nieuwe stap komt meteen bij alle projecten die al een checklist
  // hebben. Hij heeft nog geen voorgangers, dus is daar direct zichtbaar —
  // stel "Na stap" in om dat te veranderen (geldt dan ook daar, zolang de
  // stap nog niet is vrijgegeven).
  async function fanOutNewStep(categoryId: string, step: ChecklistTemplateItem) {
    const categoryLabel = categoryById.get(categoryId)?.label ?? 'Overig'
    const { data: existingRows, error: fetchError } = await supabase
      .from('finka_checklist_items')
      .select('project_id, sort_order')
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    const maxSortByProject = new Map<string, number>()
    for (const row of existingRows ?? []) {
      maxSortByProject.set(row.project_id, Math.max(maxSortByProject.get(row.project_id) ?? -1, row.sort_order))
    }
    if (maxSortByProject.size === 0) return
    const rows = Array.from(maxSortByProject.entries()).map(([projectId, maxSort]) => ({
      project_id: projectId,
      item_key: null,
      template_id: step.id,
      category: categoryLabel,
      label: step.label,
      visible_to_customer: step.visible_to_customer,
      sort_order: maxSort + 1,
    }))
    const { error: insError } = await supabase.from('finka_checklist_items').insert(rows)
    if (insError) setError(insError.message)
    else flash(`Toegevoegd aan ${rows.length} bestaande project(en).`)
  }

  async function removeStep(step: ChecklistTemplateItem) {
    if (!confirm(`Stap "${step.label}" uit het draaiboek verwijderen? Bestaande projecten houden de taak.`)) return
    const dependents = templates.filter((t) => t.depends_on.includes(step.id))
    setTemplates((prev) =>
      prev.filter((t) => t.id !== step.id).map((t) => ({ ...t, depends_on: t.depends_on.filter((id) => id !== step.id) }))
    )
    // Stappen die hierop wachtten, wachten nergens meer op deze stap.
    for (const t of dependents) {
      const { error: updError } = await supabase
        .from('finka_checklist_templates')
        .update({ depends_on: t.depends_on.filter((id) => id !== step.id) })
        .eq('id', t.id)
      if (updError) setError(updError.message)
    }
    const { error: delError } = await supabase.from('finka_checklist_templates').delete().eq('id', step.id)
    if (delError) setError(delError.message)
  }

  function moveStep(categoryId: string, id: string, direction: -1 | 1) {
    const ordered = stepsIn(categoryId)
    const index = ordered.findIndex((t) => t.id === id)
    const other = ordered[index + direction]
    if (!other) return
    const current = ordered[index]
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === current.id ? { ...t, sort_order: other.sort_order } : t.id === other.id ? { ...t, sort_order: current.sort_order } : t
      )
    )
    swapOrder('finka_checklist_templates', current, other)
  }

  // --- Personen en partijen ------------------------------------------------

  async function saveAssigneeName(person: Assignee) {
    const name = person.name.trim()
    const oldName = labelBefore[person.id]
    if (!name) {
      setError('Een naam is verplicht.')
      return
    }
    if (oldName === undefined || oldName === name) return
    if (assignees.some((a) => a.id !== person.id && a.name === name)) {
      setError(`"${name}" staat al in de lijst.`)
      return
    }
    const { error: updError } = await supabase.from('finka_assignees').update({ name }).eq('id', person.id)
    if (updError) {
      setError(updError.message)
      return
    }
    setLabelBefore((prev) => ({ ...prev, [person.id]: name }))
    // Toewijzingen staan als naam opgeslagen — overal meenemen.
    const results = await Promise.all([
      supabase.from('finka_checklist_items').update({ assigned_to: name }).eq('assigned_to', oldName),
      supabase.from('finka_project_milestones').update({ assigned_to: name }).eq('assigned_to', oldName),
      supabase.from('finka_checklist_templates').update({ default_assignee: name }).eq('default_assignee', oldName),
    ])
    const failed = results.find((r) => r.error)
    if (failed?.error) setError(failed.error.message)
    setTemplates((prev) => prev.map((t) => (t.default_assignee === oldName ? { ...t, default_assignee: name } : t)))
    flash(`"${oldName}" heet nu "${name}", ook in bestaande toewijzingen.`)
  }

  async function saveAssignee(id: string, patch: Partial<Assignee>) {
    setAssignees((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    const { error: updError } = await supabase.from('finka_assignees').update(patch).eq('id', id)
    if (updError) setError(updError.message)
  }

  async function addAssignee() {
    const name = newPerson.trim()
    if (!name) return
    if (assignees.some((a) => a.name === name)) {
      setError(`"${name}" staat al in de lijst.`)
      return
    }
    const maxOrder = assignees.reduce((max, a) => Math.max(max, a.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_assignees')
      .insert({ name, kind: newPersonKind, sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setAssignees((prev) => [...prev, data as Assignee])
    setNewPerson('')
  }

  // --- Weergave ------------------------------------------------------------

  const inputClass =
    'h-9 px-2.5 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] min-w-0'

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start gap-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Sluiten"><X size={14} /></button>
        </p>
      )}
      {info && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-2.5">{info}</p>}

      <label className="flex items-center gap-2.5 bg-white border border-[#DDD8D2] rounded-xl px-4 py-3 text-sm text-[#1C1B19]">
        <input
          type="checkbox"
          checked={propagate}
          onChange={(e) => setPropagate(e.target.checked)}
          className="w-4 h-4 accent-[#1C1B19]"
        />
        Tekstwijzigingen van stappen ook doorvoeren in lopende projecten (open stappen)
      </label>

      {orderedCategories.map((category, catIndex) => {
        const steps = stepsIn(category.id)
        const isOpen = openPhases.has(category.id)
        return (
          <section key={category.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#F7F5F2]">
              <div className="flex flex-col -space-y-1 shrink-0">
                <button type="button" onClick={() => movePhase(category.id, -1)} disabled={catIndex === 0} className="disabled:opacity-20" aria-label="Fase omhoog">
                  <ChevronUp size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
                <button type="button" onClick={() => movePhase(category.id, 1)} disabled={catIndex === orderedCategories.length - 1} className="disabled:opacity-20" aria-label="Fase omlaag">
                  <ChevronDown size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => togglePhase(category.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Inklappen' : 'Uitklappen'}
                className="w-8 h-8 rounded-lg text-[#6B6560] hover:bg-white"
              >
                {isOpen ? '▾' : '▸'}
              </button>
              <input
                aria-label="Naam fase"
                value={category.label}
                onFocus={() => setLabelBefore((prev) => ({ ...prev, [category.id]: prev[category.id] ?? category.label }))}
                onChange={(e) => setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, label: e.target.value } : c)))}
                onBlur={() => savePhaseLabel(category)}
                className="flex-[1_1_200px] max-w-sm h-9 px-2.5 text-[15px] font-semibold text-[#1C1B19] bg-transparent border border-transparent hover:border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] focus:bg-white"
              />
              <label className="flex items-center gap-1.5 text-xs text-[#6B6560]">
                Projectstatus
                <select
                  value={category.status_id ?? ''}
                  onChange={(e) => savePhaseStatus(category, e.target.value || null)}
                  className="h-8 px-2 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                >
                  <option value="">—</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <span className="ml-auto text-[13px] text-[#6B6560]">{steps.length} stappen</span>
              <button type="button" onClick={() => removePhase(category)} aria-label="Fase verwijderen" className="p-1.5">
                <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>

            {isOpen && (
              <div className="overflow-x-auto border-t border-[#EFEBE6]">
                <div className="min-w-[860px] px-4 pb-3">
                  <div className={`${GRID} py-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B6560]`}>
                    <span>Volgorde</span>
                    <span>Stap · na stap</span>
                    <span>Termijn</span>
                    <span>Standaard</span>
                    <span>Afspraak</span>
                    <span>Klant</span>
                    <span />
                  </div>
                  {steps.map((step, index) => (
                    <div key={step.id} className={`${GRID} py-2 border-t border-[#F3F0EC]`}>
                      <div className="flex gap-1 mt-1">
                        <button type="button" onClick={() => moveStep(category.id, step.id, -1)} disabled={index === 0} aria-label="Omhoog" className="w-7 h-7 rounded-md border border-[#DDD8D2] text-[#6B6560] disabled:opacity-30">
                          <ChevronUp size={13} className="mx-auto" />
                        </button>
                        <button type="button" onClick={() => moveStep(category.id, step.id, 1)} disabled={index === steps.length - 1} aria-label="Omlaag" className="w-7 h-7 rounded-md border border-[#DDD8D2] text-[#6B6560] disabled:opacity-30">
                          <ChevronDown size={13} className="mx-auto" />
                        </button>
                      </div>
                      <div className="min-w-0 space-y-1.5">
                      <input
                        aria-label="Stap"
                        value={step.label}
                        onFocus={() => setLabelBefore((prev) => ({ ...prev, [step.id]: prev[step.id] ?? step.label }))}
                        onChange={(e) => updateLocal(step.id, { label: e.target.value })}
                        onBlur={() => saveStepLabel(step)}
                        className={`${inputClass} w-full`}
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-[#6B6560] mr-0.5">Na:</span>
                        {step.depends_on.map((depId) => {
                          const dep = templateById.get(depId)
                          if (!dep) return null
                          const depPhase = dep.category_id !== category.id ? categoryById.get(dep.category_id)?.label : null
                          return (
                            <span key={depId} className="inline-flex items-center gap-0.5 max-w-full text-xs bg-[#F3EFEA] rounded-md pl-2 pr-0.5 py-0.5">
                              <span className="truncate" title={dep.label}>{dep.label}{depPhase ? ` (${depPhase})` : ''}</span>
                              <button type="button" onClick={() => removeDependency(step, depId)} aria-label={`${dep.label} weghalen`} className="px-1 text-[#6B6560] hover:text-red-600">×</button>
                            </span>
                          )
                        })}
                        {step.depends_on.length === 0 && <span className="text-xs text-[#9A948D]">Start</span>}
                        {pickingDepFor === step.id ? (
                          <select
                            autoFocus
                            aria-label="Voorgaande stap kiezen"
                            defaultValue=""
                            onChange={(e) => addDependency(step, e.target.value)}
                            onBlur={() => setPickingDepFor(null)}
                            className="h-7 max-w-full px-1 text-xs bg-white border border-[#DDD8D2] rounded-md"
                          >
                            <option value="">Kies stap…</option>
                            {orderedCategories.map((c) => (
                              <optgroup key={c.id} label={c.label}>
                                {stepsIn(c.id)
                                  .filter((t) => t.id !== step.id && !step.depends_on.includes(t.id))
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : (
                          <button type="button" onClick={() => setPickingDepFor(step.id)} aria-label="Voorgaande stap toevoegen" className="h-6 px-2 text-xs text-[#6B6560] border border-dashed border-[#CFC8BF] rounded-md hover:border-[#1C1B19]">
                            +
                          </button>
                        )}
                      </div>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-[#6B6560]">
                        <input
                          key={`days-${step.id}-${step.due_days}`}
                          type="number"
                          min={0}
                          aria-label="Termijn in dagen"
                          defaultValue={step.due_days ?? ''}
                          onBlur={(e) => saveDueDays(step, e.target.value)}
                          className={`${inputClass} w-14`}
                        />
                        dagen
                      </label>
                      <select
                        aria-label="Standaard toegewezen aan"
                        value={step.default_assignee ?? ''}
                        onChange={(e) => saveStep(step.id, { default_assignee: e.target.value || null })}
                        className={inputClass}
                      >
                        <option value="">—</option>
                        {assigneeNames(assignees, step.default_assignee).map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Gekoppelde afspraak"
                        value={step.milestone_key ?? ''}
                        onChange={(e) => saveStep(step.id, { milestone_key: (e.target.value || null) as FixedMilestoneKey | null })}
                        className={inputClass}
                      >
                        <option value="">—</option>
                        {MILESTONE_ORDER.map((k) => (
                          <option key={k} value={k}>{MILESTONE_LABELS[k]}</option>
                        ))}
                      </select>
                      <input
                        type="checkbox"
                        aria-label="Zichtbaar voor klant"
                        checked={step.visible_to_customer}
                        onChange={() => saveStep(step.id, { visible_to_customer: !step.visible_to_customer })}
                        className="w-4 h-4 mx-auto mt-2.5 accent-[#1C1B19]"
                      />
                      <button type="button" onClick={() => removeStep(step)} aria-label="Stap verwijderen" className="p-1.5 mt-0.5">
                        <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                      </button>
                    </div>
                  ))}

                  {addingStepIn === category.id ? (
                    <div className="flex items-center gap-2 pt-3">
                      <Input
                        autoFocus
                        value={newStepLabel}
                        onChange={(e) => setNewStepLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addStep(category.id)
                          if (e.key === 'Escape') { setAddingStepIn(null); setNewStepLabel('') }
                        }}
                        placeholder="Nieuwe stap"
                        aria-label="Nieuwe stap"
                        className="h-9 max-w-md"
                      />
                      <Button size="sm" onClick={() => addStep(category.id)}>Toevoegen</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAddingStepIn(null); setNewStepLabel('') }}>Annuleren</Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingStepIn(category.id)}
                      className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 text-sm text-[#1C1B19] border border-dashed border-[#CFC8BF] rounded-lg hover:border-[#1C1B19]"
                    >
                      <Plus size={13} />
                      Stap toevoegen
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )
      })}

      {addingPhase ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={newPhaseLabel}
            onChange={(e) => setNewPhaseLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPhase()
              if (e.key === 'Escape') { setAddingPhase(false); setNewPhaseLabel('') }
            }}
            placeholder="Naam fase"
            aria-label="Naam nieuwe fase"
            className="h-9 max-w-sm"
          />
          <Button size="sm" onClick={addPhase}>Toevoegen</Button>
          <Button size="sm" variant="outline" onClick={() => { setAddingPhase(false); setNewPhaseLabel('') }}>Annuleren</Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingPhase(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-sm text-[#1C1B19] bg-white border border-dashed border-[#CFC8BF] rounded-lg hover:border-[#1C1B19]"
        >
          <Plus size={13} />
          Fase toevoegen
        </button>
      )}

      <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-[#1C1B19]">Personen en partijen</h2>
          <p className="text-[13px] text-[#6B6560] mt-1">
            Keuzelijst voor toewijzen. Verbergen in plaats van verwijderen houdt bestaande toewijzingen intact.
          </p>
        </div>
        <div>
          {[...assignees].sort((a, b) => a.sort_order - b.sort_order).map((person) => (
            <div key={person.id} className="flex flex-wrap items-center gap-2.5 py-2 border-t border-[#F3F0EC]">
              <input
                aria-label="Naam"
                value={person.name}
                onFocus={() => setLabelBefore((prev) => ({ ...prev, [person.id]: prev[person.id] ?? person.name }))}
                onChange={(e) => setAssignees((prev) => prev.map((a) => (a.id === person.id ? { ...a, name: e.target.value } : a)))}
                onBlur={() => saveAssigneeName(person)}
                className={`${inputClass} flex-[1_1_200px] ${person.hidden ? 'text-[#9A948D]' : ''}`}
              />
              <select
                aria-label="Soort"
                value={person.kind}
                onChange={(e) => saveAssignee(person.id, { kind: e.target.value as AssigneeKind })}
                className={`${inputClass} w-32`}
              >
                {(Object.keys(KIND_LABELS) as AssigneeKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" className="w-24" onClick={() => saveAssignee(person.id, { hidden: !person.hidden })}>
                {person.hidden ? 'Tonen' : 'Verbergen'}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <input
            aria-label="Nieuwe naam"
            placeholder="Naam"
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addAssignee() }}
            className={`${inputClass} flex-[1_1_200px]`}
          />
          <select
            aria-label="Soort"
            value={newPersonKind}
            onChange={(e) => setNewPersonKind(e.target.value as AssigneeKind)}
            className={`${inputClass} w-32`}
          >
            {(Object.keys(KIND_LABELS) as AssigneeKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
          <Button size="sm" className="w-24" onClick={addAssignee} disabled={!newPerson.trim()}>Toevoegen</Button>
        </div>
      </section>
    </div>
  )
}
