import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isStaffUser } from '@/lib/portal'
import { verifyAppliance } from '@/lib/appliance-verify'

// Een controle met web search duurt typisch 20-60 s.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Alleen staff — anders kan iedereen hiermee Anthropic-kosten maken.
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isStaffUser(user.id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  if (!body?.brand || !body?.model) {
    return NextResponse.json({ error: 'Merk en model zijn verplicht' }, { status: 400 })
  }

  try {
    const result = await verifyAppliance({
      type: body.type,
      brand: String(body.brand),
      model: String(body.model),
      specs: body.specs ?? {},
      notes: body.notes ?? null,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('Appliance verify error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
