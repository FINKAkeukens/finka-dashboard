import { NextResponse } from 'next/server'
import { fetchLatestEmail, fetchPdfContent } from '@/lib/gmail'
import { extractDeliveryTimeSummary } from '@/lib/claude'
import { createClient } from '@supabase/supabase-js'
import { DeliveryTimeBrand } from '@/lib/types'

// Handmatige refresh (staff klikt op "Bijwerken") — bewust GEEN cron/achtergrondjob,
// zie gesprek met Merel: ze wil zelf bepalen wanneer de mailbox gecheckt wordt,
// niet dat het dashboard steeds opnieuw laadt/checkt.
const BRAND_QUERIES: Record<DeliveryTimeBrand, string> = {
  artego: 'from:artego-kuechen.de subject:levertijden newer_than:180d',
  sachsen: 'from:sachsenkuechen.de subject:levertijden newer_than:180d',
}

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tokenRow } = await supabase
    .from('finka_gmail_token')
    .select('refresh_token')
    .single()

  if (!tokenRow?.refresh_token) {
    return NextResponse.json({ error: 'Gmail niet gekoppeld' }, { status: 400 })
  }

  const results: Record<string, unknown> = {}

  for (const brand of Object.keys(BRAND_QUERIES) as DeliveryTimeBrand[]) {
    try {
      const email = await fetchLatestEmail(tokenRow.refresh_token, BRAND_QUERIES[brand])
      if (!email) {
        results[brand] = { error: 'Geen mail gevonden' }
        continue
      }

      let pdfBase64: string | null = null
      if (email.pdf_attachments.length > 0) {
        const first = email.pdf_attachments[0]
        pdfBase64 = await fetchPdfContent(tokenRow.refresh_token, first.messageId, first.attachmentId)
      }

      const summary = await extractDeliveryTimeSummary(email.body_preview, pdfBase64)
      if (!summary) {
        results[brand] = { error: 'Kon geen levertijd uit de mail halen' }
        continue
      }

      const { data: updated, error } = await supabase
        .from('finka_delivery_times')
        .upsert({
          brand,
          summary: JSON.stringify(summary),
          source_email_date: email.received_at,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      results[brand] = updated
    } catch (err) {
      console.error(`Delivery time refresh failed for ${brand}:`, err)
      results[brand] = { error: String(err) }
    }
  }

  return NextResponse.json({ results })
}
