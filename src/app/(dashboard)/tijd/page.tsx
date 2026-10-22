export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { cn } from '@/lib/utils'
import {
  formatDuration,
  parseTimePeriod,
  periodStart,
  projectLabel,
  projectSubLabel,
  TIME_PERIODS,
  summarizeTime,
  TIMER_PROJECT_SELECT,
  TimeEntryWithProject,
} from '@/lib/time-tracking'

// Geregistreerde tijd over alle projecten: totaal en per persoon voor de
// gekozen periode, daaronder de projecten met de meeste tijd bovenaan. Zie
// src/lib/time-tracking.ts en de timer in src/components/ProjectTimer.tsx.

export default async function TijdPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const period = parseTimePeriod((await searchParams).periode)
  const since = periodStart(period)
  const supabase = await createClient()

  const { data: entries } = await fetchAll<TimeEntryWithProject>((from, to) => {
    let query = supabase
      .from('finka_time_entries')
      .select(`*, project:finka_projects(${TIMER_PROJECT_SELECT})`)
      .order('id')
      .range(from, to)
    // Ook sessies die vóór het begin startten maar erna eindigden (of nog
    // lopen) tellen deels mee.
    if (since) query = query.or(`ended_at.is.null,ended_at.gt.${since.toISOString()}`)
    return query
  })

  const { total, perPerson, projects } = summarizeTime(entries, since)
  const people = [...perPerson].sort((a, b) => b[1] - a[1])
  const periodLabel = TIME_PERIODS.find((p) => p.key === period)?.label ?? ''

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Tijd</h1>
        <p className="text-sm text-[#6B6560] mt-0.5">Geregistreerde tijd per project en per persoon.</p>
      </div>

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {TIME_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/tijd?periode=${p.key}`}
            className={cn(
              'px-3 py-1.5 text-xs rounded-lg border transition-colors',
              p.key === period
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-[#DDD8D2] px-4 py-3">
          <p className="text-xs text-[#6B6560]">Totaal · {periodLabel.toLowerCase()}</p>
          <p className="text-2xl font-semibold text-[#1C1B19] tabular-nums mt-1">{formatDuration(total)}</p>
        </div>
        {people.map(([person, seconds]) => (
          <div key={person} className="bg-white rounded-xl border border-[#DDD8D2] px-4 py-3">
            <p className="text-xs text-[#6B6560]">{person}</p>
            <p className="text-2xl font-semibold text-[#1C1B19] tabular-nums mt-1">{formatDuration(seconds)}</p>
          </div>
        ))}
      </div>

      {!projects.length ? (
        <div className="bg-white rounded-xl border border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Geen geregistreerde tijd in deze periode</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#EEEAE5]">
          {projects.map(({ project, seconds, perPerson: split }) => (
            <Link
              key={project.id}
              href={`/projecten/${project.id}`}
              className="flex items-center gap-4 px-4 md:px-5 py-3 hover:bg-[#F7F5F2] transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[#1C1B19] truncate">{projectLabel(project)}</span>
                <span className="block text-xs text-[#9A948D] truncate">{projectSubLabel(project)}</span>
              </span>
              <span className="hidden sm:block text-xs text-[#9A948D] tabular-nums text-right">
                {[...split].map(([p, sec]) => `${p} ${formatDuration(sec)}`).join(' · ')}
              </span>
              <span className="w-20 shrink-0 text-right text-sm font-medium text-[#1C1B19] tabular-nums">
                {formatDuration(seconds)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
