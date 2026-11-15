import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStaffUser } from '@/lib/portal'
import type { CatalogusItemInput } from '@/lib/catalogus/items'

// Slaat een in de browser ingelezen catalogus op en maakt hem actief. De
// stalen staan dan al in de bucket 'catalogus' (de browser uploadt ze
// rechtstreeks); hier komen alleen de gegevens binnen (~300 kB).
const SOORTEN = new Set(['corpus', 'werkblad', 'greep', 'model', 'kast', 'accessoire'])
const BATCH = 1000

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isStaffUser(user.id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const body = await request.json()
  const { id, titel, bestandsnaam, aantallen, waarschuwingen } = body
  const items = body.items as CatalogusItemInput[]
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || typeof titel !== 'string' || !titel.trim() || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Ongeldige catalogus' }, { status: 400 })
  }
  if (items.some((i) => !SOORTEN.has(i.soort) || typeof i.code !== 'string' || !i.code)) {
    return NextResponse.json({ error: 'Ongeldige regel in de catalogus' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error: insertError } = await service.from('finka_catalogi').insert({
    id,
    titel: titel.trim(),
    bestandsnaam: typeof bestandsnaam === 'string' ? bestandsnaam : null,
    aantallen: aantallen ?? {},
    waarschuwingen: Array.isArray(waarschuwingen) ? waarschuwingen : [],
    ingelezen_door: user.email ?? null,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  for (let i = 0; i < items.length; i += BATCH) {
    const { error } = await service.from('finka_catalogus_items').insert(
      items.slice(i, i + BATCH).map((it) => ({
        catalogus_id: id,
        soort: it.soort,
        code: it.code,
        naam: it.naam,
        prijzen: it.prijzen,
        data: it.data ?? {},
        afbeelding_url: it.afbeelding_url,
      }))
    )
    if (error) {
      // Half ingelezen catalogus niet laten staan.
      await service.from('finka_catalogi').delete().eq('id', id)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Pas als alles erin staat de actieve wisselen (unieke index: eerst uit).
  const { error: uitError } = await service.from('finka_catalogi').update({ actief: false }).eq('actief', true).neq('id', id)
  if (uitError) return NextResponse.json({ error: uitError.message }, { status: 500 })
  const { error: aanError } = await service.from('finka_catalogi').update({ actief: true }).eq('id', id)
  if (aanError) return NextResponse.json({ error: aanError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
