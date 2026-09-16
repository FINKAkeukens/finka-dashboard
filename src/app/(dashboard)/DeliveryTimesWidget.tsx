'use client'

import { useState } from 'react'
import { ChevronDown, RefreshCw, Truck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DeliveryTime } from '@/lib/types'

const BRAND_LABELS: Record<string, string> = {
  artego: 'Artego',
  sachsen: 'Sachsen',
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'nog niet opgehaald'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface ParsedSummary {
  intro: string | null
  rows: { programma: string; levertijd: string }[]
}

// De opgeslagen summary is JSON ({intro, rows}, zie DELIVERY_TIME_PROMPT in
// src/lib/claude.ts). Bij een oudere, nog niet opnieuw opgehaalde rij (vóór
// de omzetting naar tabelvorm) is dat platte tekst — dan toont de tabel niks
// en valt hij terug op de rauwe tekst i.p.v. te crashen.
function parseSummary(summary: string): ParsedSummary | null {
  try {
    const parsed = JSON.parse(summary)
    if (Array.isArray(parsed?.rows)) return parsed as ParsedSummary
    return null
  } catch {
    return null
  }
}

// De rij die standaard zichtbaar is; de rest zit achter "Toon overige
// assortiment" — anders is de tabel bij merken met veel afwerkingen
// (bv. Sachsen) meteen weer net zo lang als de vorige platte lijst.
function isStandardRow(programma: string): boolean {
  return /standaard/i.test(programma)
}

export default function DeliveryTimesWidget({
  initialData,
  currentWeek,
}: {
  initialData: DeliveryTime[]
  currentWeek: { week: number; year: number }
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const router = useRouter()

  const byBrand = new Map(initialData.map((d) => [d.brand, d]))

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/delivery-times/refresh', { method: 'POST' })
      const data = await res.json()
      const failed = Object.entries(data.results ?? {}).filter(([, v]) => (v as { error?: string })?.error)
      if (failed.length > 0) {
        setError(failed.map(([brand, v]) => `${BRAND_LABELS[brand] ?? brand}: ${(v as { error: string }).error}`).join(' — '))
      }
      router.refresh()
    } catch {
      setError('Bijwerken mislukt, probeer het later opnieuw')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-6xl bg-white rounded-xl border border-[#DDD8D2] p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-[#C9A96E]" />
            <h2 className="text-sm font-semibold text-[#1C1B19]">Actuele levertijden</h2>
          </div>
          <span className="text-xs font-medium text-[#6B6560] bg-[#F5F2ED] rounded-full px-2.5 py-1">
            Nu week {currentWeek.week} · {currentWeek.year}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 bg-white text-[#1C1B19] text-sm px-3 py-1.5 rounded-lg border border-[#DDD8D2] hover:border-[#1C1B19] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Bijwerken...' : 'Bijwerken'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        {(['artego', 'sachsen'] as const).map((brand) => {
          const entry = byBrand.get(brand)
          const parsed = entry?.summary ? parseSummary(entry.summary) : null
          const standardRows = parsed?.rows.filter((r) => isStandardRow(r.programma)) ?? []
          const otherRows = parsed?.rows.filter((r) => !isStandardRow(r.programma)) ?? []
          // Geen duidelijke "standaard"-rij gevonden: dan is inklappen niet
          // zinvol, gewoon alles tonen.
          const hasStandardSplit = standardRows.length > 0 && otherRows.length > 0
          const visibleRows = hasStandardSplit
            ? [...standardRows, ...(expanded[brand] ? otherRows : [])]
            : parsed?.rows ?? []
          return (
            <div key={brand} className="border border-[#EDE9E3] rounded-lg p-4">
              <p className="text-sm font-medium text-[#1C1B19] mb-2">{BRAND_LABELS[brand]}</p>
              {parsed ? (
                <div className="text-sm text-[#3D3935]">
                  {parsed.intro && <p className="mb-2 text-[#6B6560]">{parsed.intro}</p>}
                  {visibleRows.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        {visibleRows.map((row, i) => (
                          <tr key={i} className="border-t border-[#EDE9E3] first:border-t-0">
                            <td className="py-1.5 pr-3 align-top text-[#1C1B19] font-medium">{row.programma}</td>
                            <td className="py-1.5 align-top">{row.levertijd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-[#6B6560] italic">Geen levertijd-informatie gevonden</p>
                  )}
                  {hasStandardSplit && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [brand]: !prev[brand] }))}
                      className="flex items-center gap-1 text-xs text-[#6B6560] hover:text-[#1C1B19] mt-2"
                    >
                      <ChevronDown size={12} className={expanded[brand] ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      {expanded[brand] ? 'Verberg overige assortiment' : `Toon overige assortiment (${otherRows.length})`}
                    </button>
                  )}
                </div>
              ) : entry?.summary ? (
                <p className="text-sm text-[#6B6560] italic">Nieuwe weergave beschikbaar — klik op &quot;Bijwerken&quot;</p>
              ) : (
                <p className="text-sm text-[#6B6560] italic">Nog geen levertijden opgehaald — klik op &quot;Bijwerken&quot;</p>
              )}
              <p className="text-xs text-[#6B6560] mt-2">Laatst bijgewerkt: {formatUpdatedAt(entry?.updated_at ?? null)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
