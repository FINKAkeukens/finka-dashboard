export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Project, ProjectMilestone } from '@/lib/types'
import PlanningAgenda, { PlanningProject } from './PlanningAgenda'

export default async function PlanningOverviewPage() {
  const supabase = await createClient()

  const { data: projectsData } = await supabase
    .from('finka_projects')
    .select('*, customer:finka_customers(id, first_name, last_name), status:finka_project_statuses(id, label, color)')
    .is('archived_at', null)
    .order('created_at', { ascending: false }) as { data: Project[] | null }

  const projects = projectsData ?? []
  const projectIds = projects.map((p) => p.id)

  let milestones: ProjectMilestone[] = []
  if (projectIds.length) {
    const { data } = await supabase
      .from('finka_project_milestones')
      .select('*')
      .in('project_id', projectIds)
      .order('sort_order')
    milestones = (data ?? []) as ProjectMilestone[]
  }

  // Algemene taken — niet aan een project gekoppeld, eigen sectie op de pagina.
  const { data: generalData } = await supabase
    .from('finka_project_milestones')
    .select('*')
    .is('project_id', null)
    .order('sort_order')
  const generalTasks = (generalData ?? []) as ProjectMilestone[]

  const planningProjects: PlanningProject[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    referenceNumber: p.reference_number,
    customerName: p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : '—',
    statusLabel: p.status?.label ?? null,
    statusColor: p.status?.color ?? '#9CA3AF',
    milestones: milestones.filter((m) => m.project_id === p.id),
  }))

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Planning</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Aankomende mijlpalen van alle lopende projecten, op volgorde van datum. Status, toewijzing en notities pas je hier direct aan — datums wijzig je bij de Planning-tab van een project.
        </p>
      </div>
      <PlanningAgenda projects={planningProjects} generalTasks={generalTasks} />
    </div>
  )
}
