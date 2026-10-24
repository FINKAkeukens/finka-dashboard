import { NextResponse } from 'next/server'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { hashPin, isValidPin, requireStaff, unlockedResponse, vaultSettings } from '@/lib/kluis'

// Pincode van de kluis instellen. De eerste keer mag dat zomaar (ingelogd
// als staff); daarna alleen met het wachtwoord van de dashboard-login, zodat
// iemand achter een ingelogde laptop de pincode niet kan omzetten.
export async function POST(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { pin, loginPassword } = await request.json()
  if (!isValidPin(pin)) return NextResponse.json({ error: 'Pincode moet 4 tot 8 cijfers zijn' }, { status: 400 })

  const settings = await vaultSettings()
  if (settings?.pin_hash) {
    if (typeof loginPassword !== 'string' || !auth.user.email) {
      return NextResponse.json({ error: 'Wachtwoord van de login nodig' }, { status: 400 })
    }
    // Losse client zonder cookies: controleert alleen het wachtwoord en
    // raakt de huidige sessie niet.
    const check = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await check.auth.signInWithPassword({ email: auth.user.email, password: loginPassword })
    if (error) return NextResponse.json({ error: 'Wachtwoord van de login klopt niet' }, { status: 403 })
  }

  const { error } = await createServiceClient()
    .from('finka_vault_settings')
    .upsert({ id: 1, pin_hash: hashPin(pin), failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })

  return unlockedResponse(auth.user.id)
}
