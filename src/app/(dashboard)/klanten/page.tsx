export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Customer } from '@/lib/types'

const statusColors: Record<string, string> = {
  prospect: 'bg-blue-50 text-blue-700 border-blue-100',
  actief: 'bg-green-50 text-green-700 border-green-100',
  afgerond: 'bg-gray-100 text-gray-600 border-gray-200',
  'on-hold': 'bg-amber-50 text-amber-700 border-amber-100',
}
const statusLabels: Record<string, string> = {
  prospect: 'Prospect', actief: 'Actief', afgerond: 'Afgerond', 'on-hold': 'On hold',
}

export default async function KlantenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('finka_customers')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && status !== 'alle') query = query.eq('status', status)

  const { data: customers } = await query
  const filtered = customers?.filter(c => {
    if (!q) return true
    const search = q.toLowerCase()
    return (
      c.first_name?.toLowerCase().includes(search) ||
      c.last_name?.toLowerCase().includes(search) ||
      c.reference_number?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search) ||
      c.city?.toLowerCase().includes(search)
    )
  }) as Customer[]

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Klanten</h1>
          <p className="text-sm text-[#6B6560] mt-0.5">{customers?.length ?? 0} klanten totaal</p>
        </div>
        <Link
          href="/klanten/nieuw"
          className="flex items-center gap-1.5 bg-[#1C1B19] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2D2C2A] transition-colors"
        >
          <Plus size={15} />
          Nieuwe klant
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <form className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Zoek op naam, referentie, stad..."
            className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] transition-colors"
          />
        </form>
        <div className="flex gap-1">
          {['alle', 'prospect', 'actief', 'on-hold', 'afgerond'].map(s => (
            <Link
              key={s}
              href={`/klanten?${q ? `q=${q}&` : ''}status=${s}`}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                (status ?? 'alle') === s
                  ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                  : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
              }`}
            >
              {s === 'alle' ? 'Alle' : statusLabels[s]}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        {!filtered?.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[#6B6560]">Geen klanten gevonden</p>
            <Link href="/klanten/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
              Klant toevoegen →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Referentie</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Naam</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Stad</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Telefoon</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Toegevoegd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD8D2]">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-[#F7F5F2] transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/klanten/${c.id}`} className="font-mono text-xs text-[#6B6560] hover:text-[#1C1B19]">
                      {c.reference_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/klanten/${c.id}`} className="font-medium text-[#1C1B19] hover:underline">
                      {c.first_name} {c.last_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[#6B6560]">{c.city || '—'}</td>
                  <td className="px-5 py-3.5 text-[#6B6560]">{c.phone || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[c.status]}`}>
                      {statusLabels[c.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#6B6560] text-xs">
                    {new Date(c.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
