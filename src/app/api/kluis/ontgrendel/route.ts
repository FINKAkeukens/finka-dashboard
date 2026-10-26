import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isValidPin, MAX_ATTEMPTS, requireStaff, unlockedResponse, UNLOCK_MINUTES, vaultSettings, verifyPin } from '@/lib/kluis'

// Pincode controleren en de kluis 15 minuten openzetten.
export async function POST(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) return auth.error
  const { pin } = await request.json()

  const settings = await vaultSettings()
  if (!settings?.pin_hash) return NextResponse.json({ error: 'Nog geen pincode ingesteld' }, { status: 409 })
  if (settings.locked_until && new Date(settings.locked_until) > new Date()) {
    return NextResponse.json({ error: 'Te veel foute pogingen, probeer het later opnieuw', lockedUntil: settings.locked_until }, { status: 429 })
  }

  const service = createServiceClient()
  if (!isValidPin(pin) || !verifyPin(pin, settings.pin_hash)) {
    const attempts = settings.failed_attempts + 1
    const locked = attempts >= MAX_ATTEMPTS
    await service
      .from('finka_vault_settings')
      .update({
        failed_attempts: locked ? 0 : attempts,
        locked_until: locked ? new Date(Date.now() + UNLOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq('id', 1)
    return NextResponse.json(
      locked
        ? { error: `Te veel foute pogingen, probeer het over ${UNLOCK_MINUTES} minuten opnieuw` }
        : { error: `Onjuiste pincode (nog ${MAX_ATTEMPTS - attempts} pogingen)` },
      { status: locked ? 429 : 403 }
    )
  }

  if (settings.failed_attempts) await service.from('finka_vault_settings').update({ failed_attempts: 0 }).eq('id', 1)
  return unlockedResponse(auth.user.id)
}
