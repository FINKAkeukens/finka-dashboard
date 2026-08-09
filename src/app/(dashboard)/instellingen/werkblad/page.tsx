export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { WerkbladRates } from '@/lib/types'
import WerkbladRatesForm from './WerkbladRatesForm'

export default async function WerkbladInstellingenPage() {
  const supabase = await createClient()
  const { data: rates } = await supabase
    .from('finka_werkblad_rates')
    .select('*')
    .limit(1)
    .maybeSingle() as { data: WerkbladRates | null }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Werkblad-prijzen</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Richtprijzen voor de werkblad-rekentool (materiaal per m², uitsparingen, diensten). Een wijziging hier geldt direct voor nieuwe berekeningen in elke offerte en in de losse rekentool.
        </p>
      </div>
      <WerkbladRatesForm rates={rates} />
    </div>
  )
}
