export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import EditApplianceForm from './EditApplianceForm'

export default async function AppliancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: appliance } = await supabase
    .from('finka_appliances')
    .select('*, supplier:finka_suppliers(id, name, email)')
    .eq('id', id)
    .single()

  if (!appliance) notFound()

  const { data: suppliers } = await supabase
    .from('finka_suppliers')
    .select('id, name')
    .order('name')

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/apparatuur" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar apparatuur
      </Link>
      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-6">
        {appliance.brand} {appliance.model}
      </h1>
      <EditApplianceForm appliance={appliance} suppliers={suppliers ?? []} />
    </div>
  )
}
