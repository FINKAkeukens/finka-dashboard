import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateGroepenverdelingTekst, GroepenverdelingApparaat } from '@/lib/claude'

// Genereert alleen een voorstel — schrijft niets automatisch weg. De UI
// (AansluitschemaTab.tsx) zet dit rechtstreeks in het bewerkbare
// Groepenverdeling-veld, staff kan het altijd nog aanpassen voor het opslaan.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const apparaten: GroepenverdelingApparaat[] = Array.isArray(body.apparaten) ? body.apparaten : []
  if (!apparaten.length) {
    return NextResponse.json({ error: 'Geen apparatuur gevonden in de offerte van dit project' }, { status: 400 })
  }

  try {
    const tekst = await generateGroepenverdelingTekst(apparaten)
    return NextResponse.json({ tekst })
  } catch (err) {
    console.error('Groepenverdeling AI mislukt:', err)
    return NextResponse.json({ error: 'AI-tekst genereren mislukt' }, { status: 500 })
  }
}
