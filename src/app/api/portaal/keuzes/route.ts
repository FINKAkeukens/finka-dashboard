import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { recordPortalActivity } from '@/lib/portal-activity'
import { KEUZE_WEET_NIET, type ProjectKeuze } from '@/lib/types'

// Keuze van de klant op één vraag van het tabblad Keuzes, en het definitief
// versturen van alle keuzes. Zelfde beveiligingsmodel als de andere
// portaal-routes: hier wordt gecontroleerd dat de vraag bij een project van
// deze klant hoort, zichtbaar is en nog niet verstuurd.
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

  const { keuzeId, choice, comment, submitProjectId } = await request.json()

  async function ownProject(projectId: string) {
    const { data } = await service
      .from('finka_projects')
      .select('customer_id, keuzes_submitted_at')
      .eq('id', projectId)
      .maybeSingle()
    return data && data.customer_id === customer!.id ? data : null
  }

  // --- Definitief versturen ----------------------------------------------
  if (submitProjectId) {
    const project = await ownProject(submitProjectId)
    if (!project) return NextResponse.json({ error: 'Geen toegang tot dit project' }, { status: 403 })

    const submittedBy = `${customer.first_name} ${customer.last_name}`.trim()
    const submittedAt = new Date().toISOString()
    const { error } = await service
      .from('finka_projects')
      .update({ keuzes_submitted_at: submittedAt, keuzes_submitted_by: submittedBy })
      .eq('id', submitProjectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await recordPortalActivity(service, {
      projectId: submitProjectId,
      type: 'keuzes',
      reference: 'keuzes',
      description: 'Keuzes definitief verstuurd',
    })
    return NextResponse.json({ submitted_at: submittedAt, submitted_by: submittedBy })
  }

  // --- Eén keuze opslaan ---------------------------------------------------
  if (!keuzeId) return NextResponse.json({ error: 'keuzeId ontbreekt' }, { status: 400 })
  const { data } = await service.from('finka_project_keuzes').select('*').eq('id', keuzeId).maybeSingle()
  const keuze = data as ProjectKeuze | null
  if (!keuze || !keuze.visible_to_customer) return NextResponse.json({ error: 'Vraag niet gevonden' }, { status: 404 })

  const project = await ownProject(keuze.project_id)
  if (!project) return NextResponse.json({ error: 'Geen toegang tot deze vraag' }, { status: 403 })
  if (project.keuzes_submitted_at) {
    return NextResponse.json({ error: 'Je keuzes zijn al verstuurd. Neem contact op met FINKA om iets te wijzigen.' }, { status: 400 })
  }

  const open = keuze.options.length === 0
  // Meerdere antwoorden: komma-gescheiden optie-id's; "weet ik nog niet"
  // altijd alleen.
  const ids = typeof choice === 'string' ? choice.split(',').filter(Boolean) : []
  const validChoice =
    (open && !choice) ||
    choice === null ||
    choice === KEUZE_WEET_NIET ||
    (ids.length > 0 &&
      (keuze.multiple || ids.length === 1) &&
      new Set(ids).size === ids.length &&
      ids.every((id) => keuze.options.some((o) => o.id === id)))
  if (!validChoice) return NextResponse.json({ error: 'Onbekende optie' }, { status: 400 })

  const now = new Date().toISOString()
  const cleanComment = typeof comment === 'string' && comment.trim() ? comment.trim() : null
  const { error } = await service
    .from('finka_project_keuzes')
    .update({
      choice: open ? null : choice ?? null,
      comment: cleanComment,
      // Open vraag: beantwoord zodra er tekst staat.
      answered_at: (open ? cleanComment : choice) ? now : null,
      updated_at: now,
    })
    .eq('id', keuzeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordPortalActivity(service, {
    projectId: keuze.project_id,
    type: 'keuzes',
    reference: 'keuzes',
    description: 'Keuzes ingevuld of bijgewerkt',
  })
  return NextResponse.json({ success: true })
}
