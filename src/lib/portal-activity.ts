import type { SupabaseClient } from '@supabase/supabase-js'
import type { PortalActivityType } from './types'

// Legt vast dat de klant iets heeft gedaan in het portaal, zodat staff dat
// op het project ziet (groen bolletje + meldingenblok). Wordt alleen vanuit
// de portaal-API-routes aangeroepen — zie migratie-sectie 63 voor waarom dit
// een eigen tabel is en niet uit updated_at wordt afgeleid.
//
// Best-effort: een mislukte melding mag de actie van de klant (antwoord
// opslaan, akkoord geven) nooit blokkeren.
export async function recordPortalActivity(
  service: SupabaseClient,
  {
    projectId,
    type,
    reference,
    description,
  }: {
    projectId: string
    type: PortalActivityType
    reference: string
    description: string
  }
): Promise<void> {
  try {
    const { error } = await service.from('finka_portal_activity').upsert(
      {
        project_id: projectId,
        type,
        reference,
        description,
        created_at: new Date().toISOString(),
        // Opnieuw ongelezen: werkt de klant hetzelfde onderwerp nog een keer
        // bij, dan moet staff dat weer zien.
        seen_at: null,
      },
      { onConflict: 'project_id,type,reference' }
    )
    if (error) throw error
  } catch (err) {
    console.error('Kon klantportaal-activiteit niet vastleggen:', err)
  }
}
