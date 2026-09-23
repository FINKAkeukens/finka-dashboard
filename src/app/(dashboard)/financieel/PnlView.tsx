'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/appliance-utils'
import { selectOnFocus } from '@/lib/utils'

export interface ProjectFigures {
  quoteId: string
  projectId: string
  reference: string
  title: string
  customerName: string
  dateLabel: string
  year: number
  monthKey: string
  monthLabel: string
  // Omzet = wat de klant betaalt (prijsindicatie-override, anders het
  // interne totaal), incl. btw — zelfde bedrag als op de klant-PDF.
  omzetInclBtw: number
  omzetExclBtw: number
  // Kostprijs = som van de werkelijke kosten in de interne kostprijs-
  // opbouw (subtotal), dus zonder marge en zonder btw. Staat niet meer als
  // kolom in de tabel, maar voedt nog wel de winst-en-verliesrekening
  // onderaan ("Kostprijs van de omzet").
  kostprijs: number
  // Marge begroot = omzet zonder btw min de begrote kostprijs — ruwe
  // brutomarge-indicatie, geen boekhoudkundig sluitende w&v-rekening.
  margeExclBtw: number
  // Werkelijke kosten uit het Financieel-tabblad van het project (begroot vs.
  // werkelijk). Zonder ingevulde rijen gelijk aan de begrote kostprijs, zodat
  // "marge werkelijk" dan hetzelfde toont i.p.v. de volle omzet.
  werkelijkeKosten: number
  margeWerkelijk: number
}

export interface Totals {
  omzetInclBtw: number
  omzetExclBtw: number
  kostprijs: number
  margeExclBtw: number
  werkelijkeKosten: number
  margeWerkelijk: number
  aantal: number
}

export interface MonthData {
  key: string
  label: string
  total: Totals
  projects: ProjectFigures[]
}

