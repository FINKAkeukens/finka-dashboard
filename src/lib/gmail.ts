import { google } from 'googleapis'

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl() {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  })
}

export async function getTokensFromCode(code: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function getGmailClient(refreshToken: string) {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

interface EmailData {
  gmail_message_id: string
  subject: string
  sender: string
  received_at: string
  body_preview: string
  has_attachments: boolean
  pdf_attachments: { messageId: string; attachmentId: string; filename: string }[]
}

export async function fetchRecentOfferteEmails(refreshToken: string, maxResults = 50): Promise<EmailData[]> {
  const gmail = await getGmailClient(refreshToken)

  // Zoekwoorden beperkt tot het onderwerp (niet de hele mailtekst) — alle tot
  // nu toe succesvol verwerkte offertes hadden het woord al in het onderwerp
  // staan, en zoeken in de hele body trok irrelevante mail aan die het woord
  // toevallig érgens in de tekst had (bv. een verzekeringsmail met
  // "prijsopgave" in de bijlage-tekst). "aanbieding" is te generiek en
  // geschrapt. from:info@cebin.nl blijft wél breed (vangt af en toe een
  // offerte zonder het gebruikelijke "Offerte cebin nr:"-onderwerp), maar
  // sluit expliciet de administratieve mailtypes uit die daar het gros van
  // de ruis vormden (orderbevestigingen, facturen, betaallinkjes, samples).
  const query = '(subject:offerte OR subject:offertenummer OR subject:prijslijst OR subject:quotation OR subject:prijsopgave OR from:info@cebin.nl) -in:sent -from:contact@finkakeukens.nl -from:merelhazes@gmail.com -subject:(orderbevestiging OR "ideal link" OR factuur OR "aanpassing order" OR kleurstalen OR verzekering) newer_than:365d'

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  })

  if (!data.messages?.length) return []

  const messages = await Promise.all(
    data.messages.map(async ({ id }) => {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id: id!,
        format: 'full',
      })
      return msg
    })
  )

  return messages.map(msg => {
    const headers = msg.payload?.headers ?? []
    const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    const subject = getHeader('Subject')
    const from = getHeader('From')

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
        // Probeer onbekende tekst-parts te decoderen
        try {
          bodyText += Buffer.from(part.body.data, 'base64').toString('utf-8')
        } catch {}
      }
      part.parts?.forEach(extractBody)
    }
    extractBody(msg.payload ?? undefined)
    // Gebruik HTML als er geen plain text is
    if (!bodyText.trim() && htmlFallback) bodyText = htmlFallback

    // Verzamel PDF-bijlagen
    const pdf_attachments: { messageId: string; attachmentId: string; filename: string }[] = []
    const collectAttachments = (part: typeof msg.payload | undefined) => {
      if (!part) return
      if (part.filename && part.body?.attachmentId && part.mimeType === 'application/pdf') {
        pdf_attachments.push({
          messageId: msg.id!,
          attachmentId: part.body.attachmentId,
          filename: part.filename,
        })
      }
      part.parts?.forEach(collectAttachments)
    }
    collectAttachments(msg.payload ?? undefined)

    return {
      gmail_message_id: msg.id!,
      subject,
      sender: from,
      received_at: new Date(parseInt(msg.internalDate ?? '0')).toISOString(),
      body_preview: bodyText.slice(0, 3000),
      has_attachments: pdf_attachments.length > 0 || (msg.payload?.parts?.some(p => p.filename && p.filename.length > 0) ?? false),
      pdf_attachments,
    }
  })
}

export async function fetchPdfContent(refreshToken: string, messageId: string, attachmentId: string): Promise<string | null> {
  try {
    const gmail = await getGmailClient(refreshToken)
    const { data } = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    })
    if (!data.data) return null
    // Gmail geeft URL-safe base64 terug, omzetten naar standaard base64
    return data.data.replace(/-/g, '+').replace(/_/g, '/')
  } catch {
    return null
  }
}
