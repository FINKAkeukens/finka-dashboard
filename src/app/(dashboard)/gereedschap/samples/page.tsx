export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sample } from '@/lib/types'
import {
  AVAILABILITY_COLORS,
  AVAILABILITY_LABELS,
  SampleAvailability,
  formatDate,
  normalizeSampleSettings,
  sampleAvailability,
  sampleStockText,
  sampleCategoryLabel,
  sampleFieldLabel,
} from '@/lib/samples'
import { LOAN_SELECT, LoanWithProject, loanBorrower } from './loan-borrower'
import ProjectLoanDeadlines, { ProjectLoanGroup } from './ProjectLoanDeadlines'

// "2× Carlijn & Noah (terug 1 dec), Jan" — meerdere exemplaren bij
// dezelfde lener met dezelfde datum samen.
function loanSummary(loans: LoanWithProject[]): string {
  const groups = new Map<string, number>()
  for (const l of loans) {
    const text = `${loanBorrower(l)}${l.due_date ? ` (terug ${formatDate(l.due_date)})` : ''}`
    groups.set(text, (groups.get(text) ?? 0) + 1)
  }
  return [...groups].map(([text, n]) => (n > 1 ? `${n}× ${text}` : text)).join(', ')
}

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

  const [{ data }, { data: settingsRow }] = await Promise.all([
    supabase
      .from('finka_samples')
      .select(`*, supplier:finka_suppliers(name), loans:finka_sample_loans(${LOAN_SELECT})`)
      .order('name', { ascending: true }),
    supabase.from('finka_sample_settings').select('*').maybeSingle(),
  ])
  const settings = normalizeSampleSettings(settingsRow)

  const rows = ((data ?? []) as SampleRow[]).map((s) => {
    const openLoans = s.loans.filter((l) => !l.returned_at)
    const quantity = s.quantity ?? 1
    return { ...s, quantity, openLoans, availability: sampleAvailability(openLoans, quantity), stockText: sampleStockText(openLoans, quantity) }
  })

  // Bij meerdere exemplaren kan een sample tegelijk beschikbaar en (deels)
  // uitgeleend zijn — dan staat hij onder allebei.
  const inFilter = (r: (typeof rows)[number], f: string) =>
    f === 'beschikbaar'
      ? r.openLoans.length < r.quantity
      : f === 'uitgeleend'
        ? r.openLoans.length > 0
        : f === 'te-laat'
          ? r.availability === 'te-laat'
          : true
  const counts = new Map(FILTERS.map((f) => [f.value, rows.filter((r) => inFilter(r, f.value)).length]))

  // Openstaande uitleningen per project, om de terugbrengdatum aan te passen
  // of samples in één keer terug te melden.
  const groupMap = new Map<string, ProjectLoanGroup>()
  for (const loan of rows.flatMap((r) => r.openLoans.map((l) => ({ ...l, sampleName: r.name })))) {
    if (!loan.project_id) continue
    const g = groupMap.get(loan.project_id) ?? {
      projectId: loan.project_id,
      name: loanBorrower(loan),
      loans: [],
      dueDate: loan.due_date,
      mixedDates: false,
    }
    if (g.loans.length && g.dueDate !== loan.due_date) g.mixedDates = true
    g.loans.push({ id: loan.id, sampleName: loan.sampleName, dueDate: loan.due_date })
    groupMap.set(loan.project_id, g)
  }
  const projectGroups = [...groupMap.values()]
    .map((g) => (g.mixedDates ? { ...g, dueDate: null } : g))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'))

  const search = q?.toLowerCase()
  const filtered = rows.filter((r) => {
    if (!inFilter(r, status)) return false
    if (!search) return true
    return (
      r.name.toLowerCase().includes(search) ||
      r.code?.toLowerCase().includes(search) ||
      r.model?.toLowerCase().includes(search) ||
      r.color?.toLowerCase().includes(search) ||
      r.finish?.toLowerCase().includes(search) ||
      r.supplier?.name.toLowerCase().includes(search) ||
      r.openLoans.some((l) => loanBorrower(l).toLowerCase().includes(search))
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

      <ProjectLoanDeadlines groups={projectGroups} />

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
                    <p className="text-sm font-medium text-[#1C1B19] truncate">
                      {r.quantity > 1 && <span className="text-[#6B6560] font-normal">{r.quantity} × </span>}
                      {r.name}
                    </p>
                    <p className="text-xs text-[#6B6560] truncate">
                      {[sampleCategoryLabel(settings, r.category), r.model, r.size && `${sampleFieldLabel(settings, 'size')} ${r.size}`, r.price_group && `PG ${r.price_group}`, r.material, r.veneer_execution, r.supplier?.name, r.code, r.color, r.finish].filter(Boolean).join(' · ')}
                    </p>
                    {r.openLoans.length > 0 && (
                      <p className="text-xs text-[#6B6560] truncate mt-0.5">
                        Bij {loanSummary(r.openLoans)}
                      </p>
                    )}
                  </div>
                  <span className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full', AVAILABILITY_COLORS[r.availability])}>
                      {AVAILABILITY_LABELS[r.availability]}
                    </span>
                    {r.stockText && <span className="text-[11px] text-[#6B6560]">{r.stockText}</span>}
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
