import { NextRequest, NextResponse } from 'next/server'
import { getTokensFromCode } from '@/lib/gmail'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/apparatuur/inbox?error=no_code', request.url))
  }

  try {
    const tokens = await getTokensFromCode(code)
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/apparatuur/inbox?error=no_refresh_token', request.url))
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase.from('finka_gmail_token').upsert({
      id: '00000000-0000-0000-0000-000000000001',
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Supabase upsert error:', error)
      return NextResponse.redirect(new URL(`/apparatuur/inbox?error=${error.message}`, request.url))
    }

    return NextResponse.redirect(new URL('/apparatuur/inbox?connected=true', request.url))
  } catch (err) {
    console.error('Gmail OAuth error:', err)
    return NextResponse.redirect(new URL('/apparatuur/inbox?error=oauth_failed', request.url))
  }
}
