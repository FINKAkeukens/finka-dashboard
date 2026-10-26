import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, format } from 'date-fns'
import { ChecklistCategoryItem, ChecklistItem, ChecklistTemplateItem, ProjectMilestone } from './types'

// ---------------------------------------------------------------------------
// Draaiboek — de project-checklist (finka_checklist_items) als procesdraaiboek.
// Elke stap komt uit een sjabloonstap (finka_checklist_templates) die zegt na
// welke stap(pen) 'ie verschijnt (depends_on), met welke termijn (due_days)
// en eventueel aan welke vaste mijlpaal 'ie gekoppeld is (milestone_key).
//
// Zichtbaarheid wordt altijd afgeleid, niet opgeslagen: een stap is
// zichtbaar zodra al z'n voorgangers klaar/n.v.t. zijn — of als 'ie al eens
// zichtbaar was (unlocked_at). Zo blijft het ook kloppen als een stap via
// een andere plek (oude checklist-weergave, mijlpalentabel) wordt afgevinkt.
// unlocked_at is er alleen voor de boekhouding van "wanneer verscheen 'ie",
// waarop de automatische datum (vandaag + due_days) gebaseerd is.
// ---------------------------------------------------------------------------

export interface DraaiboekStep {
  item: ChecklistItem
  template: ChecklistTemplateItem | null
  milestone: ProjectMilestone | null
  done: boolean
  visible: boolean
}

export function milestoneForTemplate(
  template: ChecklistTemplateItem | null,
  milestones: ProjectMilestone[]
): ProjectMilestone | null {
  if (!template?.milestone_key) return null
  return milestones.find((m) => m.milestone_key === template.milestone_key) ?? null
}

// Klaar = afgevinkt, n.v.t., of de gekoppelde mijlpaal staat op klaar.
export function isStepDone(item: ChecklistItem, milestone: ProjectMilestone | null): boolean {
  return item.checked || item.nvt || milestone?.status === 'klaar'
}

export function buildSteps(
  items: ChecklistItem[],
  templates: ChecklistTemplateItem[],
  milestones: ProjectMilestone[]
): DraaiboekStep[] {
  const templateById = new Map(templates.map((t) => [t.id, t]))
  const base = items.map((item) => {
    const template = item.template_id ? templateById.get(item.template_id) ?? null : null
    const milestone = milestoneForTemplate(template, milestones)
    return { item, template, milestone, done: isStepDone(item, milestone) }
  })
  // Per sjabloonstap de projectstap(pen) — een voorganger die bij dit project
  // niet (meer) bestaat, blokkeert niets.
  const byTemplate = new Map<string, typeof base>()
  for (const s of base) {
    if (!s.item.template_id) continue
    const list = byTemplate.get(s.item.template_id) ?? []
    list.push(s)
    byTemplate.set(s.item.template_id, list)
  }
  return base.map((s) => {
    const depsSatisfied = (s.template?.depends_on ?? []).every((depId) => {
      const deps = byTemplate.get(depId)
      return !deps || deps.every((d) => d.done)
    })
    return { ...s, visible: s.done || !!s.item.unlocked_at || depsSatisfied }
  })
}

// Vaste volgorde: eerst op kopje (instellingen-volgorde), dan op sort_order.
export function sortSteps(steps: DraaiboekStep[], categories: ChecklistCategoryItem[]): DraaiboekStep[] {
  const catOrder = new Map(categories.map((c) => [c.label, c.sort_order]))
  return [...steps].sort((a, b) => {
    const ca = catOrder.get(a.item.category) ?? 999
    const cb = catOrder.get(b.item.category) ?? 999
    return ca !== cb ? ca - cb : a.item.sort_order - b.item.sort_order
  })
}

