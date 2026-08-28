export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import Link from 'next/link'
import { formatPrice } from '@/lib/appliance-utils'
import { TEST_CUSTOMER_ID } from '@/lib/constants'

// Eén geaccordeerde offerte, met net genoeg projectgegevens om 'm in de
// tabel te tonen — geen volledig Quote-type nodig voor deze pagina.
interface AkkoordQuoteRow {
  id: string
  project_id: string
  akkoord_at: string | null
  created_at: string
  total_price: number
  customer_price: number | null
  subtotal: number
  btw_percentage: number
  project: {
    id: string
    reference_number: string
    title: string
    customer_id: string
    customer: { id: string; first_name: string; last_name: string } | null
  } | null
}

interface ProjectFigures {
  quoteId: string
  projectId: string
  reference: string
  title: string
  customerName: string
  date: Date
  // Omzet = wat de klant betaalt (prijsindicatie-override, anders het
  // interne totaal), incl. btw — zelfde bedrag als op de klant-PDF.
  omzetInclBtw: number
  // Kostprijs = som van de werkelijke kosten in de interne kostprijs-
  // opbouw (subtotal), dus zonder marge en zonder btw.
  kostprijs: number
  // Marge = omzet zonder btw min kostprijs — ruwe brutomarge-indicatie,
  // geen boekhoudkundig sluitende winst-en-verliesrekening.
  margeExclBtw: number
}

interface Totals {
  omzetInclBtw: number
  kostprijs: number
  margeExclBtw: number
  aantal: number
}

function emptyTotals(): Totals {
  return { omzetInclBtw: 0, kostprijs: 0, margeExclBtw: 0, aantal: 0 }
}

function addToTotals(t: Totals, p: ProjectFigures): Totals {
  return {
    omzetInclBtw: t.omzetInclBtw + p.omzetInclBtw,
    kostprijs: t.kostprijs + p.kostprijs,
    margeExclBtw: t.margeExclBtw + p.margeExclBtw,
    aantal: t.aantal + 1,
  }
}

function margePercentage(t: Totals): number {
  return t.kostprijs > 0 ? Math.round((t.margeExclBtw / t.kostprijs) * 100) : 0
}

