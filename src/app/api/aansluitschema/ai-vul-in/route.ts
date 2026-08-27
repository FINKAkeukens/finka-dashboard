import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractConnectionSuggestions } from '@/lib/claude'

// Geeft alleen een voorstel terug — schrijft niets naar de database. De UI
// (AansluitschemaTab.tsx) toont dit als een door staff te beoordelen concept.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const { vrijeTekst, plattegrondUrl, catalogus } = body

  const tekst = typeof vrijeTekst === 'string' ? vrijeTekst : ''
  const tekening = typeof plattegrondUrl === 'string' ? plattegrondUrl : null
  if (!tekst.trim() && !tekening) {
    return NextResponse.json({ error: 'Vrije tekst of een tekening is verplicht' }, { status: 400 })
  }
  if (!Array.isArray(catalogus)) {
    return NextResponse.json({ error: 'Catalogus ontbreekt' }, { status: 400 })
  }

  try {
    const result = await extractConnectionSuggestions(tekst, catalogus, tekening)
    return NextResponse.json(result)
  } catch (err) {
    console.error('AI-hulp aansluitschema mislukt:', err)
    return NextResponse.json({ error: 'AI-hulp mislukt' }, { status: 500 })
  }
}