// Bij welke fase (kopje) een vaste mijlpaal hoort — afgeleid van de
// sjabloonstap die eraan gekoppeld is (bv. 'levering' → "In uitvoering").
export function milestonePhases(
  templates: ChecklistTemplateItem[],
  categories: ChecklistCategoryItem[]
): Map<string, string> {
  const labelById = new Map(categories.map((c) => [c.id, c.label]))
  const result = new Map<string, string>()
  for (const t of templates) {
    const label = labelById.get(t.category_id)
    if (t.milestone_key && label && !result.has(t.milestone_key)) result.set(t.milestone_key, label)
  }
  return result
}

// Welke fase hoort bij de projectstatus: via de vaste koppeling
// (status_id), met de naam als terugval voor fases zonder koppeling.
export function phaseLabelForStatus(
  categories: ChecklistCategoryItem[],
  statusId: string | null,
  statusLabel: string | null
): string | null {
  const linked = statusId ? categories.find((c) => c.status_id === statusId) : undefined
  return linked?.label ?? statusLabel
}

// Fase hernoemen. Projectstappen dragen de fasenaam als tekst mee (zie
// ChecklistItem.category), dus die gaan in alle projecten mee.
export async function renamePhase(
  supabase: SupabaseClient,
  category: ChecklistCategoryItem,
  oldLabel: string,
  newLabel: string
): Promise<string | null> {
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('finka_checklist_categories')
    .update({ label: newLabel, updated_at: nowIso })
    .eq('id', category.id)
  if (error) return error.message
  if (oldLabel === newLabel) return null
  const { error: itemsError } = await supabase
    .from('finka_checklist_items')
    .update({ category: newLabel })
    .eq('category', oldLabel)
  return itemsError?.message ?? null
}

// Datum van een stap: bij een mijlpaal-stap de afspraakdatum van de
// mijlpaal, anders de eigen deadline.
export function stepDate(step: DraaiboekStep): string | null {
  return step.milestone ? step.milestone.date : step.item.due_date
}

// Wat er verandert als een stap vrijkomt: unlocked_at, de automatische
// datum (vandaag + termijn) en de standaardpersoon. Automatische datum
// alleen voor open stappen zonder eigen mijlpaal-datum, en nooit over een
// al ingevulde datum heen.
function unlockPatch(s: DraaiboekStep, now: Date): Partial<ChecklistItem> {
  const patch: Partial<ChecklistItem> = { unlocked_at: now.toISOString() }
  if (!s.done && !s.milestone && !s.item.due_date && s.template?.due_days != null) {
    patch.due_date = format(addDays(now, s.template.due_days), 'yyyy-MM-dd')
  }
  if (!s.item.assigned_to && s.template?.default_assignee) patch.assigned_to = s.template.default_assignee
  return patch
}

// Een toekomstige stap eerder vrijgeven dan het draaiboek zegt (vooruit
// werken). Zelfde effect als vanzelf vrijkomen; unlocked_at houdt 'm daarna
// zichtbaar, ook als er later iets terug opengezet wordt.
export async function releaseStep(
  supabase: SupabaseClient,
  step: DraaiboekStep
): Promise<{ patch: Partial<ChecklistItem>; error: string | null }> {
  const patch = unlockPatch(step, new Date())
  const { error } = await supabase
    .from('finka_checklist_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', step.item.id)
  return { patch, error: error?.message ?? null }
}

