import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderPdf } from '@/lib/pdf'

// Losse PDF voor de aansluitschema-bijlage, met een eigen bestandsnaam
// (Bijlage-aansluitschema-[projectnummer]) zodat de offerte en de bijlage
// als twee losse documenten gedownload worden i.p.v. samengevoegd. Geen
// downloadgeschiedenis/diff hier (dat is een offerte-specifieke feature,
// zie /api/offerte/[projectId]/pdf) — dit is puur de PDF-generatie.
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { projectId } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const cookieHeader = request.headers.get('cookie') ?? ''

  try {
    const { data: project } = await supabase
      .from('finka_projects')
      .select('reference_number')
      .eq('id', projectId)
      .single()

    const pdf = await renderPdf(`${baseUrl}/offerte/${projectId}/bijlage-aansluitschema`, cookieHeader)
    const filename = buildFilename(project?.reference_number ?? projectId)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionHeader(filename),
      },
    })
  } catch (err) {
    console.error('PDF-generatie mislukt:', err)
    return NextResponse.json({ error: 'PDF-generatie mislukt' }, { status: 500 })
  }
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim()
}

function buildFilename(referenceNumber: string) {
  return `Bijlage-aansluitschema-${sanitizeFilenamePart(referenceNumber)}`
}

// filename (ASCII, voor oudere browsers) + filename* (UTF-8) — zelfde
// patroon als /api/offerte/[projectId]/pdf/route.ts.
function contentDispositionHeader(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`
}
