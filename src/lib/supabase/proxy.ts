import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 'api' hoeft hier niet meer apart uitgesloten te worden — de proxy-matcher
  // in src/proxy.ts sluit /api al helemaal uit, API-routes komen hier dus
  // nooit meer binnen.
  //
  // Deze laag regelt alleen "is er een sessie" — welke rol (staff/klant) bij
  // die sessie hoort en of die rol bij het gevraagde pad mag komen, wordt
  // verderop in de layouts gecontroleerd ((dashboard)/layout.tsx resp.
  // portaal/(authed)/layout.tsx), niet hier.
  const pathname = request.nextUrl.pathname
  const isPortalPath = pathname.startsWith('/portaal')
  const isStaffLoginPage = pathname === '/login'
  const isPortalLoginPage = pathname === '/portaal/login'
  const isAuthPage = isStaffLoginPage || isPortalLoginPage

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = isPortalPath ? '/portaal/login' : '/login'
    return NextResponse.redirect(url)
  }

  // Alleen het interne /login stuurt een reeds-ingelogde gebruiker weg. Bij
  // /portaal/login doen we dat bewust NIET: een sessie is hier "geldig" in
  // de zin van ingelogd, maar zegt niets over de rol (staff-sessie zonder
  // klantkoppeling, of een klant die per ongeluk hier terechtkomt) — die
  // check zit al in portaal/(authed)/layout.tsx. Wél hier redirecten gaf een
  // oneindige lus: die layout stuurt een niet-gekoppelde sessie ná /portaal
  // hierheen, en deze regel stuurde 'm dan weer terug naar /portaal.
  if (user && isStaffLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
