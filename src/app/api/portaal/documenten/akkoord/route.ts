import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import type { CostBreakdownItem, Quote, QuoteDownload } from '@/lib/types'

type DownloadWithQuote = QuoteDownload & {
  quote: Pick<Quote, 'id' | 'project_id' | 'status' | 'akkoord_at' | 'cost_breakdown' | 'archived_at'> | null
}

// Klant-akkoord op een document (bv. de offerte-PDF) vanuit het portaal —
// zelfde beveiligingsmodel als /api/portaal/antwoord: de klant-browser
// praat nooit rechtstreeks met de tabellen, en hier wordt gevalideerd dat
// het document echt bij een project van de ingelogde klant hoort.
//
// Zet, als het nog om de actieve (niet-gearchiveerde) offerte van het
// project gaat, ook meteen die offerte zelf op status 'akkoord' — net als
// het handmatige pad in de Offerte-tab (zie QuoteEditor's handleSave),
// inclusief de begroot_bedrag-snapshot naar finka_project_financials zodat
// dit meteen meetelt in de omzet-rapportage (/financieel).
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

  const { downloadId } = await request.json()
  if (!downloadId) return NextResponse.json({ error: 'downloadId ontbreekt' }, { status: 400 })

  const { data } = await service
    .from('finka_quote_downloads')
    .select('*, quote:finka_quotes(id, project_id, status, akkoord_at, cost_breakdown, archived_at)')
    .eq('id', downloadId)
    .maybeSingle()
  const download = data as DownloadWithQuote | null
  if (!download || !download.quote) {
    return NextResponse.json({ error: 'Document niet gevonden' }, { status: 404 })
  }
  const quote = download.quote

  const { data: project } = await service
    .from('finka_projects')
    .select('customer_id')
    .eq('id', quote.project_id)
    .maybeSingle()
  if (!project || project.customer_id !== customer.id) {
    return NextResponse.json({ error: 'Geen toegang tot dit document' }, { status: 403 })
  }

  if (!download.visible_to_customer || !download.approval_required || !download.pdf_url) {
    return NextResponse.json({ error: 'Dit document vraagt geen akkoord' }, { status: 400 })
  }

  const approverName = `${customer.first_name} ${customer.last_name}`.trim()

  // Idempotent — een dubbele klik (of een race tussen twee tabbladen) mag
  // geen tweede keer wegschrijven, gewoon het bestaande akkoord teruggeven.
  if (download.approved_at) {
    return NextResponse.json({ approved_at: download.approved_at, approved_by: download.approved_by })
  }

  const approvedAt = new Date().toISOString()
  const { error: updError } = await service
    .from('finka_quote_downloads')
    .update({ approved_at: approvedAt, approved_by: approverName })
    .eq('id', downloadId)
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  // Best-effort: de koppeling met de offerte-status mag een geslaagd
  // document-akkoord nooit blokkeren. Bij een gearchiveerde (vervangen)
  // offerteversie laten we de status met rust.
  try {
    if (!quote.archived_at && quote.status !== 'akkoord') {
      const changedBy = `${approverName} (klantportaal)`
      const akkoordAt = quote.akkoord_at ?? approvedAt
      const { error: quoteError } = await service
        .from('finka_quotes')
        .update({ status: 'akkoord', akkoord_at: akkoordAt, updated_at: approvedAt, updated_by: changedBy })
        .eq('id', quote.id)
      if (quoteError) throw quoteError

      await logAudit(service, {
        tableName: 'finka_quotes',
        recordId: quote.id,
        fieldName: 'status',
        oldValue: quote.status,
        newValue: 'akkoord',
        action: 'update',
        changedBy,
      })

      // Zelfde eenmalige snapshot als QuoteEditor's handleSave bij de eerste
      // keer accorderen: begroot_bedrag per kostencategorie vastleggen —
      // alleen als dat nog niet eerder is gebeurd (akkoord_at was nog leeg).
      if (!quote.akkoord_at) {
        const costBreakdown = (quote.cost_breakdown ?? []) as CostBreakdownItem[]
        if (costBreakdown.length) {
          const { error: financialsError } = await service
            .from('finka_project_financials')
            .upsert(
              costBreakdown.map((row) => ({
                project_id: quote.project_id,
                category: row.key,
                begroot_bedrag: row.werkelijke_kosten,
                marge_percentage: row.marge_percentage,
                werkelijk_bedrag: row.werkelijke_kosten,
              })),
              { onConflict: 'project_id,category' }
            )
          if (financialsError) throw financialsError
        }
      }
    }
  } catch (err) {
    console.error('Kon offerte-status niet bijwerken na klant-akkoord:', err)
  }

  return NextResponse.json({ approved_at: approvedAt, approved_by: approverName })
}
