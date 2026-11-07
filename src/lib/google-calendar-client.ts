// Vanuit de browser: een afspraak (opnieuw) naar Google Agenda sturen na een
// wijziging. De server kijkt zelf of de afspraak in de agenda hoort; zonder
// koppeling of zonder vinkje gebeurt er niets. Zie api/google-calendar/event.
export interface AgendaSyncResult {
  ok: boolean
  error?: string
  meet_link?: string | null
  google_event_id?: string | null
}

export async function syncAgenda(milestoneId: string, action: 'sync' | 'remove' = 'sync'): Promise<AgendaSyncResult> {
  try {
    const res = await fetch('/api/google-calendar/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId, action }),
    })
    return (await res.json()) as AgendaSyncResult
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
