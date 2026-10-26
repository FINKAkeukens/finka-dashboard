'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Play, Square, Timer, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  customerName,
  entrySeconds,
  fetchRunningTimers,
  fetchTimerPeople,
  formatClock,
  formatDuration,
  NO_PERSON,
  projectLabel,
  projectSubLabel,
  RunningTimer,
  startTimer,
  stopTimer,
  TimeEntry,
  TIMER_PROJECT_SELECT,
  TimerProject,
} from '@/lib/time-tracking'

// Tijdregistratie per project: één timer per persoon (Merel, Kieke, ...),
// zodat twee mensen tegelijk aan hetzelfde project kunnen schrijven terwijl
// ze op dezelfde login werken. Altijd bereikbaar (zijbalk op de computer,
// pilletjes boven de onderbalk op de telefoon) en per project een totaal op
// de projectpagina. De provider zit in de dashboard-layout, dus de timers
// lopen gewoon door bij het wisselen van scherm. Zie src/lib/time-tracking.ts
// en migratie 88 + 89.

interface TimerState {
  people: string[]
  timers: RunningTimer[]
  loaded: boolean
  busy: boolean
  error: string
  // Telt op na elke start/stop, zodat het tijdblok op de projectpagina
  // weet dat het zijn sessies opnieuw moet ophalen.
  version: number
  // Laatst gekozen persoon op dit apparaat: voorkeuze bij "Timer starten".
  lastPerson: string | null
  timerOf: (person: string) => RunningTimer | null
  start: (person: string, projectId: string) => Promise<void>
  stop: (person: string) => Promise<void>
}

const TimerContext = createContext<TimerState | null>(null)

const LAST_PERSON_KEY = 'finka-timer-person'

function readLastPerson() {
  try {
    return localStorage.getItem(LAST_PERSON_KEY)
  } catch {
    return null
  }
}

function writeLastPerson(person: string) {
  try {
    localStorage.setItem(LAST_PERSON_KEY, person)
  } catch {
    // Geen opslag (privévenster): dan is er gewoon geen voorkeuze.
  }
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(createClient)
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null)
  const [people, setPeople] = useState<string[]>([])
  const [timers, setTimers] = useState<RunningTimer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [lastPerson, setLastPerson] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setTimers(await fetchRunningTimers(supabase))
    setLoaded(true)
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setLastPerson(readLastPerson())
      setUser({ id: data.user.id, email: data.user.email ?? null })
      fetchTimerPeople(supabase).then(setPeople)
      refresh()
    })
  }, [supabase, refresh])

  // Gestart of gestopt op een ander apparaat of tabblad: bijwerken zodra
  // dit venster weer in beeld komt.
  useEffect(() => {
    if (!user) return
    const sync = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [user, refresh])

  const timerOf = useCallback((person: string) => timers.find((t) => t.person === person) ?? null, [timers])

  const start = useCallback(
    async (person: string, projectId: string) => {
      const running = timerOf(person)
      if (!user || busy || running?.project_id === projectId) return
      setBusy(true)
      setError('')
      writeLastPerson(person)
      setLastPerson(person)
      const err = await startTimer(supabase, user, person, projectId, running)
      if (err) setError('Timer starten mislukt')
      await refresh()
      setVersion((v) => v + 1)
      setBusy(false)
    },
    [supabase, user, busy, timerOf, refresh]
  )

  const stop = useCallback(
    async (person: string) => {
      const running = timerOf(person)
      if (!user || busy || !running) return
      setBusy(true)
      setError('')
      const err = await stopTimer(supabase, running)
      if (err) setError('Timer stoppen mislukt')
      await refresh()
      setVersion((v) => v + 1)
      setBusy(false)
    },
    [supabase, user, busy, timerOf, refresh]
  )

  const value = useMemo(
    () => ({ people, timers, loaded, busy, error, version, lastPerson, timerOf, start, stop }),
    [people, timers, loaded, busy, error, version, lastPerson, timerOf, start, stop]
  )
  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
}

function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimer buiten TimerProvider')
  return ctx
}

