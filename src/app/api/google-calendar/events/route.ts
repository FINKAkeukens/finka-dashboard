import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isStaffUser } from '@/lib/portal'
import { listGoogleEvents } from '@/lib/google-calendar'

// Events uit Google Agenda voor de weekagenda: ?from=yyyy-MM-dd&to=yyyy-MM-dd
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isStaffUser(user.id))) {
    return NextResponse.json({ events: [], error: 'Unauthorized' }, { status: 401 })
  }
  const from = request.nextUrl.searchParams.get('from') ?? ''
  const to = request.nextUrl.searchParams.get('to') ?? ''
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!isDate(from) || !isDate(to)) return NextResponse.json({ events: [], error: 'Ongeldige periode' }, { status: 400 })

  const result = await listGoogleEvents(from, to)
  return NextResponse.json(result)
}
