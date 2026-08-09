import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractApplianceFromEmail } from '@/lib/claude'
import { fetchPdfContent, getGmailClient } from '@/lib/gmail'

export async function POST(request: NextRequest) {
  const { id } = await request.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: item }, { data: tokenRow }] = await Promise.all([
    supabase.from('finka_email_queue').select('*').eq('id', id).single(),
    supabase.from('finka_gmail_token').select('refresh_token').single(),
  ])

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!tokenRow?.refresh_token) return NextResponse.json({ error: 'Gmail niet gekoppeld' }, { status: 400 })

  // Haal de mail opnieuw op uit Gmail (voor verse body + PDF)
  let freshBody = item.body_preview ?? ''
  let pdfBase64: string | null = null

  try {
    const gmail = await getGmailClient(tokenRow.refresh_token)
    const { data: msg } = await gmail.users.messages.get({
      userId: 'me',
      id: item.gmail_message_id,
      format: 'full',
    })

    // Extract body — plain text én HTML
    let bodyText = ''
    let htmlFallback = ''
    const extractBody = (part: typeof msg.payload | undefined): void => {
      if (!part) return
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += Buffer.from(part.body.data, 'base64').toString('utf-8')
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8')
        htmlFallback += html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/?(p|div|tr|td|th|li)[^>]*>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&euro;/g, '€')
          .replace(/&#8364;/g, '€')
          .replace(/&amp;/g, '&')
          .replace(/\s{2,}/g, ' ')
          .trim()
      } else if (part.body?.data && !part.filename) {
        try { bodyText += Buffer.from(part.body.data, 'base64').toString('utf-8') } catch {}
      }
      part.parts?.forEach(extractBody)
    }
    extractBody(msg.payload ?? undefined)
    freshBody = (bodyText.trim() || htmlFallback).slice(0, 3000)

    // Haal PDF op als die er is
    const findPdf = (part: typeof msg.payload | undefined): { attachmentId: string } | null => {
      if (!part) return null
      if (part.mimeType === 'application/pdf' && part.body?.attachmentId) {
        return { attachmentId: part.body.attachmentId }
      }
      for (const p of part.parts ?? []) {
        const found = findPdf(p)
        if (found) return found
      }
      return null
    }
    const pdfPart = findPdf(msg.payload ?? undefined)
    if (pdfPart) {
      pdfBase64 = await fetchPdfContent(tokenRow.refresh_token, item.gmail_message_id, pdfPart.attachmentId)
    }

    // Sla verse body op in database
    await supabase.from('finka_email_queue').update({ body_preview: freshBody }).eq('id', id)

  } catch (err) {
    console.error('Gmail re-fetch failed:', err)
  }

  const aiExtracted = await extractApplianceFromEmail(
    item.subject,
    freshBody,
    item.sender,
    pdfBase64
  )

  await supabase.from('finka_email_queue').update({ ai_extracted: aiExtracted }).eq('id', id)

  return NextResponse.json({ appliances: aiExtracted.appliances ?? [] })
}
