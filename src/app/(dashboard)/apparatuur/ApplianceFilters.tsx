'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

const types = [
  { value: 'alle', label: 'Alle' },
  { value: 'kookplaat', label: 'Kookplaat' },
  { value: 'oven', label: 'Oven' },
  { value: 'combi-oven', label: 'Combi-oven' },
  { value: 'vaatwasser', label: 'Vaatwasser' },
  { value: 'afzuigkap', label: 'Afzuigkap' },
  { value: 'koelkast', label: 'Koelkast' },
  { value: 'anders', label: 'Anders' },
]
const categories = [
  { value: 'alle', label: 'Alle' },
  { value: 'budget', label: 'Budget' },
  { value: 'midden', label: 'Midden' },
  { value: 'premium', label: 'Premium' },
]

const categoryColors: Record<string, string> = {
  alle: '',
  budget: 'data-[active=true]:bg-green-700 data-[active=true]:border-green-700',
  midden: 'data-[active=true]:bg-blue-700 data-[active=true]:border-blue-700',
  premium: 'data-[active=true]:bg-amber-700 data-[active=true]:border-amber-700',
}

export default function ApplianceFilters({
  activeType,
  activeCategory,
  q,
}: {
  activeType: string
  activeCategory: string
  q: string
}) {
  const router = useRouter()

  function buildHref(newType?: string, newCat?: string) {
    const t = newType ?? activeType
    const c = newCat ?? activeCategory
    const params = new URLSearchParams()
    if (t !== 'alle') params.set('type', t)
    if (c !== 'alle') params.set('category', c)
    if (q) params.set('q', q)
    return `/apparatuur?${params.toString()}`
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const search = form.get('q') as string
    const params = new URLSearchParams()
    if (activeType !== 'alle') params.set('type', activeType)
    if (activeCategory !== 'alle') params.set('category', activeCategory)
    if (search) params.set('q', search)
    router.push(`/apparatuur?${params.toString()}`)
  }

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="w-64 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Merk of model zoeken..."
            className="w-full pl-8 pr-4 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          />
        </form>

        <div className="flex gap-1 flex-wrap">
          {categories.map(c => (
            <Link
              key={c.value}
              href={buildHref(undefined, c.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                activeCategory === c.value
                  ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                  : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {types.map(t => (
          <Link
            key={t.value}
            href={buildHref(t.value)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              activeType === t.value
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
