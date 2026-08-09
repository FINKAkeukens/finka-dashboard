'use client'

import Link from 'next/link'
import { differenceInCalendarDays, format, isSameMonth, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ProjectMilestone } from '@/lib/types'
import { MILESTONE_STATUS_COLORS, milestoneLabel, urgencyClass } from '@/lib/planning'

export interface PlanningProject {
  id: string
  title: string
  referenceNumber: string
  customerName: string
  statusLabel: string | null
  statusColor: string
  milestones: ProjectMilestone[]
}

interface AgendaEntry {
  project: PlanningProject
  milestone: ProjectMilestone
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Groepskopjes — vaste labels dichtbij vandaag, daarna per kalendermaand.
// Omdat alles chronologisch gesorteerd is, verandert dit label monotoon
// tijdens het doorlopen van de lijst (geen aparte sorteerstap nodig).
function bucketLabel(date: Date, today: Date): string {
  const days = differenceInCalendarDays(date, today)
  if (days < 0) return 'Te laat'
  if (days === 0) return 'Vandaag'
  if (days === 1) return 'Morgen'
  if (days <= 7) return 'Deze week'
  if (days <= 14) return 'Volgende week'
  if (isSameMonth(date, today)) return 'Deze maand'
  return capitalize(format(date, 'MMMM yyyy', { locale: nl }))
}

function relativeLabel(date: Date, today: Date): string {
  const days = differenceInCalendarDays(date, today)
  if (days === 0) return 'vandaag'
  if (days === 1) return 'morgen'
  if (days === -1) return 'gisteren'
  if (days > 0) return `over ${days} dagen`
  return `${Math.abs(days)} dagen geleden`
}

function UnplannedList({ projects }: { projects: PlanningProject[] }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
      <h2 className="text-sm font-medium text-[#1C1B19] mb-3">Nog niet (volledig) gepland</h2>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projecten/${p.id}`}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-[#DDD8D2] text-[#6B6560] hover:border-[#C9A96E] hover:text-[#1C1B19] transition-colors"
          >
            {p.customerName} · {p.title}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function PlanningAgenda({ projects }: { projects: PlanningProject[] }) {
  const today = startOfDay(new Date())

  const entries: AgendaEntry[] = []
  const unplanned: PlanningProject[] = []

  for (const project of projects) {
    const upcoming = project.milestones.filter((m) => !!m.date && m.status !== 'klaar')
    if (upcoming.length) {
      for (const m of upcoming) entries.push({ project, milestone: m })
    } else if (project.milestones.some((m) => !m.date)) {
      // Alles wat wél een datum had staat al op 'klaar' — verder niks te
      // plannen. Alleen tonen als er nog een leeg mijlpunt openstaat.
      unplanned.push(project)
    }
  }

  entries.sort(
    (a, b) => new Date(a.milestone.date as string).getTime() - new Date(b.milestone.date as string).getTime()
  )

  if (!projects.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">Nog geen projecten om te plannen.</p>
      </div>
    )
  }

  if (!entries.length) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Geen aankomende mijlpalen — vul datums in bij de Planning-tab van een project.</p>
        </div>
        {unplanned.length > 0 && <UnplannedList projects={unplanned} />}
      </div>
    )
  }

  let prevBucket: string | null = null

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#EFEBE4]">
        {entries.map((entry) => {
          const date = new Date(entry.milestone.date as string)
          const bucket = bucketLabel(date, today)
          const showHeader = bucket !== prevBucket
          prevBucket = bucket
          return (
            <div key={entry.milestone.id}>
              {showHeader && (
                <div
                  className={`px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider ${
                    bucket === 'Te laat' ? 'text-red-600' : 'text-[#9A948D]'
                  }`}
                >
                  {bucket}
                </div>
              )}
              <div className="flex items-center gap-4 px-5 py-3">
                <div className="w-14 shrink-0 text-xs text-[#6B6560] tabular-nums">
                  {format(date, 'd MMM', { locale: nl })}
                </div>
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: MILESTONE_STATUS_COLORS[entry.milestone.status] }}
                />
                <div className="flex-1 min-w-0">
                  <Link href={`/projecten/${entry.project.id}`} className="text-sm text-[#1C1B19] hover:text-[#C9A96E] truncate block">
                    <span className="font-medium">{entry.project.customerName}</span>{' '}
                    <span className="text-[#9A948D]">· {entry.project.title}</span>
                  </Link>
                </div>
                <div className="text-sm text-[#1C1B19] shrink-0 hidden sm:block">{milestoneLabel(entry.milestone)}</div>
                <div className={`w-28 text-right text-xs shrink-0 tabular-nums ${urgencyClass(entry.milestone.date as string)}`}>
                  {relativeLabel(date, today)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {unplanned.length > 0 && <UnplannedList projects={unplanned} />}
    </div>
  )
}
