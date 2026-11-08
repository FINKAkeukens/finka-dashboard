import { randomUUID } from 'crypto'
import { google, calendar_v3 } from 'googleapis'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { addDays, format } from 'date-fns'
import { milestoneLabel } from './planning'
import { ProjectMilestone } from './types'

// ---------------------------------------------------------------------------
// Afspraken uit het dashboard in Google Agenda (contact@finkakeukens.nl).
// Eén richting: het dashboard maakt, wijzigt en verwijdert het event; wat er
// in Google zelf verandert komt niet terug. Zelfde OAuth-client en
// redirect-URI als de Gmail-koppeling; de callback herkent deze koppeling
// aan state=calendar (zie api/gmail/callback). Het token staat in
// finka_google_calendar_token, alleen leesbaar voor de server (migratie 100).
// ---------------------------------------------------------------------------

export const CALENDAR_ACCOUNT = 'contact@finkakeukens.nl'
const TIME_ZONE = 'Europe/Amsterdam'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getCalendarAuthUrl() {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: 'calendar',
    login_hint: CALENDAR_ACCOUNT,
  })
}

export function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Code uit de callback → token opslaan, met het account erbij zodat de
// planning kan laten zien met welke agenda het dashboard gekoppeld is.
export async function saveCalendarTokens(code: string): Promise<{ error?: string; account?: string }> {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) return { error: 'no_refresh_token' }
  oauth2Client.setCredentials(tokens)
  const { data: me } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get()
  const account = me.email ?? null
  const { error } = await serviceClient().from('finka_google_calendar_token').upsert({
    id: 1,
    refresh_token: tokens.refresh_token,
    account_email: account,
    calendar_id: 'primary',
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  return { account: account ?? undefined }
}

export async function calendarConnection(supabase: SupabaseClient = serviceClient()) {
  const { data } = await supabase.from('finka_google_calendar_token').select('account_email, calendar_id').maybeSingle()
  return data as { account_email: string | null; calendar_id: string } | null
}

async function getCalendar(supabase: SupabaseClient) {
  const { data } = await supabase.from('finka_google_calendar_token').select('refresh_token, calendar_id').maybeSingle()
  if (!data?.refresh_token) return null
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: data.refresh_token })
  return { calendar: google.calendar({ version: 'v3', auth: oauth2Client }), calendarId: data.calendar_id as string }
}

type MilestoneWithProject = ProjectMilestone & {
  project: {
    id: string
    title: string
    reference_number: string
    customer: { first_name: string; last_name: string; email: string | null } | null
  } | null
}

function hhmm(time: string | null | undefined) {
  return time ? time.slice(0, 5) : null
}

