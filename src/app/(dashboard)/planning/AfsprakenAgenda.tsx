'use client'

import { useState } from 'react'
import { addDays, addWeeks, differenceInCalendarDays, format, getISOWeek, isSameDay, startOfWeek } from 'date-fns'
import { nl } from 'date-fns/locale'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, TriangleAlert, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlanningEntry } from '@/lib/planning-overzicht'

// Weekagenda bovenaan /planning: alle afspraken (mijlpalen) van maandag
// t/m zondag, met tijd, wie, Meet-link en of ze in Google Agenda staan.
// Klikken opent de afspraak in de editor eronder (PlanningOverzicht).
export default function AfsprakenAgenda({
  afspraken,
  today,
  calendarAccount,
  selectedKey,
  onOpen,
}: {
  afspraken: PlanningEntry[]
  today: Date
  calendarAccount: string | null
  selectedKey: string | null
  onOpen: (e: PlanningEntry) => void
}) {
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 })
  const [weekStart, setWeekStart] = useState(thisMonday)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = days[6]

  const dated = afspraken.filter((e) => e.date)
  const inWeek = (day: Date) =>
    dated
      .filter((e) => isSameDay(new Date(`${e.date}T00:00:00`), day))
      .sort((a, b) => (a.agenda?.startTime ?? '').localeCompare(b.agenda?.startTime ?? ''))
  // Van vóór deze week en nog niet afgerond, en afspraken zonder datum
  // (alleen die met prio komen in de planning).
  const overdue = dated.filter((e) => differenceInCalendarDays(new Date(`${e.date}T00:00:00`), thisMonday) < 0)
  const undated = afspraken.filter((e) => !e.date)

  return (
    <section className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[#DDD8D2]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CalendarDays size={18} className="text-[#8A6A2E]" aria-hidden />
          <h2 className="text-[15px] font-semibold text-[#1C1B19]">Afspraken</h2>
          <span className="text-[13px] text-[#6B6560]">
            week {getISOWeek(weekStart)} · {format(weekStart, 'd MMM', { locale: nl })} t/m {format(weekEnd, 'd MMM', { locale: nl })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {calendarAccount ? (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-[#6B6560]" title="Afspraken met het vinkje Google Agenda komen in deze agenda">
              <Check size={13} className="text-green-700" />
              Google Agenda: {calendarAccount}
            </span>
          ) : (
            <a href="/api/google-calendar/auth" className="text-xs font-medium text-[#8A6A2E] hover:underline">
              Google Agenda koppelen
            </a>
          )}
          <div className="flex gap-1.5">
            <button type="button" aria-label="Vorige week" onClick={() => setWeekStart(addWeeks(weekStart, -1))} className="w-8 h-8 flex items-center justify-center border border-[#DDD8D2] rounded-lg hover:border-[#1C1B19]">
              <ChevronLeft size={15} />
            </button>
            <button type="button" onClick={() => setWeekStart(thisMonday)} className="h-8 px-3 text-[13px] border border-[#DDD8D2] rounded-lg hover:border-[#1C1B19]">
              Deze week
            </button>
            <button type="button" aria-label="Volgende week" onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="w-8 h-8 flex items-center justify-center border border-[#DDD8D2] rounded-lg hover:border-[#1C1B19]">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Op een smal scherm scrolt de week horizontaal. */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[840px]">
          {days.map((day) => {
            const isToday = isSameDay(day, today)
            const list = inWeek(day)
            return (
              <div key={day.toISOString()} className={cn('min-h-40 p-2 border-r border-[#EFEBE6] last:border-r-0 flex flex-col gap-2', isToday && 'bg-[#FDFBF7]')}>
                <div className="flex items-baseline gap-1.5 px-1">
                  <span className="text-[11px] uppercase tracking-wide text-[#6B6560]">{format(day, 'EEEEEE', { locale: nl })}</span>
                  <span className={cn('text-lg font-semibold', isToday ? 'text-[#8A6A2E]' : 'text-[#1C1B19]')}>{format(day, 'd')}</span>
                </div>
                {list.map((e) => (
                  <AfspraakCard key={e.key} entry={e} selected={selectedKey === e.key} onOpen={onOpen} />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {(overdue.length > 0 || undated.length > 0) && (
        <div className="flex flex-col gap-2 px-5 py-3 border-t border-[#DDD8D2] bg-[#FAF9F7]">
          {overdue.length > 0 && (
            <ChipRow title="Eerder, nog niet afgerond" tone="text-red-600" entries={overdue} onOpen={onOpen} showDate />
          )}
          {undated.length > 0 && <ChipRow title="Nog in te plannen" tone="text-[#6B6560]" entries={undated} onOpen={onOpen} />}
        </div>
      )}
    </section>
  )
}

function timeText(e: PlanningEntry) {
  const a = e.agenda
  if (!a?.startTime) return 'Hele dag'
  return a.endTime ? `${a.startTime}–${a.endTime}` : a.startTime
}

function AfspraakCard({ entry: e, selected, onOpen }: { entry: PlanningEntry; selected: boolean; onOpen: (e: PlanningEntry) => void }) {
  const [copied, setCopied] = useState(false)
  const a = e.agenda
  return (
    <div className={cn('rounded-lg border bg-[#FBF7EF] text-left transition-colors', selected ? 'border-[#1C1B19]' : 'border-[#E6D6B5] hover:border-[#C9A96E]')}>
      <button type="button" onClick={() => onOpen(e)} className="w-full text-left px-2 pt-1.5 pb-1">
        <span className="flex items-center gap-1 text-[11px] text-[#8A6A2E]">
          {timeText(e)}
          {e.priority && <span className="font-bold text-red-600">!</span>}
          {a?.inGoogle && !a.googleError && <span title="Staat in Google Agenda"><CalendarDays size={11} className="text-[#8A6A2E]" /></span>}
          {a?.googleError && <span title={`Google Agenda: ${a.googleError}`}><TriangleAlert size={11} className="text-red-600" /></span>}
        </span>
        <span className="block text-[13px] font-semibold text-[#1C1B19] leading-snug">{e.label}</span>
        <span className="block text-xs text-[#6B6560] leading-snug">{e.project?.customerName}</span>
        {e.assignee && <span className="block text-[11px] text-[#8A6A2E] mt-0.5">{e.assignee}</span>}
      </button>
      {a?.meetLink && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(a.meetLink!).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
          className="flex items-center gap-1 w-full px-2 py-1 border-t border-[#EFE4CF] text-[11px] text-[#1C1B19] hover:bg-[#F6EFE2] rounded-b-lg"
          title={a.meetLink}
        >
          {copied ? <Check size={12} className="text-green-700" /> : <Video size={12} className="text-[#8A6A2E]" />}
          {copied ? 'Gekopieerd' : 'Meet-link kopiëren'}
          {!copied && <Copy size={11} className="ml-auto text-[#9A948D]" />}
        </button>
      )}
    </div>
  )
}

function ChipRow({
  title,
  tone,
  entries,
  onOpen,
  showDate,
}: {
  title: string
  tone: string
  entries: PlanningEntry[]
  onOpen: (e: PlanningEntry) => void
  showDate?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn('text-xs font-semibold uppercase tracking-wider mr-1', tone)}>{title}</span>
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => onOpen(e)}
          className="h-7 px-2.5 text-xs bg-white border border-[#E6D6B5] rounded-full hover:border-[#C9A96E]"
        >
          {showDate && e.date && <span className="text-red-600 mr-1">{format(new Date(`${e.date}T00:00:00`), 'd MMM', { locale: nl })}</span>}
          {e.label} · {e.project?.customerName}
        </button>
      ))}
    </div>
  )
}