// Huidige tijd, elke seconde bijgewerkt zolang `active`.
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function RunningDot() {
  return <span className="size-1.5 shrink-0 rounded-full bg-[#5E8A62] animate-pulse" aria-hidden="true" />
}

// Naamknopjes: wie gaat er werken. Lopend = groen bolletje.
function PersonChips({
  people,
  selected,
  onSelect,
  isRunning,
}: {
  people: string[]
  selected: string | null
  onSelect: (person: string) => void
  isRunning: (person: string) => boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Persoon">
      {people.map((person) => (
        <button
          key={person}
          role="radio"
          aria-checked={person === selected}
          onClick={() => onSelect(person)}
          className={cn(
            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
            person === selected
              ? 'border-[#1C1B19] bg-[#1C1B19] text-white'
              : 'border-[#DDD8D2] bg-white text-[#1C1B19] hover:bg-[#F7F5F2]'
          )}
        >
          {isRunning(person) && <RunningDot />}
          {person}
        </button>
      ))}
    </div>
  )
}

// Wat er gekozen wordt in de projectlijst: een vaste persoon ("Wissel" bij
// een lopende timer) of eerst nog een persoon kiezen ("Timer starten").
type Picking = { person: string | null; fixed: boolean } | null

// Lijst om een project te kiezen, met zoekveld en (bij een nieuwe timer)
// bovenaan de naam van wie er gaat werken. Sluit bij een klik ernaast of
// Escape.
function ProjectPicker({
  picking,
  onPick,
  onClose,
  className,
}: {
  picking: NonNullable<Picking>
  onPick: (person: string, projectId: string) => void
  onClose: () => void
  className?: string
}) {
  const { people, timerOf } = useTimer()
  const [supabase] = useState(createClient)
  const [projects, setProjects] = useState<TimerProject[] | null>(null)
  const [query, setQuery] = useState('')
  const [person, setPerson] = useState<string | null>(picking.person)
  const ref = useRef<HTMLDivElement>(null)
  const currentId = person ? timerOf(person)?.project_id ?? null : null

  useEffect(() => {
    let cancelled = false
    supabase
      .from('finka_projects')
      .select(TIMER_PROJECT_SELECT)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setProjects((data ?? []) as unknown as TimerProject[])
      })
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [onClose])

  const q = query.trim().toLowerCase()
  const visible = (projects ?? []).filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      (p.reference_number ?? '').toLowerCase().includes(q) ||
      customerName(p).toLowerCase().includes(q)
  )
  const pick = (projectId: string) => {
    if (person) onPick(person, projectId)
  }

  return (
    <div
      ref={ref}
      className={cn('z-50 bg-white rounded-xl border border-[#DDD8D2] shadow-xl flex flex-col max-h-96', className)}
    >
      <div className="p-2 border-b border-[#DDD8D2] space-y-2">
        {picking.fixed ? (
          <p className="px-1 text-xs text-[#6B6560]">Ander project voor {person}</p>
        ) : (
          <PersonChips people={people} selected={person} onSelect={setPerson} isRunning={(p) => !!timerOf(p)} />
        )}
        <label htmlFor="timer-project-search" className="sr-only">
          Project zoeken
        </label>
        <input
          id="timer-project-search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && visible[0]) pick(visible[0].id)
          }}
          placeholder="Zoek project of klant"
          className="w-full rounded-lg border border-[#DDD8D2] px-3 py-2 text-sm outline-none focus:border-[#1C1B19]"
        />
      </div>
      <div className="overflow-y-auto py-1">
        {!person ? (
          <p className="px-3 py-2 text-xs text-[#9A948D]">Kies eerst een persoon</p>
        ) : projects === null ? (
          <p className="px-3 py-2 text-xs text-[#9A948D]">Laden…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[#9A948D]">Geen projecten gevonden</p>
        ) : (
          visible.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              className={cn(
                'w-full text-left px-3 py-2 hover:bg-[#F7F5F2]',
                p.id === currentId && 'bg-[#F7F5F2]'
              )}
            >
              <span className="flex items-center gap-2 text-sm text-[#1C1B19]">
                {p.id === currentId && <RunningDot />}
                <span className="truncate">{projectLabel(p)}</span>
              </span>
              <span className="block text-[11px] text-[#9A948D] truncate">{projectSubLabel(p)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// Voorkeuze bij "Timer starten": wie op dit apparaat het laatst een timer
// startte, tenzij die al loopt; anders de eerste die nog niets heeft lopen.
function useDefaultPerson() {
  const { people, lastPerson, timerOf } = useTimer()
  const idle = people.filter((p) => !timerOf(p))
  if (lastPerson && idle.includes(lastPerson)) return lastPerson
  return idle[0] ?? people[0] ?? null
}

// Zijbalk (computer): onderaan, boven Uitloggen. Eén blokje per lopende
// timer, met de naam erboven.
export function SidebarTimer() {
  const { people, timers, loaded, busy, error, start, stop } = useTimer()
  const [picking, setPicking] = useState<Picking>(null)
  const now = useNow(timers.length > 0)
  const close = useCallback(() => setPicking(null), [])
  const defaultPerson = useDefaultPerson()

  if (!loaded) return null

  return (
    <div className="relative mb-1 space-y-1">
      {timers.map((t) => (
        <div key={t.id} className="rounded-lg border border-[#DDD8D2] bg-[#F7F5F2] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-[#1C1B19]">
              <RunningDot />
              {formatClock(entrySeconds(t, now))}
              <span className="font-normal text-xs text-[#6B6560] truncate">{t.person}</span>
            </span>
            <button
              onClick={() => t.person && stop(t.person)}
              disabled={busy}
              title={`Timer van ${t.person} stoppen`}
              aria-label={`Timer van ${t.person} stoppen`}
              className="p-1.5 -mr-1.5 rounded-md text-[#6B6560] hover:text-[#1C1B19] hover:bg-white disabled:opacity-50"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </div>
          {t.project && (
            <Link
              href={`/projecten/${t.project.id}`}
              className="block mt-0.5 text-xs text-[#1C1B19] truncate hover:underline"
            >
              {projectLabel(t.project)}
            </Link>
          )}
          <div className="flex items-center justify-between gap-2 text-[11px] text-[#9A948D]">
            <span className="truncate">{projectSubLabel(t.project)}</span>
            <button
              onClick={() => setPicking({ person: t.person, fixed: true })}
              disabled={busy}
              className="shrink-0 hover:text-[#1C1B19]"
            >
              Wissel
            </button>
          </div>
        </div>
      ))}
      {timers.length < people.length && (
        <button
          onClick={() => setPicking({ person: defaultPerson, fixed: false })}
          disabled={busy}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#6B6560] hover:bg-[#F7F5F2] hover:text-[#1C1B19] transition-colors w-full"
        >
          <Timer size={15} />
          Timer starten
        </button>
      )}
      {error && <p className="px-3 pt-1 text-xs text-red-600">{error}</p>}
      {picking && (
        <ProjectPicker
          picking={picking}
          onClose={close}
          onPick={(person, id) => {
            setPicking(null)
            start(person, id)
          }}
          className="absolute bottom-full left-0 mb-2 w-72"
        />
      )}
    </div>
  )
}

// Telefoon: kleine pilletjes linksboven de onderbalk, één per lopende timer,
// met de beginletter van de persoon.
export function MobileTimer() {
  const { people, timers, loaded, busy, start, stop } = useTimer()
  const [picking, setPicking] = useState<Picking>(null)
  const now = useNow(timers.length > 0)
  const close = useCallback(() => setPicking(null), [])
  const defaultPerson = useDefaultPerson()

  if (!loaded) return null

  const pill = 'flex items-center rounded-full border border-[#DDD8D2] bg-white shadow-md'
  return (
    <>
      <div className="fixed left-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-start gap-1.5">
        {timers.map((t) => (
          <div key={t.id} className={pill}>
            <button
              onClick={() => setPicking({ person: t.person, fixed: true })}
              disabled={busy}
              className="flex items-center gap-2 pl-3.5 pr-2 py-2 text-xs text-[#1C1B19]"
            >
              <RunningDot />
              <span className="font-medium">{t.person?.charAt(0)}</span>
              <span className="font-medium tabular-nums">{formatClock(entrySeconds(t, now))}</span>
              <span className="max-w-[35vw] truncate text-[#6B6560]">{projectLabel(t.project)}</span>
            </button>
            <button
              onClick={() => t.person && stop(t.person)}
              disabled={busy}
              aria-label={`Timer van ${t.person} stoppen`}
              className="p-2.5 pr-3 text-[#6B6560] disabled:opacity-50"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </div>
        ))}
        {timers.length < people.length && (
          <div className={pill}>
            <button
              onClick={() => setPicking({ person: defaultPerson, fixed: false })}
              disabled={busy}
              aria-label="Timer starten"
              className="p-2.5 text-[#6B6560]"
            >
              <Timer size={18} />
            </button>
          </div>
        )}
      </div>
      {picking && (
        <ProjectPicker
          picking={picking}
          onClose={close}
          onPick={(person, id) => {
            setPicking(null)
            start(person, id)
          }}
          className="fixed inset-x-3 bottom-[calc(8rem+env(safe-area-inset-bottom))]"
        />
      )}
    </>
  )
}

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// <input type="datetime-local"> werkt met lokale tijd zonder tijdzone.
function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Achteraf persoon en begin- en eindtijd van een afgeronde sessie aanpassen,
// bv. inkorten als de timer te lang is blijven lopen.
function SessionEditor({
  entry,
  people,
  onSave,
  onCancel,
}: {
  entry: TimeEntry
  people: string[]
  onSave: (person: string | null, startedAt: string, endedAt: string) => Promise<string | null>
  onCancel: () => void
}) {
  const [person, setPerson] = useState(entry.person ?? '')
  const [startValue, setStartValue] = useState(toLocalInput(entry.started_at))
  const [endValue, setEndValue] = useState(toLocalInput(entry.ended_at ?? entry.started_at))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError('Ongeldige tijd')
      return
    }
    if (endDate <= startDate) {
      setError('Eindtijd moet na begintijd liggen')
      return
    }
    if (endDate.getTime() > Date.now()) {
      setError('Eindtijd ligt in de toekomst')
      return
    }
    setSaving(true)
    const err = await onSave(person || null, startDate.toISOString(), endDate.toISOString())
    setSaving(false)
    if (err) setError(err)
  }

  const inputClass = 'w-full rounded-md border border-[#DDD8D2] px-2 py-1 text-sm outline-none focus:border-[#1C1B19]'
  return (
    <div className="px-4 py-3 space-y-2 bg-[#F7F5F2]">
      <label className="block text-xs text-[#6B6560]">
        Persoon
        <select value={person} onChange={(e) => setPerson(e.target.value)} className={cn(inputClass, 'bg-white')}>
          <option value="">{NO_PERSON}</option>
          {/* Een naam die niet meer in de lijst staat blijft kiesbaar. */}
          {[...people, ...(entry.person && !people.includes(entry.person) ? [entry.person] : [])].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs text-[#6B6560]">
          Begin
          <input type="datetime-local" value={startValue} onChange={(e) => setStartValue(e.target.value)} className={inputClass} />
        </label>
        <label className="text-xs text-[#6B6560]">
          Einde
          <input type="datetime-local" value={endValue} onChange={(e) => setEndValue(e.target.value)} className={inputClass} />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md text-[#6B6560] hover:text-[#1C1B19]">
          Annuleren
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md bg-[#1C1B19] text-white hover:bg-[#2D2C2A] disabled:opacity-50"
        >
          Opslaan
        </button>
      </div>
    </div>
  )
}

// Projectpagina: totaal besteed (en per persoon), per naam een knop om de
// eigen timer voor dit project aan of uit te zetten, en de losse sessies.
export function ProjectTimeSummary({ projectId }: { projectId: string }) {
  const { people, busy, version, timerOf, start, stop } = useTimer()
  const [supabase] = useState(createClient)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('finka_time_entries')
      .select('*')
      .eq('project_id', projectId)
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setEntries((data ?? []) as TimeEntry[])
      })
    return () => {
      cancelled = true
    }
  }, [supabase, projectId, version, reload])

  const now = useNow(entries.some((e) => !e.ended_at))
  const total = entries.reduce((sum, e) => sum + entrySeconds(e, now), 0)
  const perPerson = new Map<string, number>()
  for (const e of entries) {
    if (e.person) perPerson.set(e.person, (perPerson.get(e.person) ?? 0) + entrySeconds(e, now))
  }

  async function remove(entry: TimeEntry) {
    if (!confirm(`Sessie van ${formatDuration(entrySeconds(entry))} verwijderen?`)) return
    await supabase.from('finka_time_entries').delete().eq('id', entry.id)
    setReload((r) => r + 1)
  }

  async function saveSession(entry: TimeEntry, person: string | null, startedAt: string, endedAt: string) {
    const { error } = await supabase
      .from('finka_time_entries')
      .update({ person, started_at: startedAt, ended_at: endedAt })
      .eq('id', entry.id)
    if (error) return 'Opslaan mislukt'
    setEditingId(null)
    setReload((r) => r + 1)
    return null
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#6B6560]">
        <span className="flex items-center gap-1.5">
          <Timer size={14} />
          Bestede tijd: <span className="font-medium text-[#1C1B19] tabular-nums">{formatDuration(total)}</span>
        </span>
        {perPerson.size > 1 && (
          <span className="text-xs text-[#9A948D] tabular-nums">
            {[...perPerson].map(([p, sec]) => `${p} ${formatDuration(sec)}`).join(' · ')}
          </span>
        )}
        {people.map((person) => {
          const t = timerOf(person)
          const here = t?.project_id === projectId
          return here && t ? (
            <button
              key={person}
              onClick={() => stop(person)}
              disabled={busy}
              title={`Timer van ${person} stoppen`}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#1C1B19] bg-white text-[#1C1B19] hover:bg-[#F7F5F2] disabled:opacity-50"
            >
              <RunningDot />
              {person}
              <span className="tabular-nums">{formatClock(entrySeconds(t, now))}</span>
              <Square size={10} fill="currentColor" className="ml-0.5" />
            </button>
          ) : (
            <button
              key={person}
              onClick={() => start(person, projectId)}
              disabled={busy}
              title={
                t ? `Timer van ${person} starten (stopt ${projectLabel(t.project)})` : `Timer van ${person} starten`
              }
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#DDD8D2] bg-white text-[#1C1B19] hover:bg-[#F7F5F2] disabled:opacity-50"
            >
              <Play size={10} fill="currentColor" />
              {person}
            </button>
          )
        })}
        {entries.length > 0 && (
          <button onClick={() => setOpen(!open)} className="text-xs hover:text-[#1C1B19] hover:underline">
            {open ? 'Sessies verbergen' : `${entries.length} ${entries.length === 1 ? 'sessie' : 'sessies'}`}
          </button>
        )}
      </div>

      {open && entries.length > 0 && (
        <div className="mt-2 max-w-md bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#EEEAE5] max-h-72 overflow-y-auto">
          {entries.map((e) =>
            editingId === e.id ? (
              <SessionEditor
                key={e.id}
                entry={e}
                people={people}
                onSave={(person, startedAt, endedAt) => saveSession(e, person, startedAt, endedAt)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-24 shrink-0 text-[#1C1B19]">{formatSessionDate(e.started_at)}</span>
                <span className="flex-1 min-w-0 truncate text-[#6B6560] tabular-nums">
                  {formatTime(e.started_at)}–{e.ended_at ? formatTime(e.ended_at) : 'nu'}
                  <span className="ml-2 text-xs text-[#9A948D]">{e.person ?? NO_PERSON}</span>
                </span>
                <span className="tabular-nums text-[#1C1B19]">{formatDuration(entrySeconds(e, now))}</span>
                {e.ended_at ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(e.id)}
                      aria-label="Sessie bewerken"
                      title="Tijden aanpassen"
                      className="text-[#9A948D] hover:text-[#1C1B19]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remove(e)}
                      aria-label="Sessie verwijderen"
                      title="Verwijderen"
                      className="text-[#9A948D] hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                ) : (
                  <span className="w-[34px]" />
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
