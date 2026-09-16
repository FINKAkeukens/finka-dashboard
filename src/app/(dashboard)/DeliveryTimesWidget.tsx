'use client'

import { useState } from 'react'
import { RefreshCw, Truck } from 'lucide-react'
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

// Zet de door Claude opgeleverde platte tekst om in blokken: regels die met
// "- " beginnen worden een <ul> met bolletjes, alle andere regels (intro of
// productlijn-kopregels) worden losse regels. Zie de DELIVERY_TIME_PROMPT in
// src/lib/claude.ts voor het verwachte format.
type SummaryBlock = { type: 'header' | 'list'; lines: string[] }

function parseSummaryBlocks(summary: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = []
  for (const raw of summary.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('- ')) {
      const text = line.slice(2).trim()
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list') last.lines.push(text)
      else blocks.push({ type: 'list', lines: [text] })
    } else {
      blocks.push({ type: 'header', lines: [line] })
    }
  }
  return blocks
}

export default function DeliveryTimesWidget({ initialData }: { initialData: DeliveryTime[] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-[#C9A96E]" />
          <h2 className="text-sm font-semibold text-[#1C1B19]">Actuele levertijden</h2>
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
          return (
            <div key={brand} className="border border-[#EDE9E3] rounded-lg p-4">
              <p className="text-sm font-medium text-[#1C1B19] mb-2">{BRAND_LABELS[brand]}</p>
              {entry?.summary ? (
                <div className="text-sm text-[#3D3935] leading-snug space-y-1">
                  {parseSummaryBlocks(entry.summary).map((block, i) =>
                    block.type === 'list' ? (
                      <ul key={i} className="list-disc list-outside pl-4 space-y-0">
                        {block.lines.map((line, j) => (
                          <li key={j}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i} className="font-medium text-[#1C1B19]">{block.lines[0]}</p>
                    )
                  )}
                </div>
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