export interface YearData {
  year: number
  total: Totals
  months: MonthData[]
  bedrijfskosten: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function margePercentage(t: Totals): number {
  return t.kostprijs > 0 ? Math.round((t.margeExclBtw / t.kostprijs) * 100) : 0
}

export default function PnlView({
  years,
  grandTotal,
  initialBelastingPercentage,
}: {
  years: YearData[]
  grandTotal: Totals
  initialBelastingPercentage: number
}) {
  const supabase = createClient()
  const [belastingPercentage, setBelastingPercentage] = useState(initialBelastingPercentage)
  const [error, setError] = useState('')

  async function saveBelastingPercentage(value: number) {
    setBelastingPercentage(value)
    const { data: existing } = await supabase.from('finka_financial_settings').select('id').limit(1).maybeSingle()
    const { error: updError } = existing
      ? await supabase.from('finka_financial_settings').update({ belasting_percentage: value, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await supabase.from('finka_financial_settings').insert({ belasting_percentage: value })
    if (updError) setError(updError.message)
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Financieel overzicht projecten</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Winst- en verliesrekening op basis van geaccordeerde offertes, per jaar en maand. &quot;Omzet&quot; is wat de klant betaalt, zonder btw; &quot;Kostprijs&quot; komt uit de interne kostprijs-opbouw per offerte. Zo is de marge overal gewoon omzet min kostprijs. Bedrijfskosten beheer je op de{' '}
          <Link href="/financieel/kosten" className="text-[#C9A96E] hover:underline">Kosten-pagina</Link>.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 mb-4">{error}</p>}

      {!years.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Nog geen geaccordeerde offertes om te rapporteren.</p>
        </div>
      ) : (
        <>
          {/* Totaal over alle jaren heen */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-[#DDD8D2] p-5">
              <span className="text-sm text-[#6B6560]">Totale omzet (excl. btw)</span>
              <p className="text-2xl font-semibold text-[#1C1B19] mt-1">{formatPrice(grandTotal.omzetExclBtw)}</p>
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

          <div className="space-y-10">
            {years.map((yearEntry) => (
              <div key={yearEntry.year} className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold text-[#1C1B19]">{yearEntry.year}</h2>
                  <div className="text-sm text-[#6B6560]">
                    {formatPrice(yearEntry.total.omzetExclBtw)} omzet · {formatPrice(yearEntry.total.margeExclBtw)} marge begroot ({margePercentage(yearEntry.total)}%) · {formatPrice(yearEntry.total.margeWerkelijk)} werkelijk · {yearEntry.total.aantal} projecten
                  </div>
                </div>

                {yearEntry.months.map((monthEntry) => (
                  <div key={monthEntry.key} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2] flex items-center justify-between">
                      <h3 className="text-sm font-medium text-[#1C1B19] capitalize">{monthEntry.label} {yearEntry.year}</h3>
                      <span className="text-xs text-[#6B6560]">
                        {formatPrice(monthEntry.total.omzetExclBtw)} omzet · {formatPrice(monthEntry.total.margeExclBtw)} marge begroot ({margePercentage(monthEntry.total)}%) · {formatPrice(monthEntry.total.margeWerkelijk)} werkelijk · {monthEntry.total.aantal} projecten
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#DDD8D2]">
                          <th className="text-left px-5 py-2 text-xs font-medium text-[#6B6560]">Project</th>
                          <th className="text-left px-5 py-2 text-xs font-medium text-[#6B6560]">Klant</th>
                          <th className="text-left px-5 py-2 text-xs font-medium text-[#6B6560] w-28">Akkoord op</th>
                          <th className="text-right px-5 py-2 text-xs font-medium text-[#6B6560] w-32">Omzet (excl. btw)</th>
                          <th className="text-right px-5 py-2 text-xs font-medium text-[#6B6560] w-32">Marge begroot</th>
                          <th className="text-right px-5 py-2 text-xs font-medium text-[#6B6560] w-32">Marge werkelijk</th>
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
                            <td className="px-5 py-2.5 text-[#6B6560]">{p.dateLabel}</td>
                            <td className="px-5 py-2.5 text-right text-[#1C1B19]">{formatPrice(p.omzetExclBtw)}</td>
                            <td className="px-5 py-2.5 text-right text-[#6B6560]">{formatPrice(p.margeExclBtw)}</td>
                            <td className="px-5 py-2.5 text-right font-medium text-[#1C1B19]">{formatPrice(p.margeWerkelijk)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                <PnlSummary
                  total={yearEntry.total}
                  bedrijfskosten={yearEntry.bedrijfskosten}
                  belastingPercentage={belastingPercentage}
                  onBelastingChange={saveBelastingPercentage}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PnlSummary({
  total,
  bedrijfskosten,
  belastingPercentage,
  onBelastingChange,
}: {
  total: Totals
  bedrijfskosten: number
  belastingPercentage: number
  onBelastingChange: (value: number) => void
}) {
  const bedrijfsresultaat = round2(total.margeExclBtw - bedrijfskosten)
  const belastingBedrag = round2(Math.max(0, bedrijfsresultaat) * (belastingPercentage / 100))
  const nettowinst = round2(bedrijfsresultaat - belastingBedrag)

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-1.5">
      <h3 className="text-sm font-medium text-[#1C1B19] mb-2">Winst- en verliesrekening</h3>
      <Row label="Omzet (excl. btw)" value={formatPrice(total.omzetExclBtw)} />
      <Row label="Kostprijs van de omzet" value={`− ${formatPrice(total.kostprijs)}`} muted />
      <Row label="Brutomarge" value={formatPrice(total.margeExclBtw)} bold border />
      <Row label="Bedrijfskosten" value={`− ${formatPrice(bedrijfskosten)}`} muted />
      <Row label="Bedrijfsresultaat" value={formatPrice(bedrijfsresultaat)} bold border />
      <div className="flex items-center justify-between py-1.5">
        <span className="text-[#6B6560] flex items-center gap-1.5">
          Belasting
          <input
            type="number"
            step="0.1"
            value={belastingPercentage}
            onChange={(e) => onBelastingChange(Number(e.target.value) || 0)}
            onFocus={selectOnFocus}
            className="w-14 text-sm text-right bg-transparent border border-[#DDD8D2] rounded px-1.5 py-0.5 focus:outline-none focus:border-[#1C1B19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          %
        </span>
        <span className="text-[#6B6560] tabular-nums">− {formatPrice(belastingBedrag)}</span>
      </div>
      <Row label="Nettowinst" value={formatPrice(nettowinst)} bold border accent />
    </div>
  )
}

function Row({ label, value, muted, bold, border, accent }: { label: string; value: string; muted?: boolean; bold?: boolean; border?: boolean; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${border ? 'border-t border-[#DDD8D2] pt-2.5 mt-1' : ''}`}>
      <span className={bold ? 'font-medium text-[#1C1B19]' : 'text-[#6B6560]'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold' : ''} ${accent ? 'text-[#8A6A2E] text-base' : muted ? 'text-[#6B6560]' : 'text-[#1C1B19]'}`}>{value}</span>
    </div>
  )
}
