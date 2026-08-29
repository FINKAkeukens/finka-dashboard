'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Checkbox } from '@/components/ui/checkbox'
import { formatPrice } from '@/lib/appliance-utils'
import { selectOnFocus } from '@/lib/utils'
import { CostCategoryKey, ProjectFinancialItem } from '@/lib/types'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// Kolomkop met de eenheid (€ of %) als klein onderschrift onder de titel,
// i.p.v. in de titel zelf verwerkt.
function ColHeader({ label, unit, className = '' }: { label: string; unit: string; className?: string }) {
  return (
    <th className={`text-right px-3 py-3 text-xs font-medium text-[#6B6560] ${className}`}>
      {label}
      <span className="block text-[10px] font-normal text-[#9A948D] normal-case">{unit}</span>
    </th>
  )
}

// Zelfde 9 categorieën als de kostprijs-opbouw in Offerte, gegroepeerd in
// "Inkoop" (materiaal/product) en "Diensten" — zelfde indeling als het
// financiële sjabloon dat FINKA al gebruikte.
const GROUPS: { label: string; categories: CostCategoryKey[] }[] = [
  { label: 'Inkoop', categories: ['keukenkastjes', 'apparatuur', 'werkblad', 'accessoires'] },
  { label: 'Diensten', categories: ['inmeten', 'opslag', 'levering', 'installatie', 'service'] },
]

const CATEGORY_LABELS: Record<CostCategoryKey, string> = {
  keukenkastjes: 'Keukenkastjes',
  apparatuur: 'Apparatuur',
  werkblad: 'Aanrechtblad',
  accessoires: 'Accessoires',
  inmeten: 'Inmeten',
  opslag: 'Opslag',
  levering: 'Levering/transport',
  installatie: 'Installatie/montage',
  service: 'Service',
}

// Verschil kosten: hogere werkelijke kosten dan begroot is slecht nieuws (rood).
function verschilClass(n: number) {
  if (n > 0) return 'text-red-600'
  if (n < 0) return 'text-green-600'
  return 'text-[#6B6560]'
}

// Marge: andersom — een positieve marge is juist goed nieuws (groen).
function margeClass(n: number) {
  if (n > 0) return 'text-green-600'
  if (n < 0) return 'text-red-600'
  return 'text-[#6B6560]'
}

// Zolang "betaald" niet is aangevinkt is het cijfer nog maar een schatting
// (werkelijk = begroot totdat er iets anders is ingevuld) — dan blijft de
// tekst grijzig. Zodra bevestigd wordt de volle (rode/groene) kleur getoond
// én iets vetter, zodat duidelijk is dat het bedrag vaststaat.
function confirmClass(betaald: boolean, semanticClass: string) {
  return betaald ? semanticClass : 'text-[#6B6560]'
}

function signedPrice(n: number) {
  return n > 0 ? `+${formatPrice(n)}` : formatPrice(n)
}

// Rijberekeningen: begroot_bedrag + marge_percentage (vastgelegd bij
// accorderen) bepalen samen de vaste "prijs klant" per categorie. Verschil/
// marge werkelijk worden altijd berekend (werkelijke kosten vallen terug op
// begroot zolang er niets anders is ingevuld) — "betaald" bepaalt alleen of
// dat cijfer al als definitief getoond wordt, niet of het berekend wordt.
function rowFigures(item: ProjectFinancialItem) {
  const begroot = item.begroot_bedrag
  const prijsKlant = round2(begroot * (1 + item.marge_percentage / 100))
  const margeBegroot = round2(prijsKlant - begroot)
  // Bruto marge% = marge / prijs klant (niet / kosten — dat is al de
  // ingevulde "Opslag %"-kolom, de opslag op de kostprijs).
  const margeBegrootPct = prijsKlant > 0 ? Math.round((margeBegroot / prijsKlant) * 100) : null
  const werkelijk = item.werkelijk_bedrag ?? begroot
  const margeWerkelijk = round2(prijsKlant - werkelijk)
  const margeWerkelijkPct = prijsKlant > 0 ? Math.round((margeWerkelijk / prijsKlant) * 100) : null
  const verschilKosten = round2(werkelijk - begroot)
  return { begroot, prijsKlant, margeBegroot, margeBegrootPct, werkelijk, margeWerkelijk, margeWerkelijkPct, verschilKosten }
}

interface GroupTotals {
  begroot: number
  prijsKlant: number
  margeBegroot: number
  werkelijkSum: number
  betaaldCount: number
  count: number
}

function emptyTotals(): GroupTotals {
  return { begroot: 0, prijsKlant: 0, margeBegroot: 0, werkelijkSum: 0, betaaldCount: 0, count: 0 }
}

function addRow(t: GroupTotals, item: ProjectFinancialItem): GroupTotals {
  const f = rowFigures(item)
  return {
    begroot: t.begroot + f.begroot,
    prijsKlant: t.prijsKlant + f.prijsKlant,
    margeBegroot: t.margeBegroot + f.margeBegroot,
    werkelijkSum: t.werkelijkSum + f.werkelijk,
    betaaldCount: t.betaaldCount + (item.betaald ? 1 : 0),
    count: t.count + 1,
  }
}

