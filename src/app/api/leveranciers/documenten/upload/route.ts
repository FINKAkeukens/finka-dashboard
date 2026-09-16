import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStaffUser } from '@/lib/portal'

const MAX_BYTES = 25 * 1024 * 1024

// Uploaden van een document bij een leverancier, eventueel in een specifieke
// map. Zelfde opzet als /api/projecten/documenten/upload: alleen staff, pad
// wordt hier server-side opgebouwd (nooit uit de aanvraag overgenomen).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isStaffUser(user.id))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const supplierId = formData.get('supplierId')
  const folderIdRaw = formData.get('folderId')
  const folderId = typeof folderIdRaw === 'string' && folderIdRaw ? folderIdRaw : null

  if (!(file instanceof File) || typeof supplierId !== 'string' || !supplierId) {
    return NextResponse.json({ error: 'Bestand of supplierId ontbreekt' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Bestand is groter dan 25MB' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: supplier } = await service.from('finka_suppliers').select('id').eq('id', supplierId).maybeSingle()
  if (!supplier) return NextResponse.json({ error: 'Leverancier niet gevonden' }, { status: 404 })

  if (folderId) {
    const { data: folder } = await service
      .from('finka_supplier_folders')
      .select('id')
      .eq('id', folderId)
      .eq('supplier_id', supplierId)
      .maybeSingle()
    if (!folder) return NextResponse.json({ error: 'Map niet gevonden' }, { status: 404 })
  }

  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `${supplierId}/${randomUUID()}${extension}`

  const { error: uploadError } = await service.storage
    .from('leverancier-documenten')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = service.storage.from('leverancier-documenten').getPublicUrl(path)

  const { data: inserted, error: insError } = await service
    .from('finka_supplier_documents')
    .insert({
      supplier_id: supplierId,
      folder_id: folderId,
      filename: file.name,
      file_url: urlData.publicUrl,
      size_bytes: file.size,
      uploaded_by: user.email ?? null,
    })
    .select()
    .single()
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ document: inserted })
}
