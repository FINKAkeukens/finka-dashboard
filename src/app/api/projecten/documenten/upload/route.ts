import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStaffUser } from '@/lib/portal'

const MAX_BYTES = 25 * 1024 * 1024

// Uploaden van een eigen document bij een project (Documenten-tabblad).
// Alleen staff — klanten uploaden via /api/portaal/upload, dat een heel
// ander pad en andere validatie heeft. Het opslagpad wordt hier server-side
// opgebouwd, nooit uit de aanvraag overgenomen.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isStaffUser(user.id))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const projectId = formData.get('projectId')

  if (!(file instanceof File) || typeof projectId !== 'string' || !projectId) {
    return NextResponse.json({ error: 'Bestand of projectId ontbreekt' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Bestand is groter dan 25MB' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: project } = await service.from('finka_projects').select('id').eq('id', projectId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 })

  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `${projectId}/${randomUUID()}${extension}`

  const { error: uploadError } = await service.storage
    .from('project-documenten')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = service.storage.from('project-documenten').getPublicUrl(path)

  const { data: inserted, error: insError } = await service
    .from('finka_project_documents')
    .insert({
      project_id: projectId,
      filename: file.name,
      file_url: urlData.publicUrl,
      uploaded_by: user.email ?? null,
    })
    .select()
    .single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ document: inserted })
}
