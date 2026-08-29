export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Asset, OperatingExpense } from '@/lib/types'
import KostenView from './KostenView'

export default async function KostenPage() {
  const supabase = await createClient()
  const [{ data: expensesData }, { data: assetsData }] = await Promise.all([
    supabase.from('finka_operating_expenses').select('*').order('expense_date', { ascending: false }),
    supabase.from('finka_assets').select('*').order('purchase_date', { ascending: false }),
  ])

  return (
    <KostenView
      initialExpenses={(expensesData ?? []) as OperatingExpense[]}
      initialAssets={(assetsData ?? []) as Asset[]}
    />
  )
}
