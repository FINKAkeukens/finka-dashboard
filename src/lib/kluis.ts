import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStaffUser } from '@/lib/portal'

// Kluis voor de accountwachtwoorden op /bedrijf (migratie 90). Alleen voor
// de server: de sleutel (VAULT_ENCRYPTION_KEY, 32 bytes base64) komt nooit
// in de browser, en finka_accounts / finka_vault_settings zijn alleen met de
// service role te lezen.
//
// - Wachtwoorden: AES-256-GCM, opgeslagen als "v1:<iv>:<tag>:<data>".
// - Pincode: scrypt-hash. Na de juiste pincode krijgt de browser een
//   httpOnly-cookie dat 15 minuten geldig is en aan de gebruiker vastzit.
// - 5 foute pogingen achter elkaar = 15 minuten geen pogingen meer.

export const UNLOCK_MINUTES = 15
export const MAX_ATTEMPTS = 5
const COOKIE = 'finka_kluis'

function key() {
  const raw = process.env.VAULT_ENCRYPTION_KEY
  const buf = raw ? Buffer.from(raw, 'base64') : null
  if (!buf || buf.length !== 32) throw new Error('VAULT_ENCRYPTION_KEY ontbreekt of is geen 32 bytes')
  return buf
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decryptSecret(stored: string) {
  const [version, iv, tag, data] = stored.split(':')
  if (version !== 'v1') throw new Error('Onbekend formaat')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin)
}

export function hashPin(pin: string) {
  const salt = randomBytes(16)
  return `${salt.toString('base64')}:${scryptSync(pin, salt, 32).toString('base64')}`
}

export function verifyPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(pin, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

// Ondertekend met een van de kluissleutel afgeleide sleutel, zodat het
// cookie niet na te maken is zonder die sleutel.
function sign(value: string) {
  return createHmac('sha256', key()).update(`kluis-cookie:${value}`).digest('base64url')
}

// Antwoord met het cookie dat de kluis tot `until` (ms) openzet.
export function unlockedResponse(userId: string) {
  const expires = Date.now() + UNLOCK_MINUTES * 60_000
  const res = NextResponse.json({ ok: true, until: expires })
  const value = `${expires}.${sign(`${expires}.${userId}`)}`
  res.cookies.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: UNLOCK_MINUTES * 60,
  })
  return res
}

export function clearUnlocked(res: NextResponse) {
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

// Tot wanneer de kluis open is voor deze gebruiker (ms), of null.
export async function unlockedUntil(userId: string) {
  const value = (await cookies()).get(COOKIE)?.value
  if (!value) return null
  const [expires, signature] = value.split('.')
  const expected = sign(`${expires}.${userId}`)
  if (!signature || signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  const until = Number(expires)
  return until > Date.now() ? until : null
}

// Voor de API-routes: ingelogde staff-gebruiker, of een foutantwoord.
export async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) } as const
  if (!(await isStaffUser(user.id))) {
    return { error: NextResponse.json({ error: 'Geen toegang' }, { status: 403 }) } as const
  }
  return { user } as const
}

// Staff én kluis open.
export async function requireUnlocked() {
  const auth = await requireStaff()
  if ('error' in auth) return auth
  if (!(await unlockedUntil(auth.user.id))) {
    return { error: NextResponse.json({ error: 'Kluis is vergrendeld' }, { status: 423 }) } as const
  }
  return auth
}

export async function vaultSettings() {
  const { data } = await createServiceClient().from('finka_vault_settings').select('*').eq('id', 1).maybeSingle()
  return data as { pin_hash: string | null; failed_attempts: number; locked_until: string | null } | null
}
