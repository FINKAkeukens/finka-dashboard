export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Assignee, ChecklistCategoryItem, ChecklistItem, ChecklistTemplateItem, Project, ProjectMilestone } from '@/lib/types'
import { isCancelled } from '@/lib/project-dates'
import { phaseLabelForStatus } from '@/lib/draaiboek'
import { PLANNING_ITEM_COLUMNS, PlanningProjectInfo, buildPlanningEntries } from '@/lib/planning-overzicht'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { RETIRED_MILESTONE_KEY } from '@/lib/planning'
import { calendarConnection } from '@/lib/google-calendar'
import PlanningOverzicht from './PlanningOverzicht'

const AGENDA_ERRORS: Record<string, string> = {
  no_refresh_token: 'Google gaf geen blijvende toegang terug. Probeer het koppelen opnieuw.',
  oauth_failed: 'Koppelen met Google Agenda is mislukt. Probeer het opnieuw.',
}

export default async function PlanningOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ agenda?: string; agenda_fout?: string }>
}) {
  const { agenda, agenda_fout } = await searchParams
  const agendaMessage = agenda_fout
    ? { text: AGENDA_ERRORS[agenda_fout] ?? `Koppelen met Google Agenda is mislukt: ${agenda_fout}`, error: true }
    : agenda === 'gekoppeld'
      ? { text: 'Google Agenda is gekoppeld. Nieuwe afspraken kunnen nu in de agenda.', error: false }
      : null
  const supabase = await createClient()

  // Alles wat niet van de project-id's afhangt in één rondje; de stappen en
  // mijlpalen per project volgen daarna.
  const [
    { data: projectsData },
    { data: generalData },
    { data: templatesData },
    { data: categoriesData },
    { data: assigneesData },
  ] = await Promise.all([
    supabase
      .from('finka_projects')
      .select('*, customer:finka_customers(id, first_name, last_name, email), status:finka_project_statuses(id, label, color)')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    // Algemene taken — niet aan een project gekoppeld.
    supabase.from('finka_project_milestones').select('*').is('project_id', null).order('sort_order'),
    supabase.from('finka_checklist_templates').select('*'),
    supabase.from('finka_checklist_categories').select('*').order('sort_order'),
    supabase.from('finka_assignees').select('*').order('sort_order'),
  ])

  // Een geannuleerd project hoeft niet meer ingepland te worden.
  const projects = ((projectsData ?? []) as Project[]).filter((p) => !isCancelled(p))
  const projectIds = projects.map((p) => p.id)
  const categories = (categoriesData ?? []) as ChecklistCategoryItem[]
  const templates = (templatesData ?? []) as ChecklistTemplateItem[]
  const generalTasks = (generalData ?? []) as ProjectMilestone[]

  let items: ChecklistItem[] = []
  let milestones: ProjectMilestone[] = []
  if (projectIds.length) {
    const [{ data: itemsData }, { data: msData }] = await Promise.all([
      fetchAll<ChecklistItem>((from, to) =>
        supabase.from('finka_checklist_items').select(PLANNING_ITEM_COLUMNS).in('project_id', projectIds).order('id').range(from, to)
      ),
      fetchAll<ProjectMilestone>((from, to) =>
        supabase.from('finka_project_milestones').select('*').in('project_id', projectIds).neq('milestone_key', RETIRED_MILESTONE_KEY).order('id').range(from, to)
      ),
    ])
    items = itemsData.sort((a, b) => a.sort_order - b.sort_order)
    milestones = msData.sort((a, b) => a.sort_order - b.sort_order)
  }

  // Met welk Google-account de afspraken in de agenda komen (null = nog niet
  // gekoppeld). Bestaat de tabel nog niet (migratie 100), dan ook null.
  const calendar = await calendarConnection().catch(() => null)

  const planningProjects: PlanningProjectInfo[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    referenceNumber: p.reference_number,
    customerName: p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : '—',
    customerEmail: (p.customer as { email?: string | null } | null)?.email ?? null,
    phaseLabel: phaseLabelForStatus(categories, p.status_id, p.status?.label ?? null) ?? categories[0]?.label ?? null,
  }))

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Planning</h1>
        <p className="text-sm text-[#6B6560] mt-1">Taken en afspraken van alle lopende projecten.</p>
      </div>
      {/* De lijst wordt hier op de server samengesteld: de browser krijgt
          alleen de open taken, niet alle 1000+ projecttaken. */}
      <PlanningOverzicht
        projects={planningProjects}
        initialEntries={buildPlanningEntries({ projects: planningProjects, items, templates, milestones, generalTasks })}
        templates={templates}
        assignees={(assigneesData ?? []) as Assignee[]}
        calendarAccount={calendar ? calendar.account_email ?? 'gekoppeld' : null}
        agendaMessage={agendaMessage}
      />
    </div>
  )
}