function TotalsRow({ label, t, bold }: { label: string; t: GroupTotals; bold?: boolean }) {
  const allConfirmed = t.count > 0 && t.betaaldCount === t.count
  const partial = t.betaaldCount > 0 && t.betaaldCount < t.count
  const margeBegrootPct = t.prijsKlant > 0 ? Math.round((t.margeBegroot / t.prijsKlant) * 100) : null
  const margeWerkelijk = round2(t.prijsKlant - t.werkelijkSum)
  const margeWerkelijkPct = t.prijsKlant > 0 ? Math.round((margeWerkelijk / t.prijsKlant) * 100) : null
  const verschil = round2(t.werkelijkSum - t.begroot)
  const textClass = bold ? 'font-semibold text-[#1C1B19]' : 'font-medium text-[#1C1B19]'
  const weight = allConfirmed ? 'font-semibold' : 'font-medium'
  return (
    <tr className={bold ? 'border-t-2 border-[#1C1B19] bg-[#F7F5F2]' : 'border-t border-[#DDD8D2] bg-[#FBFAF8]'}>
      <td className={`px-3 py-2.5 align-top ${textClass}`}>
        {label}
        {partial && <span className="block text-[10px] font-normal text-[#9A948D]">nog niet alles bevestigd</span>}
      </td>
      <td className={`px-3 py-2.5 align-top text-right ${textClass}`}>{formatPrice(t.begroot)}</td>
      <td className="px-3 py-2.5" />
      <td className={`px-3 py-2.5 align-top text-right ${textClass}`}>
        {formatPrice(t.margeBegroot)}
        {margeBegrootPct != null && <span className="block text-[10px] font-normal">{margeBegrootPct}%</span>}
      </td>
      <td className={`px-3 py-2.5 align-top text-right ${textClass}`}>{formatPrice(t.prijsKlant)}</td>
      <td className={`px-3 py-2.5 align-top text-right bg-[#C9A96E]/10 ${textClass}`}>{formatPrice(t.werkelijkSum)}</td>
      <td className="px-3 py-2.5" />
      <td className={`px-3 py-2.5 align-top text-right ${weight} ${confirmClass(allConfirmed, verschilClass(verschil))}`}>
        {signedPrice(verschil)}
      </td>
      <td className={`px-3 py-2.5 align-top text-right ${weight} ${confirmClass(allConfirmed, margeClass(margeWerkelijk))}`}>
        {formatPrice(margeWerkelijk)}
        {margeWerkelijkPct != null && <span className="block text-[10px] font-normal">{margeWerkelijkPct}%</span>}
      </td>
    </tr>
  )
}

