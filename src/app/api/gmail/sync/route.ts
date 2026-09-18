import { NextRequest, NextResponse } from 'next/server'
import { fetchRecentOfferteEmails, fetchPdfContent } from '@/lib/gmail'
import { extractApplianceFromEmail } from '@/lib/claude'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isStaffUser } from '@/lib/portal'

// Twee legitieme aanroepers: de "Sync"-knop in de inbox-UI (staff-sessie via
// cookie) en de wekelijkse cron (server-naar-server, geen cookie — die stuurt
// daarom de CRON_SECRET mee, zie api/cron/route.ts). Zonder deze check kon
// deze route vanaf het open internet aangeroepen worden en onbeperkt
// Gmail-quota + Anthropic-kosten opsouperen.
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user && (await isStaffUser(user.id))
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  try {
    const emails = await fetchRecentOfferteEmails(tokenRow.refresh_token)

    let newCount = 0
    for (const email of emails) {
      const { data: existing } = await supabase
        .from('finka_email_queue')
        .select('id')
        .eq('gmail_message_id', email.gmail_message_id)
        .single()

      if (existing) continue

      // Haal eerste PDF-bijlage op (indien aanwezig)
      let pdfBase64: string | null = null
      if (email.pdf_attachments.length > 0) {
        const first = email.pdf_attachments[0]
        pdfBase64 = await fetchPdfContent(tokenRow.refresh_token, first.messageId, first.attachmentId)
      }

      const aiExtracted = await extractApplianceFromEmail(
        email.subject,
        email.body_preview ?? '',
        email.sender,
        pdfBase64
      )

      await supabase.from('finka_email_queue').insert({
        gmail_message_id: email.gmail_message_id,
        subject: email.subject,
        sender: email.sender,
        received_at: email.received_at,
        body_preview: email.body_preview,
        has_attachments: email.has_attachments,
        status: 'pending',
        ai_extracted: aiExtracted,
      })
      newCount++
    }

    return NextResponse.json({ synced: newCount, total: emails.length })
  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
