import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isStaffUser } from '@/lib/portal'
import { removeMilestoneEvent, syncMilestone } from '@/lib/google-calendar'

// Een afspraak (mijlpaal) in Google Agenda zetten, bijwerken of weghalen.
// { milestoneId, action: 'sync' | 'remove' } — 'sync' kijkt zelf aan de
// mijlpaal of hij in de agenda hoort; zonder koppeling gebeurt er niets.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isStaffUser(user.id))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { milestoneId, action } = (await request.json().catch(() => ({}))) as { milestoneId?: string; action?: string }
  if (!milestoneId) return NextResponse.json({ ok: false, error: 'milestoneId ontbreekt' }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const result = action === 'remove' ? await removeMilestoneEvent(milestoneId) : await syncMilestone(milestoneId, appUrl)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
