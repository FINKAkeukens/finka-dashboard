export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { WerkbladRates } from '@/lib/types'
import WerkbladToolClient from './WerkbladToolClient'

export default async function WerkbladToolPage() {
  const supabase = await createClient()
  const { data: rates } = await supabase
    .from('finka_werkblad_rates')
    .select('*')
    .limit(1)
    .maybeSingle() as { data: WerkbladRates | null }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Werkblad-rekentool</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Snel een richtprijs berekenen, los van een project. Tarieven pas je aan bij{' '}
          <a href="/instellingen/werkblad" className="text-[#C9A96E] hover:underline">Instellingen → Werkblad-prijzen</a>.
        </p>
      </div>
      {rates ? (
        <WerkbladToolClient rates={rates} />
      ) : (
        <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-6">
          Nog geen tarievenrij gevonden — draai de laatste migratie (finka_werkblad_rates) in Supabase.
        </p>
      )}
    </div>
  )
}
