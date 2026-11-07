import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isStaffUser } from '@/lib/portal'
import { getCalendarAuthUrl } from '@/lib/google-calendar'

// "Google Agenda koppelen" op de planning: door naar het toestemmingsscherm
// van Google. De callback is die van de Gmail-koppeling (state=calendar).
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isStaffUser(user.id))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.redirect(getCalendarAuthUrl())
}
