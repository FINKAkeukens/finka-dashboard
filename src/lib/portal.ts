import { cache } from 'react'
import { cookies } from 'next/headers'
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

export const PORTAL_PREVIEW_COOKIE = 'finka_portal_preview'

// Klantportaal-sessie: de sessie zelf komt (net als bij staff) uit de
// cookie-based client, maar de koppeling naar finka_customers loopt via de
// service-role client — dezelfde "server-side valideren, nooit rechtstreeks
// met open RLS praten"-aanpak als de rest van het portaal. Zie migratie-
// sectie 46 voor de achtergrond.
// Ook gecached: portaal-layout en -page roepen dit allebei aan, dat scheelde
// per paginabezoek twee overbodige rondjes (auth + klant-lookup).
export const getPortalCustomer = cache(
  async (): Promise<{ userId: string; customer: Customer; preview: boolean } | null> => {
    const user = await getAuthUser()
    if (!user) return null

    const service = createServiceClient()
    const { data: customer } = await service
      .from('finka_customers')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (customer) return { userId: user.id, customer: customer as Customer, preview: false }

    // "Bekijk als klant": staff opent het portaal van een klant via
    // /api/portaal/voorbeeld, dat deze cookie zet. Alleen geldig voor
    // staff — een klant (of wie dan ook) die de cookie zelf zet, komt hier
    // niet langs de isStaffUser-check. Alleen-lezen: de portaal-API-routes
    // zoeken de klant zelf op via auth_user_id en weigeren staff dus altijd.
    const previewCustomerId = (await cookies()).get(PORTAL_PREVIEW_COOKIE)?.value
    if (previewCustomerId && (await isStaffUser(user.id))) {
      const { data: previewCustomer } = await service
        .from('finka_customers')
        .select('*')
        .eq('id', previewCustomerId)
        .maybeSingle()
      if (previewCustomer) return { userId: user.id, customer: previewCustomer as Customer, preview: true }
    }
    return null
  }
)

// Staff-check voor het interne dashboard én voor API-routes die alleen
// staff mogen aanroepen (bv. het uitnodigen van een klant voor het portaal).
export const isStaffUser = cache(async (userId: string): Promise<boolean> => {
  const service = createServiceClient()
  const { data } = await service.from('finka_staff_users').select('id').eq('id', userId).maybeSingle()
  return !!data
})

// Toegangscheck voor de klant-facing routes die op een project-ID draaien
// (offerte, aansluitschema, en hun PDF-downloads): staff mag altijd, een
// ingelogde klant alleen als `projectCustomerId` overeenkomt met zijn eigen
// finka_customers-record. Zonder deze check kon elke ingelogde klant, puur
// door het project-ID in de URL te wijzigen, de offerte/aansluitschema van
// een andere klant bekijken en downloaden (IDOR).
export async function canAccessProject(projectCustomerId: string | null | undefined): Promise<boolean> {
  const user = await getAuthUser()
  if (!user) return false
  if (await isStaffUser(user.id)) return true
  const portalCustomer = await getPortalCustomer()
  return !!portalCustomer && portalCustomer.customer.id === projectCustomerId
}