// Begroot vs. werkelijk per kostencategorie, gegroepeerd in Inkoop/Diensten
// — zelfde opbouw als FINKA's eigen financiële sjabloon (Kosten/Opslag%/
// Prijs klant/Bruto marge), aangevuld met de werkelijke kosten zodra die
// bekend zijn. Elk veld slaat direct op (geen aparte "Opslaan"-knop).
export default function FinancieelTab({
  items: initialItems,
  btwPercentage,
}: {
  items: ProjectFinancialItem[]
  btwPercentage: number
}) {
  const supabase = createClient()
  const [items, setItems] = useState<ProjectFinancialItem[]>(initialItems)
  const [error, setError] = useState('')

  function itemFor(category: CostCategoryKey) {
    return items.find((i) => i.category === category)
  }

  function updateLocalWerkelijk(id: string, value: number | null) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, werkelijk_bedrag: value } : i)))
  }

  async function saveWerkelijk(item: ProjectFinancialItem) {
    const { error: updError } = await supabase
      .from('finka_project_financials')
      .update({ werkelijk_bedrag: item.werkelijk_bedrag, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  async function toggleBetaald(item: ProjectFinancialItem) {
    const betaald = !item.betaald
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, betaald } : i)))
    const { error: updError } = await supabase
      .from('finka_project_financials')
      .update({ betaald, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  const hasAnyRows = GROUPS.some((g) => g.categories.some((c) => itemFor(c)))

  if (!hasAnyRows) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">
          Nog geen begrote bedragen — die verschijnen hier automatisch zodra de offerte op het Offerte-tabblad op &quot;Akkoord&quot; wordt gezet.
        </p>
      </div>
    )
  }

  const grandTotal = GROUPS.reduce((t, g) => {
    const rows = g.categories.map((c) => itemFor(c)).filter((i): i is ProjectFinancialItem => !!i)
    return rows.reduce(addRow, t)
  }, emptyTotals())

  const btwBedrag = round2(grandTotal.prijsKlant * (btwPercentage / 100))
  const totaalInclBtw = round2(grandTotal.prijsKlant + btwBedrag)

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{error}</p>}

      <p className="text-xs text-[#6B6560]">
        Begroot (Kosten/Opslag%/Prijs klant) komt uit de geaccordeerde offerte en blijft vastliggen. Vul &quot;Werkelijke kosten&quot; in zodra die bekend zijn — de marge werkelijk laat dan meteen zien wat een afwijking kost.
      </p>

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-x-auto">
        <table className="text-sm min-w-[980px]">
          <thead>
            <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <th className="text-left px-3 py-3 text-xs font-medium text-[#6B6560] w-40">Onderdeel</th>
              <ColHeader label="Kosten" unit="€" className="w-24" />
              <ColHeader label="Opslag" unit="%" className="w-16" />
              <ColHeader label="Marge begroot" unit="€" className="w-32" />
              <ColHeader label="Prijs klant" unit="€" className="w-24" />
              <ColHeader label="Werkelijke kosten" unit="€" className="w-36 bg-[#C9A96E]/10" />
              <th className="text-center px-2 py-3 text-xs font-medium text-[#6B6560] w-14">Betaald</th>
              <ColHeader label="Verschil kosten" unit="€" className="w-32" />
              <ColHeader label="Marge werkelijk" unit="€" className="w-32" />
            </tr>
          </thead>
          {GROUPS.map((group) => {
            const rows = group.categories.map((c) => itemFor(c)).filter((i): i is ProjectFinancialItem => !!i)
            if (!rows.length) return null
            const groupTotals = rows.reduce(addRow, emptyTotals())
            return (
              <tbody key={group.label} className="divide-y divide-[#DDD8D2]">
                {rows.map((item) => {
                  const f = rowFigures(item)
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 align-top text-[#1C1B19]">{CATEGORY_LABELS[item.category]}</td>
                      <td className="px-3 py-2.5 align-top text-right text-[#6B6560]">{formatPrice(f.begroot)}</td>
                      <td className="px-3 py-2.5 align-top text-right text-[#6B6560]">{item.marge_percentage}%</td>
                      <td className="px-3 py-2.5 align-top text-right text-[#1C1B19]">
                        {formatPrice(f.margeBegroot)}
                        {f.margeBegrootPct != null && <span className="block text-[10px] font-normal text-[#9A948D]">{f.margeBegrootPct}%</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right text-[#1C1B19]">{formatPrice(f.prijsKlant)}</td>
                      <td className="px-3 py-2.5 align-top bg-[#C9A96E]/10">
                        <div
                          className={`flex items-center gap-1.5 rounded px-2 py-1 border border-transparent hover:border-[#DDD8D2] focus-within:border-[#1C1B19] focus-within:bg-white ${
                            !item.betaald ? 'opacity-60' : ''
                          }`}
                        >
                          <span className="text-sm text-[#9A948D] shrink-0">€</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.werkelijk_bedrag ?? item.begroot_bedrag}
                            placeholder="—"
                            onChange={(e) => updateLocalWerkelijk(item.id, e.target.value === '' ? null : Number(e.target.value))}
                            onBlur={() => saveWerkelijk(item)}
                            onFocus={selectOnFocus}
                            className={`w-full min-w-0 text-sm text-right bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              !item.betaald ? 'italic' : ''
                            }`}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2.5 align-middle text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={item.betaald}
                            onCheckedChange={() => toggleBetaald(item)}
                            title="Vink aan zodra dit bedrag écht betaald/bevestigd is"
                          />
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 align-top text-right ${item.betaald ? 'font-semibold' : 'font-medium'} ${confirmClass(item.betaald, verschilClass(f.verschilKosten))}`}>
                        {signedPrice(f.verschilKosten)}
                      </td>
                      <td className={`px-3 py-2.5 align-top text-right ${item.betaald ? 'font-semibold' : 'font-medium'} ${confirmClass(item.betaald, margeClass(f.margeWerkelijk))}`}>
                        {formatPrice(f.margeWerkelijk)}
                        {f.margeWerkelijkPct != null && <span className="block text-[10px] font-normal">{f.margeWerkelijkPct}%</span>}
                      </td>
                    </tr>
                  )
                })}
                <TotalsRow label={group.label} t={groupTotals} />
              </tbody>
            )
          })}
          <tfoot>
            <TotalsRow label="Totaal" t={grandTotal} bold />
            <tr className="bg-white">
              <td colSpan={8} className="px-3 py-2 text-right text-xs text-[#6B6560]">Btw ({btwPercentage}%)</td>
              <td className="px-3 py-2 text-right text-xs text-[#6B6560]">{formatPrice(btwBedrag)}</td>
            </tr>
            <tr className="bg-white border-t border-[#DDD8D2]">
              <td colSpan={8} className="px-3 py-2.5 text-right text-sm font-semibold text-[#1C1B19]">Totaal (incl. btw)</td>
              <td className="px-3 py-2.5 text-right text-sm font-semibold text-[#1C1B19]">{formatPrice(totaalInclBtw)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
