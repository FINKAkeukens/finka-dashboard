import { NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { createClient } from '@supabase/supabase-js'
import { DeliveryTimeBrand } from '@/lib/types'
import { gmail_v1 } from 'googleapis'

// TIJDELIJKE diagnostische route — geen Claude-call, geen DB-write, alleen
// om te zien wat er exact uit Gmail komt (incl. alle bijlage-parts, niet
// alleen PDF's). Wordt weer verwijderd zodra het "levertijden laden
// niet"-probleem is gevonden.
const BRAND_QUERIES: Record<DeliveryTimeBrand, string> = {
  artego: 'from:artego-kuechen.de subject:levertijden newer_than:180d',
  sachsen: 'from:sachsenkuechen.de subject:levertijden newer_than:180d',
}

function listParts(part: gmail_v1.Schema$MessagePart | undefined, depth = 0): unknown[] {
  if (!part) return []
  const self = {
    depth,
    mimeType: part.mimeType,
    filename: part.filename || undefined,
    hasAttachmentId: !!part.body?.attachmentId,
    bodySize: part.body?.size,
  }
  const children = (part.parts ?? []).flatMap((p) => listParts(p, depth + 1))
  return [self, ...children]
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

  const gmail = await getGmailClient(tokenRow.refresh_token)
  const results: Record<string, unknown> = {}

  for (const brand of Object.keys(BRAND_QUERIES) as DeliveryTimeBrand[]) {
    try {
      const { data: list } = await gmail.users.messages.list({
        userId: 'me',
        q: BRAND_QUERIES[brand],
        maxResults: 1,
      })
      const id = list.messages?.[0]?.id
      if (!id) {
        results[brand] = { error: 'Geen mail gevonden' }
        continue
      }
      const { data: msg } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      results[brand] = {
        subject: msg.payload?.headers?.find((h) => h.name === 'Subject')?.value,
        topLevelMimeType: msg.payload?.mimeType,
        parts: listParts(msg.payload ?? undefined),
      }
    } catch (err) {
      results[brand] = { error: String(err) }
    }
  }

  return NextResponse.json({ results })
}
