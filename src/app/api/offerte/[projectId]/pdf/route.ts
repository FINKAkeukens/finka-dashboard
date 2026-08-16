import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderPdf } from '@/lib/pdf'
import { buildDownloadSnapshot, diffQuoteSnapshots } from '@/lib/quote-download-diff'
import type { Quote, QuoteDownloadSnapshot, QuoteItem } from '@/lib/types'

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
    const pdf = await renderPdf(`${baseUrl}/offerte/${projectId}`, cookieHeader)
    await recordDownload(supabase, projectId, user.email ?? null)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="offerte-${projectId}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF-generatie mislukt:', err)
    return NextResponse.json({ error: 'PDF-generatie mislukt' }, { status: 500 })
  }
}

// Schrijft een rij naar finka_quote_downloads (datum/tijd + wat er is
// gewijzigd t.o.v. de vorige download). Best-effort: een probleem hier mag
// een geslaagde PDF-download nooit blokkeren, dus alleen naar console loggen.
async function recordDownload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  downloadedBy: string | null
) {
  try {
    const { data: quote } = await supabase
      .from('finka_quotes')
      .select('*')
      .eq('project_id', projectId)
      .is('archived_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!quote) return

    const [{ data: lastDownload }, { data: itemsData }] = await Promise.all([
      supabase
        .from('finka_quote_downloads')
        .select('snapshot')
        .eq('quote_id', quote.id)
        .order('downloaded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('finka_quote_items').select('*').eq('quote_id', quote.id),
    ])

    const snapshot = buildDownloadSnapshot(quote as Quote, (itemsData ?? []) as QuoteItem[])
    const changes = diffQuoteSnapshots((lastDownload?.snapshot as QuoteDownloadSnapshot) ?? null, snapshot)

    await supabase.from('finka_quote_downloads').insert({
      quote_id: quote.id,
      downloaded_by: downloadedBy,
      snapshot,
      changes,
    })
  } catch (err) {
    console.error('Kon download niet in geschiedenis wegschrijven:', err)
  }
}
