import { NextRequest, NextResponse } from 'next/server'
import { fetchRecentOfferteEmails, fetchPdfContent } from '@/lib/gmail'
import { extractApplianceFromEmail } from '@/lib/claude'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
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
