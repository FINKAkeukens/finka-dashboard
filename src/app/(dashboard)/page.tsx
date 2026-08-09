export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Users, Zap, Mail, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ count: customerCount }, { count: applianceCount }, { count: inboxCount }] = await Promise.all([
    supabase.from('finka_customers').select('*', { count: 'exact', head: true }),
    supabase.from('finka_appliances').select('*', { count: 'exact', head: true }),
    supabase.from('finka_email_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const { data: recentCustomers } = await supabase
    .from('finka_customers')
    .select('id, reference_number, first_name, last_name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const stats = [
    { label: 'Klanten', value: customerCount ?? 0, icon: Users, href: '/klanten', color: 'text-blue-600' },
    { label: 'Apparatuur', value: applianceCount ?? 0, icon: Zap, href: '/apparatuur', color: 'text-amber-600' },
    { label: 'Inbox te verwerken', value: inboxCount ?? 0, icon: Mail, href: '/apparatuur/inbox', color: 'text-green-600' },
  ]

  const statusLabels: Record<string, string> = {
    prospect: 'Prospect',
    actief: 'Actief',
    afgerond: 'Afgerond',
    'on-hold': 'On hold',
  }

  const statusColors: Record<string, string> = {
    prospect: 'bg-blue-50 text-blue-700',
    actief: 'bg-green-50 text-green-700',
    afgerond: 'bg-gray-100 text-gray-600',
    'on-hold': 'bg-amber-50 text-amber-700',
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Dashboard</h1>
        <p className="text-sm text-[#6B6560] mt-1">Welkom terug bij FINKA</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, href, color }) => (
          <Link key={href} href={href} className="bg-white rounded-xl border border-[#DDD8D2] p-5 hover:border-[#C9A96E] transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#6B6560]">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className="text-3xl font-semibold text-[#1C1B19]">{value}</p>
          </Link>
        ))}
      </div>

      {/* Recent customers */}
      <div className="bg-white rounded-xl border border-[#DDD8D2]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DDD8D2]">
          <h2 className="text-sm font-medium text-[#1C1B19]">Recente klanten</h2>
          <Link href="/klanten" className="text-xs text-[#6B6560] hover:text-[#1C1B19]">
            Alle klanten →
          </Link>
        </div>
        {!recentCustomers?.length ? (
          <div className="px-6 py-10 text-center">
            <TrendingUp size={24} className="mx-auto text-[#DDD8D2] mb-2" />
            <p className="text-sm text-[#6B6560]">Nog geen klanten toegevoegd</p>
            <Link href="/klanten/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
              Eerste klant toevoegen →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#DDD8D2]">
            {recentCustomers.map(c => (
              <Link key={c.id} href={`/klanten/${c.id}`} className="flex items-center justify-between px-6 py-3.5 hover:bg-[#F7F5F2] transition-colors">
                <div>
                  <span className="text-sm font-medium text-[#1C1B19]">{c.first_name} {c.last_name}</span>
                  <span className="text-xs text-[#6B6560] ml-2">{c.reference_number}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[c.status]}`}>
                  {statusLabels[c.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
