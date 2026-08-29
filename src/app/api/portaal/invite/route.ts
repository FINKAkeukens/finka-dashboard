import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStaffUser } from '@/lib/portal'

// Genereert een tijdelijk wachtwoord i.p.v. een uitnodigingsmail met magic
// link — dat voorkomt dat we afhankelijk zijn van Supabase's e-mail-
// aflevering/redirect-URL-configuratie voor fase 1. Staff deelt dit
// wachtwoord zelf met de klant; de klant kan het daarna zelf wijzigen via
// /portaal/wachtwoord.
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isStaffUser(user.id))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { customerId } = await request.json()
  if (!customerId) return NextResponse.json({ error: 'customerId ontbreekt' }, { status: 400 })

  const service = createServiceClient()
  const { data: customer, error: custError } = await service
    .from('finka_customers')
    .select('*')
    .eq('id', customerId)
    .single()
  if (custError || !customer) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
  if (!customer.email) return NextResponse.json({ error: 'Deze klant heeft geen e-mailadres' }, { status: 400 })

  const password = generatePassword()

  if (customer.auth_user_id) {
    // Al gekoppeld — dit is dan een wachtwoord-reset.
    const { error: updError } = await service.auth.admin.updateUserById(customer.auth_user_id, { password })
    if (updError) return NextResponse.json({ error: updError.message }, { status: 400 })
    return NextResponse.json({ email: customer.email, password })
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: customer.email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? 'Aanmaken account mislukt' }, { status: 400 })
  }

  const { error: linkError } = await service
    .from('finka_customers')
    .update({ auth_user_id: created.user.id })
    .eq('id', customerId)
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  return NextResponse.json({ email: customer.email, password })
}
