export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import type { StandardDocument } from '@/lib/types'
import StandardDocumentsForm from './StandardDocumentsForm'

export default async function StandaardDocumentenPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('finka_standard_documents')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Standaarddocumenten</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Deze documenten staan automatisch bij élk project in het klantenportaal (tabblad Documenten), zoals de
          algemene voorwaarden en onderhoudsinstructies. Komt er een nieuwe versie, gebruik dan &quot;Nieuwe versie&quot;
          met een ingangsdatum: klanten die vóór die datum akkoord gaven op hun offerte, blijven de versie zien die toen
          gold. Met &quot;Bovenaan in portaal&quot; staat een document direct bij het openen van het portaal in beeld, met
          een downloadknop (bedoeld voor de algemene voorwaarden). Met &quot;Voor wie&quot; bepaal je of een document voor iedereen is of alleen voor consumenten
          (B2C) of bedrijven (B2B) — welk type een klant is, stel je in op de klantkaart.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
          Kon de standaarddocumenten niet laden ({error.message}). Is migratie-sectie 81 al uitgevoerd in Supabase?
        </p>
      ) : (
        <StandardDocumentsForm documents={(data ?? []) as StandardDocument[]} />
      )}
    </div>
  )
}
