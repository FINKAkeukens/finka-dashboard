import { NextResponse } from 'next/server'
import { klantProject, MAX_KEUZES_BYTES } from '@/lib/keuzemodule/toegang'
import { recordPortalActivity } from '@/lib/portal-activity'

// Tussentijds bewaren van de keuzes (het portaal stuurt na elke wijziging,
// een paar tellen vertraagd). Alleen zolang de ronde nog niet is ingestuurd.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const toegang = await klantProject(body?.projectId)
  if (!toegang.ok) return NextResponse.json({ error: toegang.error }, { status: toegang.status })
  const { service, projectId } = toegang

  const keuzes = body?.keuzes
  if (!keuzes || typeof keuzes !== 'object' || Array.isArray(keuzes) || JSON.stringify(keuzes).length > MAX_KEUZES_BYTES) {
    return NextResponse.json({ error: 'Ongeldige keuzes' }, { status: 400 })
  }

  const { data: instelling } = await service.from('finka_keuzemodule').select('ronde').eq('project_id', projectId).maybeSingle()
  if (!instelling) return NextResponse.json({ error: 'Module niet ingesteld' }, { status: 404 })

  const { data: bestaand } = await service
    .from('finka_keuzemodule_feedback')
    .select('status')
    .eq('project_id', projectId)
    .eq('ronde', instelling.ronde)
    .maybeSingle()
  if (bestaand?.status === 'ingestuurd') {
    return NextResponse.json({ error: 'Deze ronde is al ingestuurd' }, { status: 409 })
  }

  const { error } = await service.from('finka_keuzemodule_feedback').upsert(
    { project_id: projectId, ronde: instelling.ronde, keuzes, status: 'concept', updated_at: new Date().toISOString() },
    { onConflict: 'project_id,ronde' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordPortalActivity(service, {
    projectId,
    type: 'keuzemodule',
    reference: 'keuzemodule',
    description: 'Keuzes in het ontwerp bijgewerkt',
  })
  return NextResponse.json({ ok: true })
}
