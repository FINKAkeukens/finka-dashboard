import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Enige schrijfpad voor vragenlijst-antwoorden vanuit het klantportaal — de
// klant-browser praat nooit rechtstreeks met de tabellen (zie migratie-
// sectie 46/49). Valideert hier dat het project echt bij de ingelogde klant
// hoort voordat er iets wordt weggeschreven.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const service = createServiceClient()
  const { data: customer } = await service.from('finka_customers').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Geen klant-account' }, { status: 403 })

  const { projectId, questionId, answer } = await request.json()
  if (!projectId || !questionId) {
    return NextResponse.json({ error: 'projectId/questionId ontbreekt' }, { status: 400 })
  }

  const { data: project } = await service.from('finka_projects').select('customer_id').eq('id', projectId).maybeSingle()
  if (!project || project.customer_id !== customer.id) {
    return NextResponse.json({ error: 'Geen toegang tot dit project' }, { status: 403 })
  }

  const { error } = await service
    .from('finka_questionnaire_responses')
    .upsert(
      { project_id: projectId, question_id: questionId, answer: answer || null, updated_at: new Date().toISOString() },
      { onConflict: 'project_id,question_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
