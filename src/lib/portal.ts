import { cache } from 'react'
import { createClient } from './supabase/server'
import { createServiceClient } from './supabase/service'
import { Customer } from './types'

// Elke aanroep van auth.getUser() is een netwerkrondje naar Supabase (~50ms).
// Layout én page vragen allebei "wie is dit?" binnen hetzelfde verzoek;
// React's cache() zorgt dat dat rondje dan maar één keer gemaakt wordt. De
// cache leeft alleen binnen één server-render, dus er lekt nooit een sessie
// van de ene bezoeker naar de andere.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

// Klantportaal-sessie: de sessie zelf komt (net als bij staff) uit de
// cookie-based client, maar de koppeling naar finka_customers loopt via de
// service-role client — dezelfde "server-side valideren, nooit rechtstreeks
// met open RLS praten"-aanpak als de rest van het portaal. Zie migratie-
// sectie 46 voor de achtergrond.
// Ook gecached: portaal-layout en -page roepen dit allebei aan, dat scheelde
// per paginabezoek twee overbodige rondjes (auth + klant-lookup).
export const getPortalCustomer = cache(
  async (): Promise<{ userId: string; customer: Customer } | null> => {
    const user = await getAuthUser()
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
)

// Staff-check voor het interne dashboard én voor API-routes die alleen
// staff mogen aanroepen (bv. het uitnodigen van een klant voor het portaal).
export const isStaffUser = cache(async (userId: string): Promise<boolean> => {
  const service = createServiceClient()
  const { data } = await service.from('finka_staff_users').select('id').eq('id', userId).maybeSingle()
  return !!data
})
