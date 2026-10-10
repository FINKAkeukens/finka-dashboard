import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { PORTAL_PREVIEW_COOKIE } from '@/lib/portal'

// Voorbeeldweergave beëindigen: cookie weg, terug naar de klantkaart.
export async function GET(request: Request) {
  const customerId = (await cookies()).get(PORTAL_PREVIEW_COOKIE)?.value
  const target = customerId && /^[0-9a-f-]{36}$/.test(customerId) ? `/klanten/${customerId}` : '/klanten'
  const response = NextResponse.redirect(new URL(target, request.url))
  response.cookies.delete(PORTAL_PREVIEW_COOKIE)
  return response
}
