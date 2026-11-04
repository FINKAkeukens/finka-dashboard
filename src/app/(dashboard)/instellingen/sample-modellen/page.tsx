export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { SampleModel, Supplier } from '@/lib/types'
import { normalizeSampleSettings } from '@/lib/samples'
import SampleSettingsEditor, { SampleUsage } from './SampleSettingsEditor'

export default async function SampleInstellingenPage() {
  const supabase = await createClient()
  const [{ data: models }, { data: suppliers }, { data: settingsRow }, { data: samples }] = await Promise.all([
    supabase.from('finka_sample_models').select('*').order('name', { ascending: true }),
    supabase.from('finka_suppliers').select('*').order('name', { ascending: true }),
    supabase.from('finka_sample_settings').select('*').maybeSingle(),
    supabase.from('finka_samples').select('category, supplier_id, size, material'),
  ])

  const usage: SampleUsage = { categories: {}, suppliers: {}, sizes: {}, materials: {} }
  const bump = (map: Record<string, number>, key: string | null) => {
    if (key) map[key] = (map[key] ?? 0) + 1
  }
  for (const s of samples ?? []) {
    bump(usage.categories, s.category)
    bump(usage.suppliers, s.supplier_id)
    bump(usage.sizes, s.size)
    bump(usage.materials, s.material)
  }
  // Een soort met modellen eraan is ook in gebruik.
  for (const m of models ?? []) bump(usage.categories, m.category)

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Sample instellingen</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Alles van het sampleformulier: de namen van de velden en de keuzes in de keuzelijsten.
        </p>
      </div>
      <SampleSettingsEditor
        settings={normalizeSampleSettings(settingsRow)}
        models={(models ?? []) as SampleModel[]}
        suppliers={(suppliers ?? []) as Supplier[]}
        usage={usage}
      />
    </div>
  )
}
