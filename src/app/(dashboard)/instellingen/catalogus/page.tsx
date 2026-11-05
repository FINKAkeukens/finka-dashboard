export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import CatalogusVernieuwen, { type CatalogusInfo } from './CatalogusVernieuwen'

export default async function CatalogusPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finka_catalogi')
    .select('id, titel, bestandsnaam, actief, aantallen, waarschuwingen, ingelezen_at')
    .order('ingelezen_at', { ascending: false })
    .limit(10)

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Catalogus</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          De Sachsenküchen-catalogus (SK130) waaruit de keuzemodule in het klantportaal haalt: binnenkleuren,
          werkbladdecors, grepen, modellen met prijsgroep, kastprijzen en accessoires. Komt er een nieuwe catalogus
          uit, lees dan de PDF hier opnieuw in.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
          Kon de catalogus niet laden ({error.message}). Is migratie-sectie 100 al uitgevoerd in Supabase?
        </p>
      ) : (
        <CatalogusVernieuwen catalogi={(data ?? []) as CatalogusInfo[]} />
      )}
    </div>
  )
}
