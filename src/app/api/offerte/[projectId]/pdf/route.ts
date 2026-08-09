import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderPdf } from '@/lib/pdf'

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { projectId } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const cookieHeader = request.headers.get('cookie') ?? ''

  try {
    const pdf = await renderPdf(`${baseUrl}/offerte/${projectId}`, cookieHeader)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="offerte-${projectId}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF-generatie mislukt:', err)
    return NextResponse.json({ error: 'PDF-generatie mislukt' }, { status: 500 })
  }
}