export default async function FinancieelPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('finka_quotes')
    .select(
      'id, project_id, akkoord_at, created_at, total_price, customer_price, subtotal, btw_percentage, project:finka_projects(id, reference_number, title, customer_id, customer:finka_customers(id, first_name, last_name))'
    )
    .eq('status', 'akkoord')
    .is('archived_at', null)

  const rows = ((data ?? []) as unknown as AkkoordQuoteRow[]).filter((r) => r.project && r.project.customer_id !== TEST_CUSTOMER_ID)

  const projects: ProjectFigures[] = rows.map((r) => {
    const omzetInclBtw = r.customer_price ?? r.total_price ?? 0
    const kostprijs = r.subtotal ?? 0
    const omzetExclBtw = omzetInclBtw / (1 + (r.btw_percentage ?? 21) / 100)
    return {
      quoteId: r.id,
      projectId: r.project_id,
      reference: r.project?.reference_number ?? '—',
      title: r.project?.title ?? 'Onbekend project',
      customerName: r.project?.customer ? `${r.project.customer.first_name} ${r.project.customer.last_name}` : '—',
      date: new Date(r.akkoord_at ?? r.created_at),
      omzetInclBtw,
      kostprijs,
      margeExclBtw: omzetExclBtw - kostprijs,
    }
  }).sort((a, b) => b.date.getTime() - a.date.getTime())

  // Groeperen: jaar → maand → projecten. Alleen jaren/maanden met
  // daadwerkelijk geaccordeerde offertes verschijnen.
  const years = new Map<number, { total: Totals; months: Map<string, { label: string; total: Totals; projects: ProjectFigures[] }> }>()

  for (const p of projects) {
    const year = p.date.getFullYear()
    const monthKey = format(p.date, 'yyyy-MM')
    if (!years.has(year)) years.set(year, { total: emptyTotals(), months: new Map() })
    const yearEntry = years.get(year)!
    yearEntry.total = addToTotals(yearEntry.total, p)

    if (!yearEntry.months.has(monthKey)) {
      yearEntry.months.set(monthKey, { label: format(p.date, 'MMMM', { locale: nl }), total: emptyTotals(), projects: [] })
    }
    const monthEntry = yearEntry.months.get(monthKey)!
    monthEntry.total = addToTotals(monthEntry.total, p)
    monthEntry.projects.push(p)
  }

  const sortedYears = [...years.entries()].sort((a, b) => b[0] - a[0])
  const grandTotal = projects.reduce((t, p) => addToTotals(t, p), emptyTotals())

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Financieel</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Omzet en marge van geaccordeerde offertes, per jaar en maand. &quot;Omzet&quot; is wat de klant betaalt (incl. btw); &quot;Kostprijs&quot; komt uit de interne kostprijs-opbouw per offerte (excl. marge en btw).
        </p>
      </div>

      {!projects.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Nog geen geaccordeerde offertes om te rapporteren.</p>
        </div>
      ) : (
        <>
          {/* Totaal over alle jaren heen */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
              <span className="text-sm text-[#6B6560]">Totale omzet</span>
              <p className="text-2xl font-semibold text-[#1C1B19] mt-1">{formatPrice(grandTotal.omzetInclBtw)}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
              <span className="text-sm text-[#6B6560]">Totale kostprijs</span>
              <p className="text-2xl font-semibold text-[#1C1B19] mt-1">{formatPrice(grandTotal.kostprijs)}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
              <span className="text-sm text-[#6B6560]">Marge</span>
              <p className="text-2xl font-semibold text-[#1C1B19] mt-1">{formatPrice(grandTotal.margeExclBtw)}</p>
              <span className="text-xs text-[#9A948D]">{margePercentage(grandTotal)}% van kostprijs</span>
            </div>
            <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
              <span className="text-sm text-[#6B6560]">Geaccordeerde projecten</span>
              <p className="text-2xl font-semibold text-[#1C1B19] mt-1">{grandTotal.aantal}</p>
            </div>
          </div>

          <div className="space-y-8">
            {sortedYears.map(([year, yearEntry]) => {
              const sortedMonths = [...yearEntry.months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
              return (
                <div key={year}>
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-lg font-semibold text-[#1C1B19]">{year}</h2>
                    <div className="text-sm text-[#6B6560]">
                      {formatPrice(yearEntry.total.omzetInclBtw)} omzet · {formatPrice(yearEntry.total.margeExclBtw)} marge ({margePercentage(yearEntry.total)}%) · {yearEntry.total.aantal} projecten
                    </div>
                  </div>

                  <div className="space-y-4">
                    {sortedMonths.map(([monthKey, monthEntry]) => (
                      <div key={monthKey} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
                        <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2] flex items-center justify-between">
                          <h3 className="text-sm font-medium text-[#1C1B19] capitalize">{monthEntry.label} {year}</h3>
                          <span className="text-xs text-[#6B6560]">
                            {formatPrice(monthEntry.total.omzetInclBtw)} omzet · {formatPrice(monthEntry.total.margeExclBtw)} marge ({margePercentage(monthEntry.total)}%) · {monthEntry.total.aantal} projecten
                          </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#DDD8D2]">
                              <th className="text-left px-5 py-2 text-xs font-medium text-[#6B6560]">Project</th>
                              <th className="text-left px-5 py-2 text-xs font-medium text-[#6B6560]">Klant</th>
                              <th className="text-left px-5 py-2 text-xs font-medium text-[#6B6560] w-28">Akkoord op</th>
                              <th className="text-right px-5 py-2 text-xs font-medium text-[#6B6560] w-32">Omzet</th>
                              <th className="text-right px-5 py-2 text-xs font-medium text-[#6B6560] w-32">Kostprijs</th>
                              <th className="text-right px-5 py-2 text-xs font-medium text-[#6B6560] w-32">Marge</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#DDD8D2]">
                            {monthEntry.projects.map((p) => (
                              <tr key={p.quoteId}>
                                <td className="px-5 py-2.5">
                                  <Link href={`/projecten/${p.projectId}`} className="text-[#1C1B19] hover:underline font-medium">
                                    {p.title}
                                  </Link>
                                  <span className="block text-xs text-[#9A948D] font-mono">{p.reference}</span>
                                </td>
                                <td className="px-5 py-2.5 text-[#6B6560]">{p.customerName}</td>
                                <td className="px-5 py-2.5 text-[#6B6560]">{format(p.date, 'd MMM yyyy', { locale: nl })}</td>
                                <td className="px-5 py-2.5 text-right text-[#1C1B19]">{formatPrice(p.omzetInclBtw)}</td>
                                <td className="px-5 py-2.5 text-right text-[#6B6560]">{formatPrice(p.kostprijs)}</td>
                                <td className="px-5 py-2.5 text-right font-medium text-[#1C1B19]">{formatPrice(p.margeExclBtw)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
