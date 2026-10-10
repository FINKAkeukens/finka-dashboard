import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStaffUser } from '@/lib/portal'

// Ruimt een oud standaarddocument-bestand op na vervangen/verwijderen.
// Kan niet vanuit de browser: storage.remove() heeft naast de DELETE- ook
// een SELECT-policy op storage.objects nodig, en die heeft staff in
// project-documenten niet (lezen gaat via de publieke URL) — de browser-call
// "slaagt" dan zonder iets te verwijderen. Daarom via de service-role, en
// alleen voor paden onder standaard/ waar geen rij meer naar verwijst.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isStaffUser(user.id))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { path } = await request.json()
  if (typeof path !== 'string' || !/^standaard\/[\w-]+(\.\w+)?$/.test(path)) {
    return NextResponse.json({ error: 'Ongeldig pad' }, { status: 400 })
  }

  const service = createServiceClient()
  const { count } = await service
    .from('finka_standard_documents')
    .select('id', { count: 'exact', head: true })
    .eq('storage_path', path)
  if (count) return NextResponse.json({ error: 'Bestand is nog in gebruik' }, { status: 409 })

  const { error } = await service.storage.from('project-documenten').remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
