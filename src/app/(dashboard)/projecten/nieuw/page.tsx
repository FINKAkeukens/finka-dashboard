export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import NewProjectForm from './NewProjectForm'

export default async function NieuwProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string }>
}) {
  const { customer_id } = await searchParams
  const supabase = await createClient()

  const [{ data: customers }, { data: statuses }] = await Promise.all([
    supabase.from('finka_customers').select('id, first_name, last_name').order('first_name'),
    supabase.from('finka_project_statuses').select('*').order('sort_order'),
  ])

  return (
    <NewProjectForm
      customers={customers ?? []}
      statuses={statuses ?? []}
      defaultCustomerId={customer_id}
    />
  )
}
