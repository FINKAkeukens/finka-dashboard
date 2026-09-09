import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateApparatuurAansluitschema, ApparatuurItem } from '@/lib/claude'

// Geeft alleen een voorstel terug — schrijft niets naar de database. De UI
// (AansluitschemaTab.tsx) toont dit als een door staff te beoordelen concept,
// per onderdeel (items/groepenverdeling/spoelkast/meterkast) apart aan te vinken.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const apparaten: ApparatuurItem[] = Array.isArray(body.apparaten) ? body.apparaten : []
  const catalogus = Array.isArray(body.catalogus) ? body.catalogus : []
  if (!apparaten.length) {
    return NextResponse.json({ error: 'Geen apparatuur gevonden in de offerte van dit project' }, { status: 400 })
  }

  try {
    const result = await generateApparatuurAansluitschema(apparaten, catalogus)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Apparatuur-AI mislukt:', err)
    return NextResponse.json({ error: 'AI-voorstel mislukt' }, { status: 500 })
  }
}
