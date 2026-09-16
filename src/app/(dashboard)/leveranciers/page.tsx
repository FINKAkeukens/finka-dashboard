export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Supplier } from '@/lib/types'

export default async function LeveranciersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  const { data: suppliers } = await supabase
    .from('finka_suppliers')
    .select('*')
    .order('name', { ascending: true })

  const filtered = (suppliers ?? []).filter((s: Supplier) => {
    if (!q) return true
    const search = q.toLowerCase()
    return (
      s.name?.toLowerCase().includes(search) ||
      s.email?.toLowerCase().includes(search) ||
      s.phone?.toLowerCase().includes(search)
    )
  })

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Leveranciers</h1>
          <p className="text-sm text-[#6B6560] mt-0.5">{suppliers?.length ?? 0} leveranciers totaal</p>
        </div>
        <Link
          href="/leveranciers/nieuw"
          className="flex items-center gap-1.5 bg-[#1C1B19] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2D2C2A] transition-colors"
        >
          <Plus size={15} />
          Nieuwe leverancier
        </Link>
      </div>

      <form className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Zoek op naam, e-mail, telefoon..."
          className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] transition-colors"
        />
      </form>

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        {!filtered.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[#6B6560]">Geen leveranciers gevonden</p>
            <Link href="/leveranciers/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
              Leverancier toevoegen →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Naam</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">E-mail</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B6560]">Telefoon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD8D2]">
              {filtered.map((s: Supplier) => (
                <tr key={s.id} className="hover:bg-[#F7F5F2] transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/leveranciers/${s.id}`} className="font-medium text-[#1C1B19] hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[#6B6560]">{s.email || '—'}</td>
                  <td className="px-5 py-3.5 text-[#6B6560]">{s.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
