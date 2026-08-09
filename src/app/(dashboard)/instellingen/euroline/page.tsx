export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { EurolineRates } from '@/lib/types'
import EurolineRatesForm from './EurolineRatesForm'

export default async function EurolineInstellingenPage() {
  const supabase = await createClient()
  const { data: rates } = await supabase
    .from('finka_euroline_rates')
    .select('*')
    .limit(1)
    .maybeSingle() as { data: EurolineRates | null }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Euroline-tarieven</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Deze tarieven voeden de Euroline-rekentool in elke offerte. Een wijziging hier geldt direct voor nieuwe berekeningen in alle projecten.
        </p>
      </div>
      <EurolineRatesForm rates={rates} />
    </div>
  )
}
