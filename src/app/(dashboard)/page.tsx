export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Users, Zap, Mail, TrendingUp, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { Project, ProjectMilestone } from '@/lib/types'
import { categoryLabel } from '@/lib/checklist'
import { averageDays, isOnHold, onHoldDays, ON_HOLD_STATUS_LABEL, projectDates } from '@/lib/project-dates'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: customerCount },
    { count: applianceCount },
    { count: inboxCount },
    { data: projectStatuses },
    { data: allProjectsData },
    { data: customersForStatus },
  ] = await Promise.all([
    supabase.from('finka_customers').select('*', { count: 'exact', head: true }),
    supabase.from('finka_appliances').select('*', { count: 'exact', head: true }),
    supabase.from('finka_email_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('finka_project_statuses').select('id, label, color, sort_order').order('sort_order'),
    supabase
      .from('finka_projects')
      .select('*, customer:finka_customers(first_name, last_name), status:finka_project_statuses(id, label, color, sort_order)')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('finka_customers').select('status'),
  ])
  const allProjects = (allProjectsData ?? []) as Project[]

  const projectCount = allProjects.length
  const projectCountByStatus = new Map<string, number>()
  for (const p of allProjects) {
    if (!p.status_id) continue
    projectCountByStatus.set(p.status_id, (projectCountByStatus.get(p.status_id) ?? 0) + 1)
  }

  // Checklist-kopjes komen inhoudelijk overeen met de projectfases (Lead,
  // Offerte, Akkoord, ...) — de voortgang bínnen de huidige fase (i.p.v. de
  // hele checklist) laat dus precies zien hoeveel werk er nog is voordat een
  // project naar de volgende fase kan.
  const projectIds = allProjects.map((p) => p.id)

  // Alle vier de vervolgqueries hangen alleen van projectIds af, niet van
  // elkaar — dus in één keer ophalen. Sequentieel waren dit vier losse
  // netwerkrondjes (~85ms per stuk) terwijl parallel er ongeveer één kost.
  const [
    { data: checklistItems },
    { data: quotesData },
    { data: milestonesData },
    { data: activityData },
  ] = projectIds.length
    ? await Promise.all([
        supabase
          .from('finka_checklist_items')
          .select('project_id, category, checked')
          .in('project_id', projectIds),
        supabase
          .from('finka_quotes')
          .select('project_id, akkoord_at')
          .in('project_id', projectIds)
          .not('akkoord_at', 'is', null)
          .order('akkoord_at', { ascending: true }),
        supabase
          .from('finka_project_milestones')
          .select('project_id, milestone_key, date')
          .in('project_id', projectIds)
          .in('milestone_key', ['montage_start', 'oplevering']),
        supabase
          .from('finka_portal_activity')
          .select('project_id')
          .in('project_id', projectIds)
          .is('seen_at', null),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }]

  const checklistItemsByProject = new Map<string, { category: string; checked: boolean }[]>()
  for (const item of checklistItems ?? []) {
    const list = checklistItemsByProject.get(item.project_id) ?? []
    list.push({ category: item.category, checked: item.checked })
    checklistItemsByProject.set(item.project_id, list)
  }

  function phaseProgress(project: Project): { done: number; total: number; percentage: number } | null {
    if (!project.status) return null
    const items = (checklistItemsByProject.get(project.id) ?? []).filter(
      (i) => categoryLabel(i.category) === project.status!.label
    )
    if (items.length === 0) return null
    const done = items.filter((i) => i.checked).length
    return { done, total: items.length, percentage: Math.round((done / items.length) * 100) }
  }

  const projectsByStatus = new Map<string, Project[]>()
  for (const p of allProjects) {
    if (!p.status_id) continue
    const list = projectsByStatus.get(p.status_id) ?? []
    list.push(p)
    projectsByStatus.set(p.status_id, list)
  }

  // Gemiddelde doorlooptijd per traject, onder het faseoverzicht. Zelfde
  // datumbronnen als op de projectpagina (offerte-akkoord + de mijlpalen
  // montage_start/oplevering, met handmatige overschrijving) — zie
  // projectDates() in src/lib/project-dates.ts.
  const akkoordAtByProject = new Map<string, string>()
  const timelineMilestonesByProject = new Map<string, Pick<ProjectMilestone, 'milestone_key' | 'date'>[]>()
  // Eerste (vroegste) akkoord telt — bij een herziene offerte blijft het
  // oorspronkelijke akkoordmoment de start van het traject.
  for (const q of quotesData ?? []) {
    if (!akkoordAtByProject.has(q.project_id)) akkoordAtByProject.set(q.project_id, q.akkoord_at)
  }
  for (const m of milestonesData ?? []) {
    if (!m.project_id) continue
    const list = timelineMilestonesByProject.get(m.project_id) ?? []
    list.push(m)
    timelineMilestonesByProject.set(m.project_id, list)
  }

  // Groen bolletje op de projectkaart — zie migratie-sectie 63.
  const projectsWithPortalActivity = new Set<string>()
  for (const row of activityData ?? []) projectsWithPortalActivity.add(row.project_id)

  const allProjectDates = allProjects.map((p) =>
    projectDates(p, {
      quoteAkkoordAt: akkoordAtByProject.get(p.id) ?? null,
      milestones: timelineMilestonesByProject.get(p.id) ?? [],
    })
  )

  // Elk traject loopt over de fases waarin dat werk plaatsvindt, zodat de
  // gemiddelden onder de bijbehorende kolommen uitkomen.
  // Stilliggende projecten hebben geen traject maar wél een lopende teller:
  // gemiddeld aantal dagen dat ze al on hold staan.
  const onHoldSpans = allProjects
    .filter((p) => isOnHold(p))
    .map((p) => onHoldDays(p.on_hold_since))
    .filter((v): v is number => v !== null)
  const onHoldAverage = {
    days: onHoldSpans.length ? Math.round(onHoldSpans.reduce((sum, v) => sum + v, 0) / onHoldSpans.length) : null,
    projectCount: onHoldSpans.length,
  }

  const leadTimeSegments = [
    { labels: ['Lead', 'Offerte', 'Akkoord'], title: 'Eerste contact → Akkoord', value: averageDays(allProjectDates, 'eersteContact', 'akkoord') },
    { labels: ['Gepland', 'In uitvoering'], title: 'Akkoord → Montage', value: averageDays(allProjectDates, 'akkoord', 'montage') },
    { labels: ['Opgeleverd'], title: 'Montage → Afronding', value: averageDays(allProjectDates, 'montage', 'afronding') },
    { labels: [ON_HOLD_STATUS_LABEL], title: 'Nu on hold', value: onHoldAverage },
  ]
    .map((segment) => ({
      ...segment,
      // Breedte volgt de daadwerkelijke kolommen, zodat een hernoemde of
      // verplaatste status het overzicht niet stilzwijgend scheeftrekt.
      span: (projectStatuses ?? []).filter((s) => segment.labels.includes(s.label)).length,
    }))
    .filter((segment) => segment.span > 0)

  const stats = [
    { label: 'Projecten', value: projectCount, icon: FolderKanban, href: '/projecten', color: 'text-[#C9A96E]' },
    { label: 'Klanten', value: customerCount ?? 0, icon: Users, href: '/klanten', color: 'text-blue-600' },
    { label: 'Apparatuur', value: applianceCount ?? 0, icon: Zap, href: '/apparatuur', color: 'text-amber-600' },
    { label: 'Inbox te verwerken', value: inboxCount ?? 0, icon: Mail, href: '/apparatuur/inbox', color: 'text-green-600' },
  ]

  const statusLabels: Record<string, string> = {
    prospect: 'Prospect',
    actief: 'Actief',
    afgerond: 'Afgerond',
    'on-hold': 'On hold',
  }

  const statusColors: Record<string, string> = {
    prospect: 'bg-blue-50 text-blue-700',
    actief: 'bg-green-50 text-green-700',
    afgerond: 'bg-gray-100 text-gray-600',
    'on-hold': 'bg-amber-50 text-amber-700',
  }

  const customerCountByStatus = new Map<string, number>()
  for (const c of customersForStatus ?? []) {
    customerCountByStatus.set(c.status, (customerCountByStatus.get(c.status) ?? 0) + 1)
  }

  const { data: recentCustomers } = await supabase
    .from('finka_customers')
    .select('id, reference_number, first_name, last_name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="p-8">
      <div className="max-w-6xl mb-8">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Dashboard</h1>
        <p className="text-sm text-[#6B6560] mt-1">Welkom terug bij FINKA</p>
      </div>

      {/* Stats */}
      <div className="max-w-6xl grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, href, color }) => (
          <Link key={href} href={href} className="bg-white rounded-xl border border-[#DDD8D2] p-5 hover:border-[#C9A96E] transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#6B6560]">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className="text-3xl font-semibold text-[#1C1B19]">{value}</p>
          </Link>
        ))}
      </div>

      {/* Fase-overzicht — één kolom per projectstatus (Lead/Offerte/Akkoord/
          ...), met per project de checklist-voortgang bínnen die fase. De
          kolombreedte/kaartenaantal laat in één oogopslag de workload per
          fase zien; het percentage per kaart laat zien hoeveel werk er nog
          is voordat dat project naar de volgende fase kan. Bewust full-width
          (geen max-w-6xl zoals de rest van de pagina) en op een vaste grid
          i.p.v. horizontaal scrollende kaarten, zodat alle fases in één
          keer zichtbaar zijn. */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-[#1C1B19] mb-3">Projecten per fase</h2>
        {!projectStatuses?.length ? (
          <p className="text-sm text-[#6B6560]">Nog geen projectstatussen ingesteld</p>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${projectStatuses.length}, minmax(0, 1fr))` }}>
            {projectStatuses.map((s) => {
              const projectsInPhase = projectsByStatus.get(s.id) ?? []
              return (
                <div key={s.id} className="min-w-0 bg-white rounded-xl border border-[#DDD8D2] flex flex-col">
                  <div className="px-4 py-3 border-b border-[#DDD8D2] flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-[#1C1B19]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                    <span className="text-xs text-[#9A948D]">{projectsInPhase.length}</span>
                  </div>
                  <div className="p-2 space-y-2 flex-1">
                    {projectsInPhase.length === 0 ? (
                      <p className="text-xs text-[#9A948D] px-2 py-3">Geen projecten</p>
                    ) : (
                      projectsInPhase.map((p) => {
                        const progress = phaseProgress(p)
                        return (
                          <Link
                            key={p.id}
                            href={`/projecten/${p.id}`}
                            className="block rounded-lg border border-[#DDD8D2] p-3 hover:border-[#C9A96E] transition-colors"
                          >
                            <p className="flex items-center gap-2 text-sm font-medium text-[#1C1B19]">
                              <span className="truncate">{p.title}</span>
                              {projectsWithPortalActivity.has(p.id) && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full bg-green-500"
                                  title="De klant heeft wijzigingen doorgevoerd in het portaal"
                                />
                              )}
                            </p>
                            <p className="text-xs text-[#6B6560] truncate">
                              {p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : p.reference_number}
                            </p>
                            {s.label === ON_HOLD_STATUS_LABEL ? (
                              // Bij een stilliggend project zegt checklist-voortgang niets —
                              // hoe lang het al stilligt wél.
                              <p className="text-xs text-[#C9A96E] mt-2">
                                {onHoldDays(p.on_hold_since) !== null
                                  ? `${onHoldDays(p.on_hold_since)} dagen on hold`
                                  : 'Datum on hold onbekend'}
                              </p>
                            ) : progress ? (
                              <div className="flex items-center gap-2 mt-2" title={`Checklist bij ${s.label}: ${progress.done} van ${progress.total} afgevinkt`}>
                                <div className="flex-1 h-1.5 rounded-full bg-[#F0EDE9] overflow-hidden">
                                  <div className="h-full rounded-full bg-[#C9A96E]" style={{ width: `${progress.percentage}%` }} />
                                </div>
                                <span className="text-xs text-[#6B6560] tabular-nums shrink-0">{progress.percentage}%</span>
                              </div>
                            ) : (
                              <p className="text-xs text-[#9A948D] mt-2">Geen checklist-punten bij deze fase</p>
                            )}
                          </Link>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Gemiddelde doorlooptijd per traject, uitgelijnd onder de fases
            waarin dat werk plaatsvindt. */}
        {projectStatuses?.length && leadTimeSegments.length > 0 && (
          <div
            className="mt-3 grid gap-4"
            style={{ gridTemplateColumns: `repeat(${projectStatuses.length}, minmax(0, 1fr))` }}
          >
            {leadTimeSegments.map((segment) => (
              <div
                key={segment.title}
                className="min-w-0 rounded-xl border border-[#DDD8D2] bg-[#F7F5F2] px-4 py-2.5"
                style={{ gridColumn: `span ${segment.span} / span ${segment.span}` }}
              >
                <p className="text-xs text-[#9A948D] truncate">{segment.title}</p>
                {segment.value.days !== null ? (
                  <>
                    <p className="text-sm text-[#1C1B19]">gemiddeld {segment.value.days} dagen</p>
                    <p className="text-xs text-[#9A948D]">
                      ({segment.value.projectCount} project{segment.value.projectCount !== 1 ? 'en' : ''})
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[#9A948D]">Nog geen gegevens</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-6xl">
        <div className="bg-white rounded-xl border border-[#DDD8D2] p-5 mb-8 max-w-sm">
          <h2 className="text-sm font-medium text-[#1C1B19] mb-3">Klanten per status</h2>
          <div className="space-y-2">
            {Object.entries(statusLabels).map(([key, label]) => (
              <Link
                key={key}
                href="/klanten"
                className="flex items-center justify-between text-sm hover:text-[#1C1B19] transition-colors"
              >
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[key]}`}>{label}</span>
                <span className="font-medium text-[#1C1B19]">{customerCountByStatus.get(key) ?? 0}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent customers */}
        <div className="bg-white rounded-xl border border-[#DDD8D2]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#DDD8D2]">
            <h2 className="text-sm font-medium text-[#1C1B19]">Recente klanten</h2>
            <Link href="/klanten" className="text-xs text-[#6B6560] hover:text-[#1C1B19]">
              Alle klanten →
            </Link>
          </div>
          {!recentCustomers?.length ? (
            <div className="px-6 py-10 text-center">
              <TrendingUp size={24} className="mx-auto text-[#DDD8D2] mb-2" />
              <p className="text-sm text-[#6B6560]">Nog geen klanten toegevoegd</p>
              <Link href="/klanten/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
                Eerste klant toevoegen →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#DDD8D2]">
              {recentCustomers.map(c => (
                <Link key={c.id} href={`/klanten/${c.id}`} className="flex items-center justify-between px-6 py-3.5 hover:bg-[#F7F5F2] transition-colors">
                  <div>
                    <span className="text-sm font-medium text-[#1C1B19]">{c.first_name} {c.last_name}</span>
                    <span className="text-xs text-[#6B6560] ml-2">{c.reference_number}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[c.status]}`}>
                    {statusLabels[c.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
