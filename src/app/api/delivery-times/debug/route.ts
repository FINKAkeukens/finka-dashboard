import { NextResponse } from 'next/server'
import { fetchLatestEmail } from '@/lib/gmail'
import { createClient } from '@supabase/supabase-js'
import { DeliveryTimeBrand } from '@/lib/types'

// TIJDELIJKE diagnostische route — geen Claude-call, geen DB-write, alleen
// om te zien wat er exact uit Gmail komt. Wordt weer verwijderd zodra het
// "levertijden laden niet"-probleem is gevonden.
const BRAND_QUERIES: Record<DeliveryTimeBrand, string> = {
  artego: 'from:artego-kuechen.de subject:levertijden newer_than:180d',
  sachsen: 'from:sachsenkuechen.de subject:levertijden newer_than:180d',
}

export async function GET() {
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
      results[brand] = email
        ? {
            subject: email.subject,
            sender: email.sender,
            received_at: email.received_at,
            has_attachments: email.has_attachments,
            pdf_attachments: email.pdf_attachments,
            body_preview_length: email.body_preview.length,
            body_preview: email.body_preview.slice(0, 1500),
          }
        : { error: 'Geen mail gevonden' }
    } catch (err) {
      results[brand] = { error: String(err) }
    }
  }

  return NextResponse.json({ results })
}
