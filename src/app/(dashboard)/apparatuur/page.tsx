export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Appliance } from '@/lib/types'
import ApplianceLibrary from './ApplianceLibrary'

export default async function ApparatuurPage() {
  const supabase = await createClient()

  const { data: appliances } = await supabase
    .from('finka_appliances')
    .select('*, supplier:finka_suppliers(id, name, email)')
    .order('type')
    .order('brand')

  const { count: inboxCount } = await supabase
    .from('finka_email_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Apparatuur</h1>
          <p className="mt-0.5 text-sm text-[#6B6560]">
            {appliances?.length ?? 0} producten · kies een categorie of zoek direct
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/apparatuur/inbox"
            className="flex items-center gap-1.5 bg-white text-[#1C1B19] text-sm px-4 py-2 rounded-lg border border-[#DDD8D2] hover:border-[#1C1B19] transition-colors">
            Offerte inbox
            {(inboxCount ?? 0) > 0 && (
              <span className="bg-[#C9A96E] text-white text-xs px-1.5 py-0.5 rounded-full">{inboxCount}</span>
            )}
          </Link>
          <Link href="/apparatuur/nieuw"
            className="flex items-center gap-1.5 bg-[#1C1B19] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2D2C2A] transition-colors">
            <Plus size={15} />
            Toevoegen
          </Link>
        </div>
      </div>

      <ApplianceLibrary appliances={(appliances ?? []) as Appliance[]} />
    </div>
  )
}
