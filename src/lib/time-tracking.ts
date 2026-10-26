import type { SupabaseClient } from '@supabase/supabase-js'

// Tijdregistratie per project (migratie 88 + 89). Eén timer per persoon
// (Merel, Kieke, ...): de rij met ended_at NULL is de lopende timer van die
// persoon. Iedereen werkt op dezelfde login, dus de persoon is een naam en
// niet de ingelogde gebruiker. Wisselen van project = die rij afsluiten en
// een nieuwe beginnen.

export interface TimeEntry {
  id: string
  project_id: string
  user_id: string
  user_email: string | null
  person: string | null
  started_at: string
  ended_at: string | null
  created_at: string
}

export interface TimerProject {
  id: string
  title: string
  reference_number: string | null
  customer: { first_name: string | null; last_name: string | null } | null
}

export interface RunningTimer extends TimeEntry {
  project: TimerProject | null
}

// Sessies korter dan dit (per ongeluk gestart, meteen gewisseld) worden bij
// het stoppen weggegooid in plaats van als 0 minuten bewaard.
const MIN_SECONDS = 60

export const TIMER_PROJECT_SELECT =
  'id, title, reference_number, customer:finka_customers(first_name, last_name)'

export function entrySeconds(entry: Pick<TimeEntry, 'started_at' | 'ended_at'>, now = Date.now()) {
  const end = entry.ended_at ? new Date(entry.ended_at).getTime() : now
  return Math.max(0, Math.floor((end - new Date(entry.started_at).getTime()) / 1000))
}

// Lopende klok: 4:05 of 1:04:05.
export function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Totalen: 6u 40m, 40m.
export function formatDuration(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}u` : `${h}u ${m}m`
}

export function customerName(project: TimerProject | null) {
  const c = project?.customer
  if (!c) return ''
  return [c.first_name, c.last_name].filter(Boolean).join(' ')
}

// Veel projecten heten naar de plaats ("Amsterdam"), dus de klantnaam is
// het herkenbare deel; de projecttitel komt erachter.
export function projectLabel(project: TimerProject | null) {
  if (!project) return ''
  return customerName(project) || project.title
}

export function projectSubLabel(project: TimerProject | null) {
  if (!project) return ''
  const parts = [project.reference_number, customerName(project) ? project.title : null].filter(Boolean)
  return parts.join(' · ')
}

// Wie een timer kan aanzetten: de personen uit de "Wacht op"-lijst
// (finka_assignees), behalve de klant.
export async function fetchTimerPeople(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('finka_assignees')
    .select('name')
    .eq('kind', 'persoon')
    .eq('hidden', false)
    .neq('name', 'Klant')
    .order('sort_order')
  return (data ?? []).map((a) => a.name as string)
}

// Alle lopende timers met een persoon (hooguit één per persoon).
export async function fetchRunningTimers(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('finka_time_entries')
    .select(`*, project:finka_projects(${TIMER_PROJECT_SELECT})`)
    .is('ended_at', null)
    .not('person', 'is', null)
    .order('started_at')
  return (data ?? []) as RunningTimer[]
}

export async function stopTimer(supabase: SupabaseClient, running: Pick<TimeEntry, 'id' | 'started_at'>) {
  const now = new Date()
  const seconds = entrySeconds({ started_at: running.started_at, ended_at: null }, now.getTime())
  const { error } =
    seconds < MIN_SECONDS
      ? await supabase.from('finka_time_entries').delete().eq('id', running.id)
      : await supabase.from('finka_time_entries').update({ ended_at: now.toISOString() }).eq('id', running.id)
  return error
}

// Stopt een eventueel lopende timer van deze persoon en start er een voor
// projectId. Start- en eindtijd komen allebei van de klok van het apparaat,
// zodat een sessie nooit negatief kan uitvallen door verschil met de server.
export async function startTimer(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  person: string,
  projectId: string,
  running: Pick<TimeEntry, 'id' | 'started_at'> | null
) {
  if (running) {
    const stopError = await stopTimer(supabase, running)
    if (stopError) return stopError
  }
  const { error } = await supabase.from('finka_time_entries').insert({
    project_id: projectId,
    user_id: user.id,
    user_email: user.email ?? null,
    person,
    started_at: new Date().toISOString(),
  })
  return error
}

// ---------------------------------------------------------------------------
// Overzicht (/tijd en de kolom Tijd in de projectenlijst).

export type TimePeriod = 'week' | 'maand' | 'jaar' | 'alles'

export const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: 'week', label: 'Deze week' },
  { key: 'maand', label: 'Deze maand' },
  { key: 'jaar', label: 'Dit jaar' },
  { key: 'alles', label: 'Alles' },
]

export function parseTimePeriod(value: string | undefined): TimePeriod {
  return TIME_PERIODS.some((p) => p.key === value) ? (value as TimePeriod) : 'maand'
}

// Middernacht Nederlandse tijd op datum `ymd` (YYYY-MM-DD), als tijdstip. De
// server draait in UTC; zonder dit zou een week om 01:00/02:00 beginnen.
function amsterdamMidnight(ymd: string) {
  const utc = new Date(`${ymd}T00:00:00Z`)
  const asLocal = new Date(utc.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const asUtc = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(utc.getTime() - (asLocal.getTime() - asUtc.getTime()))
}

// Begin van de periode (week vanaf maandag); null = alles.
export function periodStart(period: TimePeriod, now = new Date()): Date | null {
  if (period === 'alles') return null
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
  const [y, m, d] = today.split('-').map(Number)
  if (period === 'jaar') return amsterdamMidnight(`${y}-01-01`)
  if (period === 'maand') return amsterdamMidnight(`${y}-${String(m).padStart(2, '0')}-01`)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return amsterdamMidnight(date.toISOString().slice(0, 10))
}

// Seconden van een sessie binnen de periode: een sessie die vóór het begin
// startte telt alleen vanaf het begin mee.
export function entrySecondsSince(
  entry: Pick<TimeEntry, 'started_at' | 'ended_at'>,
  since: Date | null,
  now = Date.now()
) {
  if (!since || new Date(entry.started_at) >= since) return entrySeconds(entry, now)
  return entrySeconds({ started_at: since.toISOString(), ended_at: entry.ended_at }, now)
}

// Naam voor sessies zonder persoon (van vóór migratie 89).
export const NO_PERSON = 'Geen persoon'

export type TimeEntryWithProject = TimeEntry & { project: TimerProject | null }

export interface ProjectTimeTotal {
  project: TimerProject
  seconds: number
  perPerson: Map<string, number>
}

function addTo(map: Map<string, number>, key: string, seconds: number) {
  map.set(key, (map.get(key) ?? 0) + seconds)
}

// Totaal, per persoon en per project (meeste tijd eerst) binnen de periode.
export function summarizeTime(entries: TimeEntryWithProject[], since: Date | null, now = Date.now()) {
  let total = 0
  const perPerson = new Map<string, number>()
  const perProject = new Map<string, ProjectTimeTotal>()
  for (const e of entries) {
    const seconds = entrySecondsSince(e, since, now)
    if (seconds === 0 || !e.project) continue
    const person = e.person ?? NO_PERSON
    total += seconds
    addTo(perPerson, person, seconds)
    const row = perProject.get(e.project_id) ?? { project: e.project, seconds: 0, perPerson: new Map() }
    row.seconds += seconds
    addTo(row.perPerson, person, seconds)
    perProject.set(e.project_id, row)
  }
  const projects = [...perProject.values()].sort((a, b) => b.seconds - a.seconds)
  return { total, perPerson, projects }
}
