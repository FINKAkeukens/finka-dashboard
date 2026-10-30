import { differenceInCalendarDays } from 'date-fns'
import { ChecklistItem, ChecklistTemplateItem, MilestoneStatus, ProjectMilestone } from './types'
import { checklistItemLabel } from './checklist'
import { buildSteps, stepDate } from './draaiboek'
import { milestoneLabel } from './planning'

// ---------------------------------------------------------------------------
// /planning — alles wat er nu moet gebeuren, over alle lopende projecten:
// de vrijgekomen open draaiboekstappen, de afspraken (mijlpalen) die niet
// al via een stap meekomen, en de algemene taken. Gedeeld met het blokje op
// de dashboard-startpagina, zodat de volgorde overal dezelfde is.
// ---------------------------------------------------------------------------

export interface PlanningProjectInfo {
  id: string
  title: string
  referenceNumber: string
  customerName: string
  // Fase waar een nieuwe taak bij dit project in komt (zie
  // phaseLabelForStatus).
  phaseLabel: string | null
}

export interface PlanningEntry {
  key: string
  // Een draaiboekstap/losse projecttaak (itemId), een afspraak of algemene
  // taak (milestoneId), of een stap die aan een afspraak hangt (allebei).
  itemId: string | null
  milestoneId: string | null
  project: PlanningProjectInfo | null
  phase: string | null
  label: string
  date: string | null
  assignee: string | null
  priority: boolean
  notes: string | null
  isAfspraak: boolean
  milestoneStatus: MilestoneStatus | null
}

export type PlanningBucket = 'prio' | 'laat' | 'vandaag' | 'week' | 'later' | 'geen'

export const BUCKET_TITLES: Record<PlanningBucket, string> = {
  prio: 'Prio',
  laat: 'Te laat',
  vandaag: 'Vandaag en morgen',
  week: 'Deze week',
  later: 'Later',
  geen: 'Zonder datum',
}

export const BUCKET_ORDER: PlanningBucket[] = ['prio', 'laat', 'vandaag', 'week', 'later', 'geen']

export function entryBucket(entry: PlanningEntry, today: Date): PlanningBucket {
  if (entry.priority) return 'prio'
  return dateBucket(entry, today)
}

// Alleen op datum, los van prio — voor de kleur van de datum: een verlopen
// deadline is rood, ook als de taak op prio staat.
export function dateBucket(entry: PlanningEntry, today: Date): Exclude<PlanningBucket, 'prio'> {
  if (!entry.date) return 'geen'
  const days = differenceInCalendarDays(new Date(entry.date), today)
  if (days < 0) return 'laat'
  if (days <= 1) return 'vandaag'
  if (days <= 7) return 'week'
  return 'later'
}

// Op datum (zonder datum achteraan), dan project, dan naam.
export function compareEntries(a: PlanningEntry, b: PlanningEntry): number {
  const da = a.date ?? '9999-12-31'
  const db = b.date ?? '9999-12-31'
  if (da !== db) return da.localeCompare(db)
  const pa = a.project?.referenceNumber ?? ''
  const pb = b.project?.referenceNumber ?? ''
  if (pa !== pb) return pa.localeCompare(pb)
  return a.label.localeCompare(b.label, 'nl')
}

export function buildPlanningEntries({
  projects,
  items,
  templates,
  milestones,
  generalTasks,
}: {
  projects: PlanningProjectInfo[]
  items: ChecklistItem[]
  templates: ChecklistTemplateItem[]
  milestones: ProjectMilestone[]
  generalTasks: ProjectMilestone[]
}): PlanningEntry[] {
  const entries: PlanningEntry[] = []

  for (const project of projects) {
    const projectItems = items.filter((i) => i.project_id === project.id)
    const projectMilestones = milestones.filter((m) => m.project_id === project.id)
    const steps = buildSteps(projectItems, templates, projectMilestones)
    const linkedMilestoneIds = new Set<string>()

    for (const s of steps) {
      if (s.milestone) linkedMilestoneIds.add(s.milestone.id)
      if (s.done || !s.visible) continue
      entries.push({
        key: `item:${s.item.id}`,
        itemId: s.item.id,
        milestoneId: s.milestone?.id ?? null,
        project,
        phase: s.item.category,
        label: s.item.item_key ? checklistItemLabel(s.item) : s.item.label?.trim() || 'Naamloze taak',
        date: stepDate(s),
        assignee: s.item.assigned_to ?? s.milestone?.assigned_to ?? null,
        priority: s.item.priority,
        notes: s.item.notes,
        isAfspraak: !!s.milestone,
        milestoneStatus: s.milestone?.status ?? null,
      })
    }

    // Afspraken die niet al via een stap meekomen. Zonder datum alleen met
    // prio — elk project heeft een rij lege vaste mijlpalen, die zijn ruis.
    for (const m of projectMilestones) {
      if (linkedMilestoneIds.has(m.id) || m.status === 'klaar') continue
      if (!m.date && !m.priority) continue
      entries.push(milestoneEntry(m, project))
    }
  }

  for (const m of generalTasks) {
    if (m.status === 'klaar') continue
    entries.push(milestoneEntry(m, null))
  }

  return entries.sort(compareEntries)
}

export function milestoneEntry(m: ProjectMilestone, project: PlanningProjectInfo | null): PlanningEntry {
  return {
    key: `ms:${m.id}`,
    itemId: null,
    milestoneId: m.id,
    project,
    phase: null,
    label: milestoneLabel(m),
    date: m.date,
    assignee: m.assigned_to,
    priority: m.priority,
    notes: m.notes,
    isAfspraak: !!project,
    milestoneStatus: m.status,
  }
}

// Alleen de kolommen die de planning gebruikt — scheelt bij 1000+ taken flink
// in wat er uit de database komt.
export const PLANNING_ITEM_COLUMNS =
  'id, project_id, template_id, item_key, label, category, checked, checked_at, nvt, unlocked_at, due_date, assigned_to, priority, notes, sort_order'
