import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { recordPortalActivity } from '@/lib/portal-activity'
import type { MaatformulierItem } from '@/lib/types'

// Antwoord van de klant op één regel van het formulier "Ruimte gereed", en het
// ondertekenen van het geheel. Zelfde beveiligingsmodel als de andere
// portaal-routes: de klant-browser praat nooit rechtstreeks met de tabellen,
// en hier wordt gevalideerd dat de regel bij een project van deze klant hoort.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const service = createServiceClient()
  const { data: customer } = await service
    .from('finka_customers')
    .select('id, first_name, last_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Geen klant-account' }, { status: 403 })

  const { itemId, answer, signProjectId } = await request.json()

  // --- Ondertekenen ------------------------------------------------------
  if (signProjectId) {
    const { data: project } = await service
      .from('finka_projects')
      .select('customer_id')
      .eq('id', signProjectId)
      .maybeSingle()
    if (!project || project.customer_id !== customer.id) {
      return NextResponse.json({ error: 'Geen toegang tot dit project' }, { status: 403 })
    }

    const signedBy = `${customer.first_name} ${customer.last_name}`.trim()
    const signedAt = new Date().toISOString()
    const { error: signError } = await service
      .from('finka_maatformulier_signoff')
      .upsert({ project_id: signProjectId, signed_at: signedAt, signed_by: signedBy }, { onConflict: 'project_id' })
    if (signError) return NextResponse.json({ error: signError.message }, { status: 500 })

    await recordPortalActivity(service, {
      projectId: signProjectId,
      type: 'maatformulier',
      reference: 'maatformulier',
      description: 'Ruimte gereed ondertekend',
    })

    return NextResponse.json({ signed_at: signedAt, signed_by: signedBy })
  }

  // --- Eén antwoord opslaan ----------------------------------------------
  if (!itemId) return NextResponse.json({ error: 'itemId ontbreekt' }, { status: 400 })

  const { data: itemData } = await service
    .from('finka_maatformulier_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  const item = itemData as MaatformulierItem | null
  if (!item) return NextResponse.json({ error: 'Regel niet gevonden' }, { status: 404 })

  const { data: project } = await service
    .from('finka_projects')
    .select('customer_id')
    .eq('id', item.project_id)
    .maybeSingle()
  if (!project || project.customer_id !== customer.id) {
    return NextResponse.json({ error: 'Geen toegang tot deze regel' }, { status: 403 })
  }
  // Een verborgen regel of een pure afspraak kent geen antwoord — dat mag
  // ook niet via een handmatig verzoek alsnog gevuld worden.
  if (!item.visible_to_customer || item.type === 'afspraak') {
    return NextResponse.json({ error: 'Deze regel is niet invulbaar' }, { status: 400 })
  }

  const { error: updError } = await service
    .from('finka_maatformulier_items')
    .update({ answer: answer || null, updated_at: new Date().toISOString() })
    .eq('id', itemId)
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  await recordPortalActivity(service, {
    projectId: item.project_id,
    type: 'maatformulier',
    reference: 'maatformulier',
    description: 'Ruimte gereed ingevuld of bijgewerkt',
  })

  return NextResponse.json({ success: true })
}
