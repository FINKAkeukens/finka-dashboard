export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ArrowRight, Plus } from 'lucide-react'
import { Project, ProjectMilestone, ProjectStatus } from '@/lib/types'
import { milestoneLabel, urgencyClass } from '@/lib/planning'

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

  const { data: statuses } = await supabase
    .from('finka_project_statuses')
    .select('*')
    .order('sort_order') as { data: ProjectStatus[] | null }

  let query = supabase
    .from('finka_projects')
    .select('*, customer:finka_customers(id, first_name, last_name), status:finka_project_statuses(id, label, color)')
    .is('archived_at', null)

  if (status && status !== 'alle') query = query.eq('status_id', status)

  const { data: projectsData } = await query as { data: Project[] | null }
  const projects = projectsData ?? []

  const milestonesByProject = new Map<string, ProjectMilestone[]>()
  if (projects.length) {
    const { data: milestonesData } = await supabase
      .from('finka_project_milestones')
      .select('*')
      .in('project_id', projects.map((p) => p.id))
    for (const m of (milestonesData ?? []) as ProjectMilestone[]) {
      if (!m.project_id) continue // algemene taken (geen project) horen hier niet
      const list = milestonesByProject.get(m.project_id) ?? []
      list.push(m)
      milestonesByProject.set(m.project_id, list)
    }
  }

  // Dringendste eerst; projecten zonder (openstaande) datum onderaan, gesorteerd
  // op aanmaakdatum — lost precies het "wat komt eraan"-probleem op waar de
  // vlakke lijst (op aanmaakdatum) niks over zei.
  const rows = projects
    .map((project) => ({ project, next: nextMilestone(milestonesByProject.get(project.id) ?? []) }))
    .sort((a, b) => {
      if (a.next && b.next) return new Date(a.next.date as string).getTime() - new Date(b.next.date as string).getTime()
      if (a.next) return -1
      if (b.next) return 1
      return new Date(b.project.created_at).getTime() - new Date(a.project.created_at).getTime()
    })

  return (
    <div className="p-8 max-w-6xl">
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

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        {!rows.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[#6B6560]">Geen projecten gevonden</p>
            <Link href="/projecten/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
              Project toevoegen →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Referentie</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Project</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Klant</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Volgende mijlpaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD8D2]">
              {rows.map(({ project: p, next }) => (
                <tr key={p.id} className="hover:bg-[#F7F5F2] transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/projecten/${p.id}`} className="font-mono text-xs text-[#6B6560] hover:text-[#1C1B19]">
                      {p.reference_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/projecten/${p.id}`} className="font-medium text-[#1C1B19] hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.customer ? (
                      <Link href={`/klanten/${p.customer.id}`} className="text-[#6B6560] hover:text-[#1C1B19]">
                        {p.customer.first_name} {p.customer.last_name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {p.status && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border"
                        style={{ borderColor: p.status.color, color: p.status.color }}
                      >
                        {p.status.label}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    {next ? (
                      <span className={urgencyClass(next.date as string)}>
                        {milestoneLabel(next)} — {format(new Date(next.date as string), 'd MMM', { locale: nl })}
                      </span>
                    ) : (
                      <span className="text-[#9A948D] italic">Nog niet gepland</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
