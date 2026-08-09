import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractWerkbladSummary } from '@/lib/werkblad'

// Zelfde patroon als de Winner Flex-route: werkblad-specificatie (PDF) wordt
// bewaard als bijlage, en Claude destilleert er een leesbare samenvatting +
// totaalbedrag uit voor de kostprijs-opbouw.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const quoteId = formData.get('quoteId')

  if (!(file instanceof File) || typeof quoteId !== 'string' || !quoteId) {
    return NextResponse.json({ error: 'Bestand of offerte-id ontbreekt' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Alleen PDF-specificaties worden op dit moment ondersteund' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = `${quoteId}/werkblad-${Date.now()}-${file.name}`

  const service = createServiceClient()
  const { error: uploadError } = await service.storage.from('offer-images').upload(path, buffer, {
    upsert: true,
    contentType: file.type,
  })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicUrlData } = service.storage.from('offer-images').getPublicUrl(path)

  let summary: string[] = []
  let totaalExclBtw: number | null = null
  let summaryError: string | null = null
  try {
    const result = await extractWerkbladSummary(buffer.toString('base64'))
    summary = result.summary
    totaalExclBtw = result.totaalExclBtw
    if (!summary.length && totaalExclBtw === null) {
      summaryError = 'Claude kon geen samenvatting/bedrag uit dit document halen.'
    }
  } catch (err) {
    console.error('Werkblad summary extraction failed:', err)
    summaryError = err instanceof Error ? err.message : 'Onbekende fout bij AI-verwerking'
  }

  return NextResponse.json({
    attachment: { name: file.name, url: publicUrlData.publicUrl, size: file.size },
    summary,
    totaalExclBtw,
    summaryError,
  })
}
