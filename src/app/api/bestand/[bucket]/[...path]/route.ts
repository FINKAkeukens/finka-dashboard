import { NextResponse } from 'next/server'
import { getAuthUser, getPortalCustomer, isStaffUser } from '@/lib/portal'
import { createServiceClient } from '@/lib/supabase/service'
import { isForCustomerType } from '@/lib/standard-documents'
import { isProtectedBucket, type ProtectedBucket } from '@/lib/storage-url'
import type { Customer, StandardDocument } from '@/lib/types'

// Poortwachter voor de afgeschermde buckets (zie src/lib/storage-url.ts).
// Staff mag elk bestand openen; een portaalklant alleen bestanden van zijn
// eigen project, en bij documenten/offertes alleen als staff ze zichtbaar
// heeft gezet. Daarna een redirect naar een signed URL die na een paar
// minuten verloopt — een doorgestuurde of gelekte link werkt dus niet meer.
const SIGNED_URL_SECONDS = 300

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> }
) {
  const { bucket, path: segments } = await params
  const path = segments.join('/')
  if (!isProtectedBucket(bucket) || !path || segments.includes('..')) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const service = createServiceClient()
  if (!(await isStaffUser(user.id))) {
    const portal = await getPortalCustomer()
    if (!portal || !(await customerMayOpen(service, portal.customer, bucket, path))) {
      // 404 i.p.v. 403: verklapt niet of een bestand van iemand anders bestaat.
      return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    }
  }

  // ?download=<bestandsnaam> → de browser slaat het bestand op i.p.v. het
  // te openen (Content-Disposition: attachment), onder die naam.
  const downloadName = new URL(request.url).searchParams.get('download')?.replace(/[\\/:*?"<>|]/g, '').slice(0, 150)
  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS, downloadName ? { download: downloadName } : undefined)
  if (error || !data) return NextResponse.json({ error: 'Bestand niet gevonden' }, { status: 404 })

  const response = NextResponse.redirect(data.signedUrl, 302)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

async function customerMayOpen(
  service: ReturnType<typeof createServiceClient>,
  customer: Customer,
  bucket: ProtectedBucket,
  path: string
): Promise<boolean> {
  // Standaarddocumenten (algemene voorwaarden e.d.): elke klant voor wiens
  // klanttype het document actief is.
  if (bucket === 'project-documenten' && path.startsWith('standaard/')) {
    const { data } = await service.from('finka_standard_documents').select('*').eq('storage_path', path)
    // Elke versie (ook een oudere): een klant met een vroeger akkoord ziet
    // juist de versie die toen gold — zie standardDocumentsFor.
    return ((data ?? []) as StandardDocument[]).some((d) => isForCustomerType(d, customer.customer_type))
  }

  // Alle andere paden beginnen met het project-ID:
  //   klant-uploads       vragenlijst/<projectId>/<vraagId>/<uuid>.<ext>
  //   project-documenten  <projectId>/<uuid>.<ext>
  //   offerte-pdfs        <projectId>/<quoteId>/<uuid>.pdf
  const parts = path.split('/')
  const projectId = bucket === 'klant-uploads' ? (parts[0] === 'vragenlijst' ? parts[1] : null) : parts[0]
  if (!projectId) return false

  const { data: project } = await service.from('finka_projects').select('customer_id').eq('id', projectId).maybeSingle()
  if (!project || project.customer_id !== customer.id) return false

  // Eigen uploads uit de vragenlijst: eigen project is genoeg.
  if (bucket === 'klant-uploads') return true

  // Documenten en offertes: alleen wat staff zichtbaar heeft gezet. De
  // opgeslagen URL is de publieke URL van precies dit pad.
  const storedUrl = service.storage.from(bucket).getPublicUrl(path).data.publicUrl
  if (bucket === 'project-documenten') {
    const { count } = await service
      .from('finka_project_documents')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('file_url', storedUrl)
      .eq('visible_to_customer', true)
    return !!count
  }

  const { data: quotes } = await service.from('finka_quotes').select('id').eq('project_id', projectId)
  const quoteIds = (quotes ?? []).map((q) => q.id)
  if (!quoteIds.length) return false
  const { count } = await service
    .from('finka_quote_downloads')
    .select('id', { count: 'exact', head: true })
    .in('quote_id', quoteIds)
    .eq('pdf_url', storedUrl)
    .eq('visible_to_customer', true)
  return !!count
}
