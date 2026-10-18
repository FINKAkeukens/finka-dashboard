export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Assignee, ChecklistCategoryItem, ChecklistItem, ChecklistTemplateItem, Project, ProjectMilestone } from '@/lib/types'
import { isCancelled } from '@/lib/project-dates'
import { phaseLabelForStatus } from '@/lib/draaiboek'
import { PlanningProjectInfo } from '@/lib/planning-overzicht'
import PlanningOverzicht from './PlanningOverzicht'

export default async function PlanningOverviewPage() {
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
      .select('*, customer:finka_customers(id, first_name, last_name), status:finka_project_statuses(id, label, color)')
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

  let items: ChecklistItem[] = []
  let milestones: ProjectMilestone[] = []
  if (projectIds.length) {
    const [{ data: itemsData }, { data: msData }] = await Promise.all([
      supabase.from('finka_checklist_items').select('*').in('project_id', projectIds).order('sort_order'),
      supabase.from('finka_project_milestones').select('*').in('project_id', projectIds).order('sort_order'),
    ])
    items = (itemsData ?? []) as ChecklistItem[]
    milestones = (msData ?? []) as ProjectMilestone[]
  }

  const planningProjects: PlanningProjectInfo[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    referenceNumber: p.reference_number,
    customerName: p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : '—',
    phaseLabel: phaseLabelForStatus(categories, p.status_id, p.status?.label ?? null) ?? categories[0]?.label ?? null,
  }))

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Planning</h1>
        <p className="text-sm text-[#6B6560] mt-1">Taken en afspraken van alle lopende projecten.</p>
      </div>
      <PlanningOverzicht
        projects={planningProjects}
        items={items}
        templates={(templatesData ?? []) as ChecklistTemplateItem[]}
        milestones={milestones}
        generalTasks={(generalData ?? []) as ProjectMilestone[]}
        assignees={(assigneesData ?? []) as Assignee[]}
      />
    </div>
  )
}
