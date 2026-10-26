export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sample, SampleModel, Supplier } from '@/lib/types'
import { AVAILABILITY_COLORS, AVAILABILITY_LABELS, SAMPLE_CATEGORY_LABELS, sampleAvailability, sampleMaterialOptions, VENEER_MATERIAL } from '@/lib/samples'
import { LOAN_SELECT, LoanWithProject } from '../loan-borrower'
import EditSampleForm from './EditSampleForm'
import SampleLoans, { ProjectOption } from './SampleLoans'

export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sample } = await supabase
    .from('finka_samples')
    .select('*, supplier:finka_suppliers(name)')
    .eq('id', id)
    .single() as { data: (Sample & { supplier: { name: string } | null }) | null }

  if (!sample) notFound()

  const [{ data: loans }, { data: suppliers }, { data: projects }, { data: models }, { data: usedMaterials }] = await Promise.all([

    supabase
      .from('finka_sample_loans')
      .select(LOAN_SELECT)
      .eq('sample_id', id)
      .order('lent_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('finka_suppliers').select('*').order('name', { ascending: true }),
    supabase
      .from('finka_projects')
      .select('id, title, customer:finka_customers(first_name, last_name)')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('finka_sample_models').select('*').order('name', { ascending: true }),
    supabase.from('finka_samples').select('material').not('material', 'is', null),
  ])

  const loanList = (loans ?? []) as LoanWithProject[]
  const availability = sampleAvailability(loanList.find((l) => !l.returned_at))

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <Link href="/gereedschap/samples" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar samples
      </Link>

      <div className="flex flex-col sm:flex-row gap-5 mb-6">
        {sample.photo_url && (
          <a href={sample.photo_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sample.photo_url} alt={sample.name} className="w-full sm:w-40 h-40 rounded-xl object-cover border border-[#DDD8D2]" />
          </a>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl font-semibold text-[#1C1B19]">{sample.name}</h1>
            <span className={cn('text-xs px-2 py-0.5 rounded-full', AVAILABILITY_COLORS[availability])}>
              {AVAILABILITY_LABELS[availability]}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mt-3">
            <dt className="text-[#6B6560]">Soort</dt>
            <dd className="text-[#1C1B19]">{SAMPLE_CATEGORY_LABELS[sample.category]}</dd>
            <dt className="text-[#6B6560]">Leverancier</dt>
            <dd className="text-[#1C1B19]">{sample.supplier?.name ?? '—'}</dd>
            <dt className="text-[#6B6560]">Model</dt>
            <dd className="text-[#1C1B19]">{sample.model || '—'}</dd>
            <dt className="text-[#6B6560]">Code</dt>
            <dd className="text-[#1C1B19]">{sample.code || '—'}</dd>
            <dt className="text-[#6B6560]">PG (prijsgroep)</dt>
            <dd className="text-[#1C1B19]">{sample.price_group || '—'}</dd>
            <dt className="text-[#6B6560]">Materiaal</dt>
            <dd className="text-[#1C1B19]">{sample.material || '—'}</dd>
            {sample.material === VENEER_MATERIAL && (
              <>
                <dt className="text-[#6B6560]">Uitvoering</dt>
                <dd className="text-[#1C1B19]">{sample.veneer_execution || '—'}</dd>
              </>
            )}
            <dt className="text-[#6B6560]">Kleur</dt>
            <dd className="text-[#1C1B19]">{sample.color || '—'}</dd>
            <dt className="text-[#6B6560]">Afwerking</dt>
            <dd className="text-[#1C1B19]">{sample.finish || '—'}</dd>
            <dt className="text-[#6B6560]">Maat</dt>
            <dd className="text-[#1C1B19]">{sample.size ?? '—'}</dd>
          </dl>
        </div>
      </div>

      <div className="mb-8">
        <EditSampleForm sample={sample} suppliers={(suppliers ?? []) as Supplier[]} models={(models ?? []) as SampleModel[]}
          materials={sampleMaterialOptions((usedMaterials ?? []).map((r) => r.material))}
        />
      </div>

      <h2 className="text-sm font-medium text-[#1C1B19] mb-3">Uitlenen</h2>
      <SampleLoans sampleId={id} loans={loanList} projects={(projects ?? []) as unknown as ProjectOption[]} />
    </div>
  )
}
