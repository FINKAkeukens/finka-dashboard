'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Play, Square, Timer, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  customerName,
  entrySeconds,
  fetchRunningTimer,
  formatClock,
  formatDuration,
  projectLabel,
  projectSubLabel,
  RunningTimer,
  startTimer,
  stopTimer,
  TimeEntry,
  TIMER_PROJECT_SELECT,
  TimerProject,
} from '@/lib/time-tracking'

// Tijdregistratie per project: één timer per gebruiker, altijd bereikbaar
// (zijbalk op de computer, pilletje boven de onderbalk op de telefoon) en
// per project een totaal op de projectpagina. De provider zit in de
// dashboard-layout, dus de timer loopt gewoon door bij het wisselen van
// scherm. Zie src/lib/time-tracking.ts en migratie 88.

interface TimerState {
  running: RunningTimer | null
  loaded: boolean
  busy: boolean
  error: string
  // Telt op na elke start/stop, zodat het tijdblok op de projectpagina
  // weet dat het zijn sessies opnieuw moet ophalen.
  version: number
  start: (projectId: string) => Promise<void>
  stop: () => Promise<void>
}

const TimerContext = createContext<TimerState | null>(null)

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(createClient)
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null)
  const [running, setRunning] = useState<RunningTimer | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const refresh = useCallback(
    async (userId: string) => {
      setRunning(await fetchRunningTimer(supabase, userId))
      setLoaded(true)
    },
    [supabase]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setUser({ id: data.user.id, email: data.user.email ?? null })
      refresh(data.user.id)
    })
  }, [supabase, refresh])

  // Gestart of gestopt op een ander apparaat of tabblad: bijwerken zodra
  // dit venster weer in beeld komt.
  useEffect(() => {
    if (!user) return
    const sync = () => {
      if (document.visibilityState === 'visible') refresh(user.id)
    }
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [user, refresh])

  const start = useCallback(
    async (projectId: string) => {
      if (!user || busy || running?.project_id === projectId) return
      setBusy(true)
      setError('')
      const err = await startTimer(supabase, user, projectId, running)
      if (err) setError('Timer starten mislukt')
      await refresh(user.id)
      setVersion((v) => v + 1)
      setBusy(false)
    },
    [supabase, user, busy, running, refresh]
  )

  const stop = useCallback(async () => {
    if (!user || busy || !running) return
    setBusy(true)
    setError('')
    const err = await stopTimer(supabase, running)
    if (err) setError('Timer stoppen mislukt')
    await refresh(user.id)
    setVersion((v) => v + 1)
    setBusy(false)
  }, [supabase, user, busy, running, refresh])

  const value = useMemo(
    () => ({ running, loaded, busy, error, version, start, stop }),
    [running, loaded, busy, error, version, start, stop]
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

// Lijst om een project te kiezen, met zoekveld. Sluit bij een klik ernaast
// of Escape.
function ProjectPicker({
  currentId,
  onPick,
  onClose,
  className,
}: {
  currentId: string | null
  onPick: (projectId: string) => void
  onClose: () => void
  className?: string
}) {
  const [supabase] = useState(createClient)
  const [projects, setProjects] = useState<TimerProject[] | null>(null)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={ref}
      className={cn('z-50 bg-white rounded-xl border border-[#DDD8D2] shadow-xl flex flex-col max-h-80', className)}
    >
      <div className="p-2 border-b border-[#DDD8D2]">
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
            if (e.key === 'Enter' && visible[0]) onPick(visible[0].id)
          }}
          placeholder="Zoek project of klant"
          className="w-full rounded-lg border border-[#DDD8D2] px-3 py-2 text-sm outline-none focus:border-[#1C1B19]"
        />
      </div>
      <div className="overflow-y-auto py-1">
        {projects === null ? (
          <p className="px-3 py-2 text-xs text-[#9A948D]">Laden…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[#9A948D]">Geen projecten gevonden</p>
        ) : (
          visible.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
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

// Zijbalk (computer): onderaan, boven Uitloggen.
export function SidebarTimer() {
  const { running, loaded, busy, error, start, stop } = useTimer()
  const [picking, setPicking] = useState(false)
  const now = useNow(!!running)
  const close = useCallback(() => setPicking(false), [])

  if (!loaded) return null

  return (
    <div className="relative mb-1">
      {running ? (
        <div className="rounded-lg border border-[#DDD8D2] bg-[#F7F5F2] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium tabular-nums text-[#1C1B19]">
              <RunningDot />
              {formatClock(entrySeconds(running, now))}
            </span>
            <button
              onClick={stop}
              disabled={busy}
              title="Timer stoppen"
              aria-label="Timer stoppen"
              className="p-1.5 -mr-1.5 rounded-md text-[#6B6560] hover:text-[#1C1B19] hover:bg-white disabled:opacity-50"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </div>
          {running.project && (
            <Link
              href={`/projecten/${running.project.id}`}
              className="block mt-0.5 text-xs text-[#1C1B19] truncate hover:underline"
            >
              {projectLabel(running.project)}
            </Link>
          )}
          <div className="flex items-center justify-between gap-2 text-[11px] text-[#9A948D]">
            <span className="truncate">{projectSubLabel(running.project)}</span>
            <button onClick={() => setPicking(true)} disabled={busy} className="shrink-0 hover:text-[#1C1B19]">
              Wissel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
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
          currentId={running?.project_id ?? null}
          onClose={close}
          onPick={(id) => {
            setPicking(false)
            start(id)
          }}
          className="absolute bottom-full left-0 mb-2 w-72"
        />
      )}
    </div>
  )
}

// Telefoon: klein pilletje linksboven de onderbalk.
export function MobileTimer() {
  const { running, loaded, busy, start, stop } = useTimer()
  const [picking, setPicking] = useState(false)
  const now = useNow(!!running)
  const close = useCallback(() => setPicking(false), [])

  if (!loaded) return null

  return (
    <>
      <div className="fixed left-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex items-center rounded-full border border-[#DDD8D2] bg-white shadow-md">
        {running ? (
          <>
            <button
              onClick={() => setPicking(true)}
              disabled={busy}
              className="flex items-center gap-2 pl-3.5 pr-2 py-2 text-xs text-[#1C1B19]"
            >
              <RunningDot />
              <span className="font-medium tabular-nums">{formatClock(entrySeconds(running, now))}</span>
              <span className="max-w-[40vw] truncate text-[#6B6560]">{projectLabel(running.project)}</span>
            </button>
            <button
              onClick={stop}
              disabled={busy}
              aria-label="Timer stoppen"
              className="p-2.5 pr-3 text-[#6B6560] disabled:opacity-50"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setPicking(true)}
            disabled={busy}
            aria-label="Timer starten"
            className="p-2.5 text-[#6B6560]"
          >
            <Timer size={18} />
          </button>
        )}
      </div>
      {picking && (
        <ProjectPicker
          currentId={running?.project_id ?? null}
          onClose={close}
          onPick={(id) => {
            setPicking(false)
            start(id)
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

// Achteraf begin- en eindtijd van een afgeronde sessie aanpassen, bv.
// inkorten als de timer te lang is blijven lopen.
function SessionEditor({
  entry,
  onSave,
  onCancel,
}: {
  entry: TimeEntry
  onSave: (startedAt: string, endedAt: string) => Promise<string | null>
  onCancel: () => void
}) {
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
    const err = await onSave(startDate.toISOString(), endDate.toISOString())
    setSaving(false)
    if (err) setError(err)
  }

  const inputClass = 'w-full rounded-md border border-[#DDD8D2] px-2 py-1 text-sm outline-none focus:border-[#1C1B19]'
  return (
    <div className="px-4 py-3 space-y-2 bg-[#F7F5F2]">
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

// Projectpagina: totaal besteed, starten/stoppen voor dit project en de
// losse sessies.
export function ProjectTimeSummary({ projectId }: { projectId: string }) {
  const { running, busy, version, start, stop } = useTimer()
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
  const runningHere = running?.project_id === projectId

  async function remove(entry: TimeEntry) {
    if (!confirm(`Sessie van ${formatDuration(entrySeconds(entry))} verwijderen?`)) return
    await supabase.from('finka_time_entries').delete().eq('id', entry.id)
    setReload((r) => r + 1)
  }

  async function saveTimes(entry: TimeEntry, startedAt: string, endedAt: string) {
    const { error } = await supabase
      .from('finka_time_entries')
      .update({ started_at: startedAt, ended_at: endedAt })
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
        {running && runningHere ? (
          <button
            onClick={stop}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#DDD8D2] bg-white text-[#1C1B19] hover:bg-[#F7F5F2] disabled:opacity-50"
          >
            <RunningDot />
            {formatClock(entrySeconds(running, now))}
            <Square size={10} fill="currentColor" className="ml-0.5" />
            Stoppen
          </button>
        ) : (
          <button
            onClick={() => start(projectId)}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#DDD8D2] bg-white text-[#1C1B19] hover:bg-[#F7F5F2] disabled:opacity-50"
          >
            <Play size={10} fill="currentColor" />
            Timer starten
          </button>
        )}
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
                onSave={(startedAt, endedAt) => saveTimes(e, startedAt, endedAt)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-24 shrink-0 text-[#1C1B19]">{formatSessionDate(e.started_at)}</span>
                <span className="flex-1 min-w-0 truncate text-[#6B6560] tabular-nums">
                  {formatTime(e.started_at)}–{e.ended_at ? formatTime(e.ended_at) : 'nu'}
                  {e.user_email && (
                    <span className="ml-2 text-xs text-[#9A948D]">{e.user_email.split('@')[0]}</span>
                  )}
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
