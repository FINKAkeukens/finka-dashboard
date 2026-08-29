import { createClient } from './supabase/server'
import { createServiceClient } from './supabase/service'
import { Customer } from './types'

// Klantportaal-sessie: de sessie zelf komt (net als bij staff) uit de
// cookie-based client, maar de koppeling naar finka_customers loopt via de
// service-role client — dezelfde "server-side valideren, nooit rechtstreeks
// met open RLS praten"-aanpak als de rest van het portaal. Zie migratie-
// sectie 46 voor de achtergrond.
export async function getPortalCustomer(): Promise<{ userId: string; customer: Customer } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()
  const { data: customer } = await service
    .from('finka_customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!customer) return null

  return { userId: user.id, customer: customer as Customer }
}

// Staff-check voor het interne dashboard én voor API-routes die alleen
// staff mogen aanroepen (bv. het uitnodigen van een klant voor het portaal).
export async function isStaffUser(userId: string): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service.from('finka_staff_users').select('id').eq('id', userId).maybeSingle()
  return !!data
}