// Met tijd een gewone afspraak (zonder eindtijd een uur), zonder tijd een
// hele-dag-afspraak.
function eventTimes(m: MilestoneWithProject): Pick<calendar_v3.Schema$Event, 'start' | 'end'> {
  const date = m.date!
  const start = hhmm(m.start_time)
  if (!start) {
    const next = format(addDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd')
    return { start: { date }, end: { date: next } }
  }
  let end = hhmm(m.end_time)
  if (!end || end <= start) {
    const [h, min] = start.split(':').map(Number)
    end = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return {
    start: { dateTime: `${date}T${start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${date}T${end}:00`, timeZone: TIME_ZONE },
  }
}

function buildEvent(m: MilestoneWithProject, appUrl: string): calendar_v3.Schema$Event {
  const customer = m.project?.customer
  const customerName = customer ? `${customer.first_name} ${customer.last_name}`.trim() : null
  const summary = [milestoneLabel(m), customerName].filter(Boolean).join(' · ')
  const description = [
    m.project ? `Project: ${m.project.reference_number} · ${m.project.title.trim()}` : null,
    m.assigned_to ? `Toegewezen aan: ${m.assigned_to}` : null,
    m.notes ? `\n${m.notes}` : null,
    m.project ? `\nDashboard: ${appUrl}/projecten/${m.project.id}?tab=planning` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const attendees = m.invite_customer && customer?.email ? [{ email: customer.email, displayName: customerName ?? undefined }] : []
  return { summary, description, ...eventTimes(m), attendees }
}

function meetLinkOf(event: calendar_v3.Schema$Event): string | null {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? null
}

export interface SyncResult {
  ok: boolean
  error?: string
  meet_link?: string | null
  google_event_id?: string | null
}

// Zet de afspraak zoals hij nu in de database staat in Google Agenda: nieuw,
// bijwerken of (in_google_calendar uit / geen datum) weghalen. Schrijft het
// resultaat terug op de mijlpaal.
export async function syncMilestone(milestoneId: string, appUrl: string): Promise<SyncResult> {
  const supabase = serviceClient()
  const { data } = await supabase
    .from('finka_project_milestones')
    .select('*, project:finka_projects(id, title, reference_number, customer:finka_customers(first_name, last_name, email))')
    .eq('id', milestoneId)
    .maybeSingle()
  const m = data as MilestoneWithProject | null
  if (!m) return { ok: false, error: 'Afspraak niet gevonden' }

  const shouldExist = m.in_google_calendar && !!m.date
  if (!shouldExist && !m.google_event_id) return { ok: true, meet_link: m.meet_link, google_event_id: null }

  const conn = await getCalendar(supabase)
  if (!conn) return finish(supabase, m.id, { error: 'Google Agenda is niet gekoppeld' })
  const { calendar, calendarId } = conn

  try {
    if (!shouldExist) {
      await deleteEvent(calendar, calendarId, m.google_event_id!)
      return finish(supabase, m.id, { google_event_id: null, meet_link: null })
    }

    const body = buildEvent(m, appUrl)
    const hadMeet = !!m.meet_link
    if (m.with_meet && !hadMeet) {
      body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    } else if (!m.with_meet && hadMeet) {
      body.conferenceData = null as unknown as calendar_v3.Schema$ConferenceData
    }
    // Uitnodiging (en wijzigingen) alleen naar de klant mailen als die
    // uitgenodigd is.
    const sendUpdates = body.attendees?.length ? 'all' : 'none'

    let event: calendar_v3.Schema$Event | null = null
    if (m.google_event_id) {
      try {
        const res = await calendar.events.patch({
          calendarId,
          eventId: m.google_event_id,
          conferenceDataVersion: 1,
          sendUpdates,
          requestBody: body,
        })
        event = res.data
      } catch (err) {
        // In Google verwijderd: opnieuw aanmaken.
        if (!isGone(err)) throw err
      }
    }
    if (!event) {
      if (m.with_meet && !body.conferenceData) {
        body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      }
      const res = await calendar.events.insert({ calendarId, conferenceDataVersion: 1, sendUpdates, requestBody: body })
      event = res.data
    }
    return finish(supabase, m.id, { google_event_id: event.id ?? null, meet_link: m.with_meet ? meetLinkOf(event) : null })
  } catch (err) {
    return finish(supabase, m.id, { error: errorMessage(err) })
  }
}

// Bij verwijderen van een afspraak in het dashboard: eerst het event weg.
export async function removeMilestoneEvent(milestoneId: string): Promise<SyncResult> {
  const supabase = serviceClient()
  const { data: m } = await supabase.from('finka_project_milestones').select('id, google_event_id').eq('id', milestoneId).maybeSingle()
  if (!m?.google_event_id) return { ok: true }
  const conn = await getCalendar(supabase)
  if (!conn) return { ok: false, error: 'Google Agenda is niet gekoppeld' }
  try {
    await deleteEvent(conn.calendar, conn.calendarId, m.google_event_id)
    await supabase.from('finka_project_milestones').update({ google_event_id: null, meet_link: null, google_sync_error: null }).eq('id', m.id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

async function deleteEvent(calendar: calendar_v3.Calendar, calendarId: string, eventId: string) {
  try {
    await calendar.events.delete({ calendarId, eventId, sendUpdates: 'all' })
  } catch (err) {
    if (!isGone(err)) throw err
  }
}

function isGone(err: unknown) {
  const code = (err as { code?: number })?.code
  return code === 404 || code === 410
}

function errorMessage(err: unknown) {
  const msg = (err as { message?: string })?.message ?? String(err)
  if (/invalid_grant/i.test(msg)) return 'De koppeling met Google Agenda is verlopen. Koppel opnieuw.'
  return msg
}

async function finish(
  supabase: SupabaseClient,
  id: string,
  result: { error?: string; google_event_id?: string | null; meet_link?: string | null }
): Promise<SyncResult> {
  const patch: Record<string, unknown> = { google_sync_error: result.error ?? null }
  if (!result.error) {
    patch.google_event_id = result.google_event_id ?? null
    patch.meet_link = result.meet_link ?? null
  }
  await supabase.from('finka_project_milestones').update(patch).eq('id', id)
  return result.error ? { ok: false, error: result.error } : { ok: true, ...result }
}

// ---------------------------------------------------------------------------
// Andersom: afspraken die in Google Agenda zelf staan (niet via het
// dashboard gemaakt) ophalen voor de weekagenda op /planning. Alleen lezen;
// events die bij een mijlpaal horen laten we weg, die staan er al.
// ---------------------------------------------------------------------------

export interface GoogleAgendaEvent {
  id: string
  title: string
  date: string // eerste dag, yyyy-MM-dd
  endDate: string // laatste dag (inclusief), yyyy-MM-dd
  startTime: string | null // HH:mm, null = hele dag
  endTime: string | null
  meetLink: string | null
  htmlLink: string | null
  location: string | null
}

function amsterdamParts(dateTime: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(dateTime))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export async function listGoogleEvents(from: string, to: string): Promise<{ events: GoogleAgendaEvent[]; error?: string }> {
  const supabase = serviceClient()
  const conn = await getCalendar(supabase)
  if (!conn) return { events: [] }
  try {
    const { data } = await conn.calendar.events.list({
      calendarId: conn.calendarId,
      // Een dag ruimer i.v.m. tijdzone; de agenda kiest zelf per dag.
      timeMin: addDays(new Date(`${from}T00:00:00Z`), -1).toISOString(),
      timeMax: addDays(new Date(`${to}T23:59:59Z`), 1).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    const items = (data.items ?? []).filter((e) => e.id && e.status !== 'cancelled')
    const ids = items.map((e) => e.id!)
    const { data: own } = ids.length
      ? await supabase.from('finka_project_milestones').select('google_event_id').in('google_event_id', ids)
      : { data: [] as { google_event_id: string }[] }
    const ownIds = new Set((own ?? []).map((m) => m.google_event_id))

    const events = items
      .filter((e) => !ownIds.has(e.id!))
      // Afspraken die contact@ zelf heeft afgeslagen niet tonen.
      .filter((e) => !e.attendees?.some((a) => a.self && a.responseStatus === 'declined'))
      .map((e): GoogleAgendaEvent | null => {
        if (e.start?.date) {
          const lastDay = format(addDays(new Date(`${e.end?.date ?? e.start.date}T00:00:00`), -1), 'yyyy-MM-dd')
          return {
            id: e.id!,
            title: e.summary || '(geen titel)',
            date: e.start.date,
            endDate: lastDay < e.start.date ? e.start.date : lastDay,
            startTime: null,
            endTime: null,
            meetLink: meetLinkOf(e),
            htmlLink: e.htmlLink ?? null,
            location: e.location ?? null,
          }
        }
        if (!e.start?.dateTime) return null
        const start = amsterdamParts(e.start.dateTime)
        const end = e.end?.dateTime ? amsterdamParts(e.end.dateTime) : start
        return {
          id: e.id!,
          title: e.summary || '(geen titel)',
          date: start.date,
          endDate: end.date < start.date ? start.date : end.date,
          startTime: start.time,
          endTime: end.time,
          meetLink: meetLinkOf(e),
          htmlLink: e.htmlLink ?? null,
          location: e.location ?? null,
        }
      })
      .filter((e): e is GoogleAgendaEvent => !!e)
    return { events }
  } catch (err) {
    return { events: [], error: errorMessage(err) }
  }
}
