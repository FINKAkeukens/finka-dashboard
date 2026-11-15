import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Toegangscheck voor de portaal-API van de keuzemodule: ingelogde klant,
// project van die klant, en de module staat voor dat project aan. Staff in
// "Bekijk als klant" komt hier niet langs (alleen-lezen).
export async function klantProject(projectId: unknown): Promise<
  | { ok: true; service: ReturnType<typeof createServiceClient>; projectId: string }
  | { ok: false; status: number; error: string }
> {
  if (typeof projectId !== 'string' || !/^[0-9a-f-]{36}$/.test(projectId)) {
    return { ok: false, status: 400, error: 'Ongeldig project' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Niet ingelogd' }

  const service = createServiceClient()
  const { data: customer } = await service.from('finka_customers').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!customer) return { ok: false, status: 403, error: 'Geen klant-account' }

  const { data: project } = await service
    .from('finka_projects')
    .select('customer_id, keuzemodule_actief')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.customer_id !== customer.id || !project.keuzemodule_actief) {
    return { ok: false, status: 403, error: 'Geen toegang tot dit project' }
  }
  return { ok: true, service, projectId }
}

// Keuzes zijn klein (tientallen kasten); alles daarboven is geen normaal gebruik.
export const MAX_KEUZES_BYTES = 200_000
