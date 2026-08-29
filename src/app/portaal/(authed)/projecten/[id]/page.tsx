export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ArrowLeft, Check } from 'lucide-react'
import { getPortalCustomer } from '@/lib/portal'
import { createServiceClient } from '@/lib/supabase/service'
import { ChecklistItem, Project, ProjectMilestone } from '@/lib/types'
import { MILESTONE_ORDER, MILESTONE_STATUS_COLORS, MILESTONE_STATUS_LABELS, milestoneLabel } from '@/lib/planning'
import { categoryLabel, checklistItemLabel } from '@/lib/checklist'

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  const service = createServiceClient()
  const { data: project } = await service.from('finka_projects').select('*').eq('id', id).maybeSingle()
  // Niet alleen "bestaat het project", maar ook "hoort het bij déze klant" —
  // zonder deze check zou elke ingelogde klant elk project-id kunnen
  // opvragen. Zie src/lib/portal.ts / migratie-sectie 46.
  if (!project || (project as Project).customer_id !== session.customer.id) notFound()

  const [{ data: milestonesData }, { data: itemsData }] = await Promise.all([
    service.from('finka_project_milestones').select('*').eq('project_id', id),
    service.from('finka_checklist_items').select('*').eq('project_id', id),
  ])
  const milestones = (milestonesData ?? []) as ProjectMilestone[]
  const items = (itemsData ?? []) as ChecklistItem[]

  const fixedRows = MILESTONE_ORDER.map((key) => milestones.find((m) => m.milestone_key === key)).filter(
    (m): m is ProjectMilestone => !!m
  )
  const customRows = milestones
    .filter((m) => m.milestone_key === 'custom')
    .sort((a, b) => a.sort_order - b.sort_order)
  const orderedMilestones = [...fixedRows, ...customRows]

  const total = items.length
  const doneCount = items.filter((i) => i.checked).length
  const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const minOrder = new Map<string, number>()
  for (const item of items) {
    const label = categoryLabel(item.category)
    const current = minOrder.get(label)
    if (current === undefined || item.sort_order < current) minOrder.set(label, item.sort_order)
  }
  const categories = Array.from(minOrder.entries()).sort((a, b) => a[1] - b[1]).map(([label]) => label)

  return (
    <div className="space-y-6">
      <Link href="/portaal" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19]">
        <ArrowLeft size={14} />
        Terug
      </Link>

      <h1 className="text-xl font-semibold text-[#1C1B19]">{(project as Project).title}</h1>

      {orderedMilestones.length > 0 && (
        <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
            <h2 className="text-sm font-medium text-[#1C1B19]">Planning</h2>
          </div>
          <div className="divide-y divide-[#DDD8D2]">
            {orderedMilestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm text-[#1C1B19]">{milestoneLabel(m)}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {m.date && (
                    <span className="text-sm text-[#6B6560]">
                      {format(new Date(m.date), 'd MMM yyyy', { locale: nl })}
                    </span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full border"
                    style={{ color: MILESTONE_STATUS_COLORS[m.status], borderColor: MILESTONE_STATUS_COLORS[m.status] + '40' }}
                  >
                    {MILESTONE_STATUS_LABELS[m.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#1C1B19]">Voortgang</span>
            <span className="text-sm text-[#6B6560]">{doneCount} van {total} afgerond · {percentage}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#F0EDE9] overflow-hidden">
            <div className="h-full rounded-full bg-[#C9A96E] transition-all" style={{ width: `${percentage}%` }} />
          </div>
        </div>
      )}

      {categories.map((category) => {
        const catItems = items
          .filter((i) => categoryLabel(i.category) === category)
          .sort((a, b) => a.sort_order - b.sort_order)
        return (
          <div key={category} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <h2 className="text-sm font-medium text-[#1C1B19]">{category}</h2>
            </div>
            <div className="divide-y divide-[#DDD8D2]">
              {catItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${item.checked ? 'bg-[#C9A96E] border-[#C9A96E]' : 'border-[#DDD8D2]'}`}
                  >
                    {item.checked && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className={`text-sm ${item.checked ? 'text-[#9A948D] line-through' : 'text-[#1C1B19]'}`}>
                    {item.label ?? (item.item_key ? checklistItemLabel(item) : '')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {orderedMilestones.length === 0 && total === 0 && (
        <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 text-center">
          Er is nog geen planning of status beschikbaar voor dit project.
        </p>
      )}
    </div>
  )
}
