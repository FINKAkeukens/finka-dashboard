import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret, requireUnlocked } from '@/lib/kluis'
import type { StoredLogin } from '@/lib/bedrijfsgegevens'

// Eén wachtwoord ontsleutelen (Toon/Kopieer), alleen met open kluis.
export async function GET(request: Request) {
  const auth = await requireUnlocked()
  if ('error' in auth) return auth.error
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const index = Number(params.get('i'))
  if (!id || !Number.isInteger(index)) return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })

  const { data } = await createServiceClient().from('finka_accounts').select('logins').eq('id', id).maybeSingle()
  const secret = (data?.logins as StoredLogin[] | undefined)?.[index]?.secret
  if (!secret) return NextResponse.json({ error: 'Geen wachtwoord' }, { status: 404 })
  return NextResponse.json({ password: decryptSecret(secret) }, { headers: { 'Cache-Control': 'no-store' } })
}
