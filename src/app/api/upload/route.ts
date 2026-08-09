import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Uploads gaan via de server (service-rol) i.p.v. rechtstreeks vanuit de
// browser naar Supabase Storage, zodat we niet afhankelijk zijn van
// storage-RLS-policies voor ingelogde gebruikers. Alleen ingelogde interne
// gebruikers mogen dit endpoint gebruiken.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const path = formData.get('path')

  if (!(file instanceof File) || typeof path !== 'string' || !path) {
    return NextResponse.json({ error: 'Bestand of pad ontbreekt' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.storage.from('offer-images').upload(path, file, { upsert: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data } = service.storage.from('offer-images').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
