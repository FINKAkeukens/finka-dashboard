'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { Appliance, ApplianceCategory } from '@/lib/types'
import { TYPE_LABELS, TYPE_ORDER, CATEGORY_COLORS, formatPrice, getSpecSummary } from '@/lib/appliance-utils'

const CATEGORY_LABELS: Record<ApplianceCategory, string> = {
  budget: 'Budget',
  midden: 'Midden',
  premium: 'Premium',
}

export default function AppliancePickerModal({
  open,
  onOpenChange,
  appliances,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appliances: Appliance[]
  onSelect: (appliance: Appliance) => void
}) {
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('alle')
  const [categoryFilter, setCategoryFilter] = useState('alle')
  const [typeFilter, setTypeFilter] = useState('alle')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const brands = useMemo(
    () => Array.from(new Set(appliances.map((a) => a.brand))).sort((a, b) => a.localeCompare(b)),
    [appliances]
  )

  const filtered = appliances.filter((a) => {
    if (brandFilter !== 'alle' && a.brand !== brandFilter) return false
    if (categoryFilter !== 'alle' && a.category !== categoryFilter) return false
    if (typeFilter !== 'alle' && a.type !== typeFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.brand.toLowerCase().includes(q) ||
      a.model.toLowerCase().includes(q) ||
      TYPE_LABELS[a.type]?.toLowerCase().includes(q)
    )
  })

  const selected = appliances.filter((a) => selectedIds.has(a.id))

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setSearch('')
    setBrandFilter('alle')
    setCategoryFilter('alle')
    setTypeFilter('alle')
    setSelectedIds(new Set())
  }

  function handleConfirm() {
    selected.forEach((a) => onSelect(a))
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Apparaat uit bibliotheek toevoegen</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op merk, model of type..."
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="text-xs bg-[#F7F5F2] border border-[#DDD8D2] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="alle">Alle merken</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <div className="flex gap-1 flex-wrap">
            {(['alle', 'budget', 'midden', 'premium'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  categoryFilter === c
                    ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                    : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
                }`}
              >
                {c === 'alle' ? 'Alle categorieën' : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setTypeFilter('alle')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              typeFilter === 'alle'
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
            }`}
          >
            Alle types
          </button>
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                typeFilter === t
                  ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                  : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto -mx-6 px-6">
          {!filtered.length ? (
            <p className="text-sm text-[#6B6560] py-8 text-center">Geen apparatuur gevonden</p>
          ) : (
            <div className="divide-y divide-[#DDD8D2]">
              {filtered.map((a) => (
                <label
                  key={a.id}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-[#F7F5F2] transition-colors px-2 -mx-2 rounded-lg cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.has(a.id)}
                    onCheckedChange={() => toggleSelected(a.id)}
                  />
                  <div className="min-w-0 flex-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1C1B19] truncate">
                        {a.brand} {a.model}
                      </p>
                      <p className="text-xs text-[#6B6560]">
                        {TYPE_LABELS[a.type]} · {getSpecSummary(a)}
                        {a.category && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] ${CATEGORY_COLORS[a.category]}`}>
                            {CATEGORY_LABELS[a.category]}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-[#1C1B19] shrink-0">{formatPrice(a.price)}</span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#DDD8D2] pt-3 space-y-2">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-1 text-xs bg-[#F0EDE9] border border-[#DDD8D2] rounded-full"
                >
                  {a.brand} {a.model}
                  <button
                    type="button"
                    onClick={() => toggleSelected(a.id)}
                    className="text-[#9A948D] hover:text-[#1C1B19]"
                    title="Verwijderen uit selectie"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B6560]">
              {selected.length} apparaat{selected.length === 1 ? '' : 'en'} geselecteerd
            </span>
            <Button onClick={handleConfirm} disabled={!selected.length}>
              Toevoegen{selected.length ? ` (${selected.length})` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