// Zet unlocked_at (+ automatische datum en standaardpersoon) voor elke stap
// die nu zichtbaar is maar dat nog niet geregistreerd heeft. Veilig om vaak
// aan te roepen: doet niks als er niks nieuw vrijgespeeld is. Geeft de
// bijgewerkte projectstappen terug.
export async function refreshUnlocks(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ items: ChecklistItem[]; error: string | null }> {
  const [{ data: itemsData, error: itemsError }, { data: templatesData }, { data: milestonesData }] = await Promise.all([
    supabase.from('finka_checklist_items').select('*').eq('project_id', projectId),
    supabase.from('finka_checklist_templates').select('*'),
    supabase.from('finka_project_milestones').select('*').eq('project_id', projectId),
  ])
  if (itemsError) return { items: [], error: itemsError.message }
  const items = (itemsData ?? []) as ChecklistItem[]
  const steps = buildSteps(items, (templatesData ?? []) as ChecklistTemplateItem[], (milestonesData ?? []) as ProjectMilestone[])

  const now = new Date()
  const updates = steps
    .filter((s) => s.visible && !s.item.unlocked_at)
    .map((s) => ({ id: s.item.id, patch: unlockPatch(s, now) }))

  let error: string | null = null
  for (const u of updates) {
    const { error: updError } = await supabase.from('finka_checklist_items').update(u.patch).eq('id', u.id)
    if (updError) error = updError.message
  }
  const patched = new Map(updates.map((u) => [u.id, u.patch]))
  return { items: items.map((i) => (patched.has(i.id) ? { ...i, ...patched.get(i.id) } : i)), error }
}

// Stap afronden of weer openzetten. Bij een mijlpaal-stap gaat de mijlpaal
// mee (klaar ↔ terug naar 'gepland'), zodat projectenlijst en agenda kloppen.
export async function setStepDone(
  supabase: SupabaseClient,
  step: DraaiboekStep,
  done: boolean
): Promise<string | null> {
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('finka_checklist_items')
    .update({ checked: done, checked_at: done ? nowIso : null, nvt: false, updated_at: nowIso })
    .eq('id', step.item.id)
  if (error) return error.message
  if (step.milestone) {
    const status = done ? 'klaar' : step.milestone.status === 'klaar' ? 'gepland' : step.milestone.status
    const { error: msError } = await supabase
      .from('finka_project_milestones')
      .update({ status, updated_at: nowIso })
      .eq('id', step.milestone.id)
    if (msError) return msError.message
  }
  return null
}

export async function setStepNvt(supabase: SupabaseClient, step: DraaiboekStep, nvt: boolean): Promise<string | null> {
  const { error } = await supabase
    .from('finka_checklist_items')
    .update({ nvt, checked: false, checked_at: null, updated_at: new Date().toISOString() })
    .eq('id', step.item.id)
  return error?.message ?? null
}

// Kopieert het volledige draaiboek naar een (nieuw) project en speelt meteen
// de startstappen vrij. Gebruikt bij "Nieuw project" en als fallback-knop op
// het Checklist-tabblad.
export async function createProjectSteps(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const [{ data: categories, error: catError }, { data: template, error: tplError }] = await Promise.all([
    supabase.from('finka_checklist_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_checklist_templates').select('*').order('sort_order', { ascending: true }),
  ])
  if (catError || tplError) return (catError ?? tplError)!.message
  const categoryItems = (categories ?? []) as ChecklistCategoryItem[]
  const templateItems = (template ?? []) as ChecklistTemplateItem[]
  if (!categoryItems.length || !templateItems.length) {
    return 'Geen draaiboek gevonden — stel dit eerst in via Instellingen > Draaiboek.'
  }
  const categoryOrder = new Map(categoryItems.map((c, index) => [c.id, index]))
  const categoryLabels = new Map(categoryItems.map((c) => [c.id, c.label]))
  const sorted = [...templateItems].sort((a, b) => {
    const catDiff = (categoryOrder.get(a.category_id) ?? 0) - (categoryOrder.get(b.category_id) ?? 0)
    return catDiff !== 0 ? catDiff : a.sort_order - b.sort_order
  })
  const rows = sorted.map((t, index) => ({
    project_id: projectId,
    item_key: null,
    template_id: t.id,
    category: categoryLabels.get(t.category_id) ?? 'Overig',
    label: t.label,
    visible_to_customer: t.visible_to_customer,
    sort_order: index,
  }))
  const { error: insError } = await supabase.from('finka_checklist_items').insert(rows)
  if (insError) return insError.message
  const { error } = await refreshUnlocks(supabase, projectId)
  return error
}
