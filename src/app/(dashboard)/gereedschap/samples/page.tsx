export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sample } from '@/lib/types'
import {
  AVAILABILITY_COLORS,
  AVAILABILITY_LABELS,
  SAMPLE_CATEGORY_LABELS,
  SampleAvailability,
  formatDate,
  sampleAvailability,
} from '@/lib/samples'
import { LOAN_SELECT, LoanWithProject, loanBorrower } from './loan-borrower'

type SampleRow = Sample & { supplier: { name: string } | null; loans: LoanWithProject[] }

const FILTERS: { value: SampleAvailability | 'alle'; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'beschikbaar', label: 'Beschikbaar' },
  { value: 'uitgeleend', label: 'Uitgeleend' },
  { value: 'te-laat', label: 'Te laat terug' },
]

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status = 'alle' } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('finka_samples')
    .select(`*, supplier:finka_suppliers(name), loans:finka_sample_loans(${LOAN_SELECT})`)
    .order('name', { ascending: true })

  const rows = ((data ?? []) as SampleRow[]).map((s) => {
    const openLoan = s.loans.find((l) => !l.returned_at) ?? null
    return { ...s, openLoan, availability: sampleAvailability(openLoan) }
  })

  const counts = new Map<string, number>([['alle', rows.length]])
  for (const r of rows) {
    counts.set(r.availability, (counts.get(r.availability) ?? 0) + 1)
    // "Te laat terug" ligt ook uit — telt mee bij Uitgeleend.
    if (r.availability === 'te-laat') counts.set('uitgeleend', (counts.get('uitgeleend') ?? 0) + 1)
  }

  const search = q?.toLowerCase()
  const filtered = rows.filter((r) => {
    if (status === 'uitgeleend' && r.availability === 'beschikbaar') return false
    if (status !== 'alle' && status !== 'uitgeleend' && r.availability !== status) return false
    if (!search) return true
    return (
      r.name.toLowerCase().includes(search) ||
      r.code?.toLowerCase().includes(search) ||
      r.model?.toLowerCase().includes(search) ||
      r.color?.toLowerCase().includes(search) ||
      r.finish?.toLowerCase().includes(search) ||
      r.supplier?.name.toLowerCase().includes(search) ||
      (r.openLoan && loanBorrower(r.openLoan).toLowerCase().includes(search))
    )
  })

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Samples</h1>
          <p className="text-sm text-[#6B6560] mt-0.5">Stalen en bij wie ze liggen</p>
        </div>
        <Link
          href="/gereedschap/samples/nieuw"
          className="flex items-center gap-1.5 bg-[#1C1B19] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#2D2C2A] transition-colors shrink-0"
        >
          <Plus size={15} />
          Nieuwe sample
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={{ pathname: '/gereedschap/samples', query: { ...(q ? { q } : {}), ...(f.value !== 'alle' ? { status: f.value } : {}) } }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-colors',
              status === f.value
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#C9A96E]'
            )}
          >
            {f.label} <span className="opacity-70">{counts.get(f.value) ?? 0}</span>
          </Link>
        ))}
      </div>

      <form className="relative mb-5">
        {status !== 'alle' && <input type="hidden" name="status" value={status} />}
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Zoek op naam, model, code, kleur, leverancier of klant..."
          className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] transition-colors"
        />
      </form>

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        {!filtered.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[#6B6560]">Geen samples gevonden</p>
            {!rows.length && (
              <Link href="/gereedschap/samples/nieuw" className="text-sm text-[#C9A96E] hover:underline mt-1 inline-block">
                Sample toevoegen →
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[#DDD8D2]">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link href={`/gereedschap/samples/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[#F7F5F2] transition-colors">
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="" className="w-12 h-12 rounded-md object-cover border border-[#DDD8D2] shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-[#F0EDE9] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#1C1B19] truncate">{r.name}</p>
                    <p className="text-xs text-[#6B6560] truncate">
                      {[SAMPLE_CATEGORY_LABELS[r.category], r.model, r.size && `Maat ${r.size}`, r.price_group && `PG ${r.price_group}`, r.material, r.veneer_execution, r.supplier?.name, r.code, r.color, r.finish].filter(Boolean).join(' · ')}
                    </p>
                    {r.openLoan && (
                      <p className="text-xs text-[#6B6560] truncate mt-0.5">
                        Bij {loanBorrower(r.openLoan)}
                        {r.openLoan.due_date && ` · terug ${formatDate(r.openLoan.due_date)}`}
                      </p>
                    )}
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', AVAILABILITY_COLORS[r.availability])}>
                    {AVAILABILITY_LABELS[r.availability]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
