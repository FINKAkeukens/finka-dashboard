import { randomUUID } from 'crypto'
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
    const filename = await recordDownload(supabase, projectId, user.email ?? null, pdf)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionHeader(filename ?? `offerte-${projectId}`),
      },
    })
  } catch (err) {
    console.error('PDF-generatie mislukt:', err)
    return NextResponse.json({ error: 'PDF-generatie mislukt' }, { status: 500 })
  }
}

// "Titel - Klantnaam - Datum - vN": Titel is altijd kaal "Offerte" of
// "Prijsindicatie" — customer_document_label is een vrij tekstveld dat staff
// soms aanvult (bv. met de projectnaam erin), dus normaliseren i.p.v. dat
// letterlijk overnemen. vN telt de downloads van déze offerte op déze
// kalenderdag op (2e download vandaag = v2, ongeacht de interne
// offerteversie). Leestekens die niet in een bestandsnaam mogen worden
// weggehaald.
function normalizeDocumentTitle(documentLabel: string) {
  return /offerte/i.test(documentLabel) ? 'Offerte' : 'Prijsindicatie'
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim()
}

function buildQuoteFilename(documentLabel: string, customerName: string, date: Date, dayVersion: number) {
  const dateLabel = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  return [normalizeDocumentTitle(documentLabel), customerName, dateLabel, `v${dayVersion}`]
    .map(sanitizeFilenamePart)
    .filter(Boolean)
    .join(' - ')
}

function startOfTodayIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

// filename (ASCII, voor oudere browsers) + filename* (UTF-8, voor namen met
// bv. ë/ï) — samen dekken ze alle browsers, zie RFC 6266/5987.
function contentDispositionHeader(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`
}

// Schrijft een rij naar finka_quote_downloads (datum/tijd + wat er is
// gewijzigd t.o.v. de vorige download), en bewaart de gegenereerde PDF zelf
// in de 'offerte-pdfs' bucket zodat 'm terug te vinden is via het
// Documenten-tabblad. Geeft de opgebouwde bestandsnaam terug zodat de GET
// hierboven 'm ook op de daadwerkelijke download kan zetten. Best-effort: een
// probleem hier mag een geslaagde PDF-download nooit blokkeren, dus alleen
// naar console loggen (en null teruggeven, de aanroeper valt dan terug op
// een generieke bestandsnaam).
async function recordDownload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  downloadedBy: string | null,
  pdf: Buffer
): Promise<string | null> {
  try {
    const [{ data: quote }, { data: project }] = await Promise.all([
      supabase
        .from('finka_quotes')
        .select('*')
        .eq('project_id', projectId)
        .is('archived_at', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('finka_projects')
        .select('customer:finka_customers(first_name, last_name)')
        .eq('id', projectId)
        .maybeSingle(),
    ])
    if (!quote) return null

    const [{ data: lastDownload }, { data: itemsData }, { count: todayCount }] = await Promise.all([
      supabase
        .from('finka_quote_downloads')
        .select('snapshot')
        .eq('quote_id', quote.id)
        .order('downloaded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('finka_quote_items').select('*').eq('quote_id', quote.id),
      supabase
        .from('finka_quote_downloads')
        .select('id', { count: 'exact', head: true })
        .eq('quote_id', quote.id)
        .gte('downloaded_at', startOfTodayIso()),
    ])

    const snapshot = buildDownloadSnapshot(quote as Quote, (itemsData ?? []) as QuoteItem[])
    const changes = diffQuoteSnapshots((lastDownload?.snapshot as QuoteDownloadSnapshot) ?? null, snapshot)

    const customer = (project as { customer: { first_name: string; last_name: string } | null } | null)?.customer
    const customerName = customer ? `${customer.first_name} ${customer.last_name}`.trim() : 'Klant'
    const filename = buildQuoteFilename(quote.customer_document_label, customerName, new Date(), (todayCount ?? 0) + 1)

    let pdfUrl: string | null = null
    const path = `${projectId}/${quote.id}/${randomUUID()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('offerte-pdfs')
      .upload(path, pdf, { contentType: 'application/pdf' })
    if (uploadError) {
      console.error('Kon offerte-PDF niet opslaan in Storage:', uploadError)
    } else {
      pdfUrl = supabase.storage.from('offerte-pdfs').getPublicUrl(path).data.publicUrl
    }

    await supabase.from('finka_quote_downloads').insert({
      quote_id: quote.id,
      downloaded_by: downloadedBy,
      snapshot,
      changes,
      pdf_url: pdfUrl,
      filename,
    })

    return filename
  } catch (err) {
    console.error('Kon download niet in geschiedenis wegschrijven:', err)
    return null
  }
}
