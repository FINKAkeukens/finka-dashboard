import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

// Upload voor vragenlijst-vraagtype "Bestand" — zelfde beveiligingsmodel als
// /api/portaal/antwoord: het pad wordt hier server-side opgebouwd (nooit uit
// de aanvraag overgenomen) en pas ná een eigendomscheck (dit project is echt
// van deze klant) gegeven, zodat een klant nooit in de map van een ander
// project kan schrijven.
//
// Dit endpoint stuurt geen bestandsbytes meer heen en weer — het geeft een
// kortlevende, aan dit ene pad gebonden signed upload URL terug. Vercel
// Functions laten een requestbody nooit groter dan ~4,5MB door (hard, niet
// instelbaar), dus grotere foto's/scans liepen hier altijd op vast als het
// bestand zelf via deze route moest. De klant-browser uploadt de bytes nu
// rechtstreeks naar Storage met die token — geen brede Storage-toegang, enkel
// bevoegd voor exact dit ene, hier vooraf gevalideerde pad.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const service = createServiceClient()
  const { data: customer } = await service.from('finka_customers').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Geen klant-account' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const projectId = body?.projectId
  const questionId = body?.questionId
  const filename = body?.filename
  const contentType = body?.contentType

  if (typeof projectId !== 'string' || typeof questionId !== 'string' || typeof filename !== 'string') {
    return NextResponse.json({ error: 'projectId, questionId of filename ontbreekt' }, { status: 400 })
  }
  if (typeof contentType !== 'string' || !ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Alleen JPG, PNG of PDF toegestaan' }, { status: 400 })
  }

  const { data: project } = await service.from('finka_projects').select('customer_id').eq('id', projectId).maybeSingle()
  if (!project || project.customer_id !== customer.id) {
    return NextResponse.json({ error: 'Geen toegang tot dit project' }, { status: 403 })
  }

  const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
  const path = `vragenlijst/${projectId}/${questionId}/${randomUUID()}${extension}`

  const { data: signed, error: signError } = await service.storage.from('klant-uploads').createSignedUploadUrl(path)
  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 })

  const { data: urlData } = service.storage.from('klant-uploads').getPublicUrl(path)
  return NextResponse.json({ path: signed.path, token: signed.token, url: urlData.publicUrl, name: filename })
}
