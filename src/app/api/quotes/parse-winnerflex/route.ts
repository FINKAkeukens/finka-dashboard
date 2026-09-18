import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractKitchenSummary } from '@/lib/claude'

// Neemt een Winner Flex/Compusoft-uitdraai (PDF met tekening + onderdelenlijst),
// bewaart 'm als bijlage bij de offerte, en laat Claude er een leesbare
// samenvatting van de belangrijkste keukenonderdelen uit destilleren.
//
// De klant-browser uploadt het bestand zelf al rechtstreeks naar Storage
// (zie KastenOptionEditor.tsx) — deze route krijgt alleen het path terug en
// haalt de bytes zelf op om naar Claude te sturen. Vercel Functions laten
// een requestbody nooit groter dan ~4,5MB door (hard, niet instelbaar), dus
// het bestand zelf via deze route posten liep voor grotere PDF's vast.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const quoteId = body?.quoteId
  const path = body?.path
  const filename = body?.filename
  const size = body?.size

  if (typeof quoteId !== 'string' || !quoteId || typeof path !== 'string' || !path || typeof filename !== 'string') {
    return NextResponse.json({ error: 'Offerte-id, path of bestandsnaam ontbreekt' }, { status: 400 })
  }
  // Het path is server-side gebouwd door dezelfde client-uploadcode als hier
  // verwacht (quoteId/winnerflex-...) — extra check dat het echt bij deze
  // offerte hoort, zodat dit endpoint niet als omweg gebruikt kan worden om
  // een willekeurig ander bestand uit de bucket te laten samenvatten.
  if (!path.startsWith(`${quoteId}/`)) {
    return NextResponse.json({ error: 'Path hoort niet bij deze offerte' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: downloaded, error: downloadError } = await service.storage.from('offer-images').download(path)
  if (downloadError || !downloaded) {
    return NextResponse.json({ error: downloadError?.message ?? 'Bestand niet gevonden in Storage' }, { status: 404 })
  }
  if (downloaded.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Alleen PDF-uitdraaien worden op dit moment ondersteund' }, { status: 400 })
  }
  const buffer = Buffer.from(await downloaded.arrayBuffer())

  const { data: publicUrlData } = service.storage.from('offer-images').getPublicUrl(path)

  let summary: string[] = []
  let totaalExclBtw: number | null = null
  let summaryError: string | null = null
  try {
    const result = await extractKitchenSummary(buffer.toString('base64'))
    summary = result.summary
    totaalExclBtw = result.totaalExclBtw
    if (!summary.length && totaalExclBtw === null) {
      summaryError = 'Claude kon geen samenvatting/bedrag uit dit document halen.'
    }
  } catch (err) {
    console.error('Kitchen summary extraction failed:', err)
    summaryError = err instanceof Error ? err.message : 'Onbekende fout bij AI-verwerking'
  }

  return NextResponse.json({
    attachment: { name: filename, url: publicUrlData.publicUrl, size: typeof size === 'number' ? size : buffer.byteLength },
    summary,
    totaalExclBtw,
    summaryError,
  })
}
