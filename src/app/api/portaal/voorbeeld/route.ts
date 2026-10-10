import { NextResponse } from 'next/server'
import { getAuthUser, isStaffUser, PORTAL_PREVIEW_COOKIE } from '@/lib/portal'
import { createServiceClient } from '@/lib/supabase/service'

// "Bekijk als klant" (knop op de klantkaart): zet een cookie waarmee staff
// het portaal van deze klant ziet, alleen-lezen — zie getPortalCustomer in
// src/lib/portal.ts. GET, zodat de knop een gewone link in een nieuw
// tabblad kan zijn.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const user = await getAuthUser()
  if (!user) return NextResponse.redirect(new URL('/login', url))
  if (!(await isStaffUser(user.id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const customerId = url.searchParams.get('klant')
  if (!customerId) return NextResponse.json({ error: 'klant ontbreekt' }, { status: 400 })
  const { data: customer } = await createServiceClient()
    .from('finka_customers')
    .select('id')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

  const response = NextResponse.redirect(new URL('/portaal', url))
  response.cookies.set(PORTAL_PREVIEW_COOKIE, customerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 8,
  })
  return response
}
