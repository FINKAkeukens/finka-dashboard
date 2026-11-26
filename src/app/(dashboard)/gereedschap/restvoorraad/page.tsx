export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { StockItem } from '@/lib/types'
import RestvoorraadView, { StockProject } from './RestvoorraadView'

export default async function RestvoorraadPage() {
  const supabase = await createClient()
  const [{ data: items, error }, { data: projects }] = await Promise.all([
    supabase.from('finka_stock_items').select('*').order('created_at', { ascending: false }),
    supabase
      .from('finka_projects')
      .select('id, reference_number, archived_at, customer:finka_customers(first_name, last_name)')
      .order('created_at', { ascending: false }),
  ])

  const stockProjects: StockProject[] = ((projects ?? []) as unknown as {
    id: string
    reference_number: string
    archived_at: string | null
    customer: { first_name: string; last_name: string } | null
  }[]).map((p) => ({
    id: p.id,
    name: `${p.reference_number} · ${p.customer ? `${p.customer.first_name} ${p.customer.last_name}`.trim() : '—'}`,
    archived: !!p.archived_at,
  }))

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Restvoorraad</h1>
        <p className="text-sm text-[#6B6560] mt-0.5">Spullen die over zijn, bijvoorbeeld van montages van andere keukens</p>
      </div>
      {error ? (
        <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-6">
          Nog geen tabel voor de restvoorraad gevonden — draai migratie 108 (finka_stock_items) in Supabase en herlaad deze pagina.
        </p>
      ) : (
        <RestvoorraadView initialItems={(items ?? []) as StockItem[]} projects={stockProjects} />
      )}
    </div>
  )
}
