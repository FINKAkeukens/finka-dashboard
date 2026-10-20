import type { SupabaseClient } from '@supabase/supabase-js'

// Tijdregistratie per project (migratie 88). Eén timer per gebruiker: de rij
// met ended_at NULL is de lopende timer. Wisselen van project = die rij
// afsluiten en een nieuwe beginnen.

export interface TimeEntry {
  id: string
  project_id: string
  user_id: string
  user_email: string | null
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

export async function fetchRunningTimer(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('finka_time_entries')
    .select(`*, project:finka_projects(${TIMER_PROJECT_SELECT})`)
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle()
  return (data ?? null) as RunningTimer | null
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

// Stopt een eventueel lopende timer van deze gebruiker en start er een voor
// projectId. Start- en eindtijd komen allebei van de klok van het apparaat,
// zodat een sessie nooit negatief kan uitvallen door verschil met de server.
export async function startTimer(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
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
    started_at: new Date().toISOString(),
  })
  return error
}
