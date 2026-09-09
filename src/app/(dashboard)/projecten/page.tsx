export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ArrowRight, Plus } from 'lucide-react'
import { Project, ProjectMilestone, ProjectStatus } from '@/lib/types'
import { leadTimeDays, milestoneLabel, urgencyClass } from '@/lib/planning'
import ProjectsTable, { type ProjectRow } from './ProjectsTable'

// Eerstvolgende nog-niet-afgeronde mijlpaal met een datum — bepaalt zowel de
// sortering (dringendste bovenaan) als de "Volgende mijlpaal"-kolom.
function nextMilestone(milestones: ProjectMilestone[]): ProjectMilestone | null {
  const upcoming = milestones
    .filter((m) => !!m.date && m.status !== 'klaar')
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
  return upcoming[0] ?? null
}

export default async function ProjectenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('finka_projects')
    .select('*, customer:finka_customers(id, first_name, last_name), status:finka_project_statuses(id, label, color)')
    .is('archived_at', null)

  if (status && status !== 'alle') query = query.eq('status_id', status)

  // De statuslijst hangt niet van de projecten af, dus die hoeft er niet op
  // te wachten — samen ophalen scheelt een netwerkrondje.
  const [{ data: statusesData }, { data: projectsData }] = await Promise.all([
    supabase.from('finka_project_statuses').select('*').order('sort_order'),
    query,
  ])
  const statuses = statusesData as ProjectStatus[] | null
  const projects = (projectsData ?? []) as Project[]

  // Portaalactiviteit en mijlpalen hangen allebei alleen van de project-id's
  // af, niet van elkaar — dus ook samen, weer een rondje minder.
  const [{ data: activityData }, { data: milestonesData }] = projects.length
    ? await Promise.all([
        // Projecten waar de klant iets heeft gedaan dat staff nog niet gezien
        // heeft — zie migratie-sectie 63 / het meldingenblok op de projectpagina.
        supabase
          .from('finka_portal_activity')
          .select('project_id')
          .in('project_id', projects.map((p) => p.id))
          .is('seen_at', null),
        supabase
          .from('finka_project_milestones')
          .select('*')
          .in('project_id', projects.map((p) => p.id)),
      ])
    : [{ data: null }, { data: null }]

  const projectsWithPortalActivity = new Set<string>()
  for (const row of activityData ?? []) projectsWithPortalActivity.add(row.project_id)

  const milestonesByProject = new Map<string, ProjectMilestone[]>()
  for (const m of (milestonesData ?? []) as ProjectMilestone[]) {
    if (!m.project_id) continue // algemene taken (geen project) horen hier niet
    const list = milestonesByProject.get(m.project_id) ?? []
    list.push(m)
    milestonesByProject.set(m.project_id, list)
  }

  // Dringendste eerst; projecten zonder (openstaande) datum onderaan, gesorteerd
  // op aanmaakdatum — lost precies het "wat komt eraan"-probleem op waar de
  // vlakke lijst (op aanmaakdatum) niks over zei.
  const rows: ProjectRow[] = projects
    .map((project) => ({ project, next: nextMilestone(milestonesByProject.get(project.id) ?? []) }))
    .sort((a, b) => {
      if (a.next && b.next) return new Date(a.next.date as string).getTime() - new Date(b.next.date as string).getTime()
      if (a.next) return -1
      if (b.next) return 1
      return new Date(b.project.created_at).getTime() - new Date(a.project.created_at).getTime()
    })
    // Platgeslagen tot precies de tekst die in de tabel komt te staan, zodat
    // de zoekbalken per kolom op exact dát zoeken (zie ProjectsTable).
    .map(({ project: p, next }) => ({
      id: p.id,
      reference: p.reference_number,
      title: p.title,
      customerId: p.customer?.id ?? null,
      customerName: p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : '',
      statusLabel: p.status?.label ?? '',
      statusColor: p.status?.color ?? null,
      leadTime: p.first_contact_date ? `${leadTimeDays(p.first_contact_date)} dagen` : '—',
      milestone: next
        ? `${milestoneLabel(next)} — ${format(new Date(next.date as string), 'd MMM', { locale: nl })}`
        : 'Nog niet gepland',
      milestoneClass: next ? urgencyClass(next.date as string) : '',
      hasPortalActivity: projectsWithPortalActivity.has(p.id),
    }))

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Projecten</h1>
          <p className="text-sm text-[#6B6560] mt-0.5">{projects.length} projecten totaal</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/planning" className="flex items-center gap-1 text-sm text-[#C9A96E] hover:underline">
            Bekijk tijdlijn <ArrowRight size={14} />
          </Link>
          <Link
            href="/projecten/nieuw"
            className="flex items-center gap-1.5 bg-[#1C1B19] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2D2C2A] transition-colors"
          >
            <Plus size={15} />
            Nieuw project
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        <Link
          href="/projecten"
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            !status || status === 'alle'
              ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
              : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
          }`}
        >
          Alle
        </Link>
        {statuses?.map((s) => (
          <Link
            key={s.id}
            href={`/projecten?status=${s.id}`}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              status === s.id
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {!rows.length ? (
        <div className="bg-white rounded-xl border border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Geen projecten gevonden</p>
          <Link href="/projecten/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
            Project toevoegen →
          </Link>
        </div>
      ) : (
        <ProjectsTable rows={rows} />
      )}
    </div>
  )
}
