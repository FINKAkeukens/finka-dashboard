export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { SampleModel, Supplier } from '@/lib/types'
import SampleModelsEditor from './SampleModelsEditor'

export default async function SampleModellenPage() {
  const supabase = await createClient()
  const [{ data: models }, { data: suppliers }] = await Promise.all([
    supabase.from('finka_sample_models').select('*').order('name', { ascending: true }),
    supabase.from('finka_suppliers').select('*').order('name', { ascending: true }),
  ])

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Sample-modellen</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Modellen per leverancier en soort. Kies je bij een sample die leverancier en soort, dan wordt Model een
          keuzelijst en vult de PG zich vanzelf in. Een wijziging hier verandert al opgeslagen samples niet.
        </p>
      </div>
      <SampleModelsEditor models={(models ?? []) as SampleModel[]} suppliers={(suppliers ?? []) as Supplier[]} />
    </div>
  )
}
