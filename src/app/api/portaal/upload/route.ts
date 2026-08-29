import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { QUESTIONNAIRE_FILE_MAX_BYTES } from '@/lib/questionnaire'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

// Upload voor vragenlijst-vraagtype "Bestand" — zelfde beveiligingsmodel als
// /api/portaal/antwoord: de klant-browser praat nooit rechtstreeks met
// Storage, en het pad wordt hier server-side opgebouwd (nooit uit de
// aanvraag overgenomen) zodat een klant nooit in de map van een ander
// project kan schrijven.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const service = createServiceClient()
  const { data: customer } = await service.from('finka_customers').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Geen klant-account' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file')
  const projectId = formData.get('projectId')
  const questionId = formData.get('questionId')

  if (!(file instanceof File) || typeof projectId !== 'string' || typeof questionId !== 'string') {
    return NextResponse.json({ error: 'Bestand, projectId of questionId ontbreekt' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Alleen JPG, PNG of PDF toegestaan' }, { status: 400 })
  }
  if (file.size > QUESTIONNAIRE_FILE_MAX_BYTES) {
    return NextResponse.json({ error: 'Bestand is groter dan 20MB' }, { status: 400 })
  }

  const { data: project } = await service.from('finka_projects').select('customer_id').eq('id', projectId).maybeSingle()
  if (!project || project.customer_id !== customer.id) {
    return NextResponse.json({ error: 'Geen toegang tot dit project' }, { status: 403 })
  }

  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `vragenlijst/${projectId}/${questionId}/${randomUUID()}${extension}`

  const { error: uploadError } = await service.storage.from('klant-uploads').upload(path, file)
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = service.storage.from('klant-uploads').getPublicUrl(path)
  return NextResponse.json({ url: urlData.publicUrl, name: file.name })
}
