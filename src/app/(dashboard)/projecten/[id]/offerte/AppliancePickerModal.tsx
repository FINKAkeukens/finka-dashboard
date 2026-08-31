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
import { Appliance, ApplianceCategory, ProductLine } from '@/lib/types'
import { TYPE_LABELS, TYPE_ORDER, CATEGORY_COLORS, formatPrice, getSpecSummary } from '@/lib/appliance-utils'

const CATEGORY_LABELS: Record<ApplianceCategory, string> = {
  budget: 'Budget',
  midden: 'Midden',
  premium: 'Premium',
}

// Welke productlijn er relevant is zodra dit merk gekozen is — alleen dan
// tonen we het bijbehorende filter, anders staat er een leeg/nutteloos
// vinkje voor merken die deze lijn helemaal niet voeren.
const BRAND_PRODUCT_LINE: Record<string, ProductLine> = {
  Siemens: 'Studioline',
  Bosch: 'Accentline',
}

export default function AppliancePickerModal({
  open,
  onOpenChange,
  appliances,
  onSelect,
  initialSelectedIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appliances: Appliance[]
  // Krijgt bij bevestigen in één keer de volledige geselecteerde lijst
  // (i.p.v. één keer per apparaat) — anders overschrijft elke afzonderlijke
  // aanroep de vorige met dezelfde verouderde staat, zodat er alsnog maar
  // één apparaat blijft hangen.
  onSelect: (appliances: Appliance[]) => void
  // Al toegevoegde apparaten (bv. een eerder samengestelde apparatuur-optie)
  // staan bij het openen meteen aangevinkt, zodat je de lijst hier verder
  // kan bewerken — toevoegen én weer uitvinken om te verwijderen — i.p.v.
  // dat opnieuw openen altijd bij een lege selectie begint.
  initialSelectedIds?: string[]
}) {
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('alle')
  const [categoryFilter, setCategoryFilter] = useState('alle')
  // Meerdere types tegelijk aanvinken kan (bv. vaatwasser + koelvries in één
  // keer), leeg = geen filter op type.
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set())
  const [productLineOnly, setProductLineOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const hadInitialSelection = (initialSelectedIds?.length ?? 0) > 0

  // Bij elke keer openen opnieuw seeden vanuit de huidige lijst — niet alleen
  // bij mount, want dezelfde modal-instantie blijft bestaan tussen keren
  // open/dicht gaan. setState tijdens render i.p.v. in een effect ("adjusting
  // state when a prop changes"), zodat dit in dezelfde render al klaar is —
  // geen extra doorgaande render nodig.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setSelectedIds(new Set(initialSelectedIds ?? []))
  }

  const brands = useMemo(
    () => Array.from(new Set(appliances.map((a) => a.brand))).sort((a, b) => a.localeCompare(b)),
    [appliances]
  )

  const relevantProductLine = BRAND_PRODUCT_LINE[brandFilter]

  // Zelfde sortering als de geselecteerde lijst: per type gegroepeerd, dan
  // op prijs laag naar hoog — makkelijker scannen dan alfabetisch op merk.
  const filtered = appliances
    .filter((a) => {
      if (brandFilter !== 'alle' && a.brand !== brandFilter) return false
      if (categoryFilter !== 'alle' && a.category !== categoryFilter) return false
      if (typeFilters.size > 0 && !typeFilters.has(a.type)) return false
      if (productLineOnly && relevantProductLine && a.specs?.product_line !== relevantProductLine) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        a.brand.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        TYPE_LABELS[a.type]?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const typeCmp = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
      if (typeCmp !== 0) return typeCmp
      return (a.price ?? 0) - (b.price ?? 0)
    })

  // Geselecteerde lijst altijd gegroepeerd per type (zelfde volgorde als
  // overal elders in de app), en binnen elk type op prijs laag naar hoog.
  const selected = appliances
    .filter((a) => selectedIds.has(a.id))
    .sort((a, b) => {
      const typeCmp = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
      if (typeCmp !== 0) return typeCmp
      return (a.price ?? 0) - (b.price ?? 0)
    })

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleType(t: string) {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function reset() {
    setSearch('')
    setBrandFilter('alle')
    setCategoryFilter('alle')
    setTypeFilters(new Set())
    setProductLineOnly(false)
    setSelectedIds(new Set())
  }

  const totalPrice = selected.reduce((sum, a) => sum + (a.price ?? 0), 0)
  // Alleen kopjes per type tonen als de lijst er meer dan één bevat — bij
  // één type is een herhaald kopje overbodig. Buiten de JSX berekend (i.p.v.
  // een mutable variabele tijdens het renderen) zodat de compiler niet
  // struikelt over herhaalde toewijzingen in een .map().
  const showTypeDividers = new Set(filtered.map((a) => a.type)).size > 1
  const filteredWithHeaders = filtered.reduce<{ appliance: Appliance; showHeader: boolean }[]>((acc, a) => {
    const prevType = acc[acc.length - 1]?.appliance.type
    acc.push({ appliance: a, showHeader: showTypeDividers && a.type !== prevType })
    return acc
  }, [])

  function handleConfirm() {
    onSelect(selected)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="w-[95vw] max-w-5xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{hadInitialSelection ? 'Apparaten uit bibliotheek bewerken' : 'Apparaat uit bibliotheek toevoegen'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-5 flex-1 min-h-0">
          {/* Links: zoeken, filters, doorzoekbare lijst */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
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
                onChange={(e) => { setBrandFilter(e.target.value); setProductLineOnly(false) }}
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

              {relevantProductLine && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#DDD8D2] text-[#6B6560] cursor-pointer hover:border-[#1C1B19]">
                  <Checkbox checked={productLineOnly} onCheckedChange={(v) => setProductLineOnly(!!v)} />
                  Alleen {relevantProductLine}
                </label>
              )}
            </div>

            <div>
              <p className="text-xs text-[#9A948D] mb-1.5">Type (meerdere mogelijk)</p>
              <div className="flex gap-1.5 flex-wrap">
                {TYPE_ORDER.map((t) => (
                  <label
                    key={t}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border cursor-pointer transition-colors ${
                      typeFilters.has(t)
                        ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                        : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
                    }`}
                  >
                    <Checkbox
                      checked={typeFilters.has(t)}
                      onCheckedChange={() => toggleType(t)}
                      className={typeFilters.has(t) ? 'border-white' : ''}
                    />
                    {TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              {!filtered.length ? (
                <p className="text-sm text-[#6B6560] py-8 text-center">Geen apparatuur gevonden</p>
              ) : (
                <div className="divide-y divide-[#DDD8D2]">
                  {filteredWithHeaders.map(({ appliance: a, showHeader }) => {
                    return (
                    <div key={a.id}>
                      {showHeader && (
                        <p className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-[#9A948D] text-center">
                          {TYPE_LABELS[a.type]}
                        </p>
                      )}
                    <label
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
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Rechts: geselecteerde apparaten — eigen kolom zodat je bij veel
              selecties niet in een piepklein lijstje hoeft te scrollen. */}
          <div className="w-72 shrink-0 flex flex-col border-l border-[#DDD8D2] pl-5">
            <p className="text-xs font-medium text-[#1C1B19] mb-2">
              Geselecteerd{selected.length ? ` (${selected.length})` : ''}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {!selected.length ? (
                <p className="text-xs text-[#9A948D]">Nog niets geselecteerd</p>
              ) : (
                selected.map((a) => (
                  <div key={a.id} className="rounded-lg border border-[#DDD8D2] px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-[#6B6560] bg-[#F0EDE9] rounded px-1.5 py-0.5">
                        {TYPE_LABELS[a.type]}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSelected(a.id)}
                        className="text-[#9A948D] hover:text-red-600"
                        title="Verwijderen uit selectie"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <p className="text-xs font-medium text-[#1C1B19] mt-1">{a.brand} {a.model}</p>
                    <p className="text-[11px] text-[#6B6560]">{getSpecSummary(a)}</p>
                    <p className="text-xs font-medium text-[#1C1B19] mt-1">{formatPrice(a.price)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-[#DDD8D2] mt-2 pt-2 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B6560]">Totaal</span>
                <span className="font-semibold text-[#1C1B19]">{formatPrice(totalPrice)}</span>
              </div>
              <Button onClick={handleConfirm} disabled={!selected.length && !hadInitialSelection} className="w-full">
                {hadInitialSelection ? `Bijwerken (${selected.length})` : `Toevoegen${selected.length ? ` (${selected.length})` : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
