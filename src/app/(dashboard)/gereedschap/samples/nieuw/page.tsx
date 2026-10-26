export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SampleModel, Supplier } from '@/lib/types'
import { sampleMaterialOptions } from '@/lib/samples'
import NewSampleForm from './NewSampleForm'

export default async function NieuweSamplePage() {
  const supabase = await createClient()
  const [{ data: suppliers }, { data: models }, { data: usedMaterials }] = await Promise.all([
    supabase.from('finka_suppliers').select('*').order('name', { ascending: true }),
    supabase.from('finka_sample_models').select('*').order('name', { ascending: true }),
    supabase.from('finka_samples').select('material').not('material', 'is', null),
  ])

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <Link href="/gereedschap/samples" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar samples
      </Link>
      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-6">Nieuwe sample</h1>
      <NewSampleForm suppliers={(suppliers ?? []) as Supplier[]} models={(models ?? []) as SampleModel[]}
        materials={sampleMaterialOptions((usedMaterials ?? []).map((r) => r.material))}
      />
    </div>
  )
}
