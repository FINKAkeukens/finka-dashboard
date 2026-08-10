'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Appliance } from '@/lib/types'
import {
  APPLIANCE_GROUPS,
  CATEGORY_COLORS,
  COOLING_GROUP,
  ENERGY_LABELS,
  OVEN_GROUP,
  OVEN_SUBTYPE_LABELS,
  TYPE_LABELS,
  TYPE_ORDER,
  countByType,
  formatPrice,
  getSpecSummary,
  priceRange,
  specEntries,
} from '@/lib/appliance-utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Checkbox } from '@/components/ui/checkbox'
import { Search, X, ShoppingCart, Trash2, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'

// Meerkeuze-dropdown voor energielabel — eigen implementatie (i.p.v. de
// shadcn DropdownMenu) omdat deze app geen --popover/--accent hover-tokens
// definieert; met expliciete kleuren blijft dit consistent met de rest van
// de bibliotheekfilters.
function EnergyLabelFilter({ selected, onChange }: { selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(label: string) {
    const next = new Set(selected)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    onChange(next)
  }

  const buttonLabel = selected.size === 0
    ? 'Energielabel: alle'
    : `Energielabel: ${Array.from(selected).sort().join(', ')}`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
          selected.size > 0
            ? 'border-[#1C1B19] bg-[#1C1B19] text-white'
            : 'border-[#DDD8D2] bg-white text-[#6B6560] hover:border-[#1C1B19]'
        }`}
      >
        {buttonLabel}
        <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[#DDD8D2] bg-white p-1.5 shadow-lg">
          {ENERGY_LABELS.map(l => (
            <label key={l} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-[#1C1B19] hover:bg-[#F7F5F2]">
              <Checkbox checked={selected.has(l)} onCheckedChange={() => toggle(l)} />
              Energielabel {l}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-[#6B6560] hover:bg-[#F7F5F2]"
            >
              Wis selectie
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type SortKey = 'brand' | 'price' | 'category'
type ActiveView = 'overview' | string

function SelectionBar({
  selected,
  appliances,
  onClear,
}: {
  selected: Set<string>
  appliances: Appliance[]
  onClear: () => void
}) {
  const [inclBtw, setInclBtw] = useState(false)
  if (selected.size === 0) return null

  const selectedItems = appliances.filter(a => selected.has(a.id))
  const totalExcl = selectedItems.reduce((sum, a) => sum + (a.price ?? 0), 0)
  const totalIncl = totalExcl * 1.21
  const withPrice = selectedItems.filter(a => a.price).length

  return (
    <div className="fixed bottom-0 left-56 right-0 z-50 border-t border-white/10 bg-[#1C1B19] px-6 py-3 text-white shadow-2xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ShoppingCart size={16} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{selected.size} geselecteerd</p>
            <p className="truncate text-xs text-white/60">
              {selectedItems.map(a => `${a.brand} ${a.model}`).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button
            onClick={() => setInclBtw(!inclBtw)}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
          >
            {inclBtw ? 'Incl. BTW' : 'Excl. BTW'}
          </button>
          <div className="text-right">
            <p className="text-xs text-white/60">
              {withPrice < selected.size ? `${withPrice}/${selected.size} met prijs · ` : ''}
              {inclBtw ? 'incl. 21% BTW' : 'excl. BTW'}
            </p>
            <p className="text-lg font-bold">
              {formatPrice(inclBtw ? totalIncl : totalExcl)}
            </p>
          </div>
          <button onClick={onClear} className="flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <X size={14} />
            Wis
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailSheet({
  appliance,
  open,
  onOpenChange,
  selected,
  onToggle,
  onDelete,
}: {
  appliance: Appliance | null
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  if (!appliance) return null
  const history = appliance.price_history ?? []
  const specs = specEntries(appliance.type, appliance.specs ?? {})

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <span className="inline-block w-fit rounded-full bg-[#EDE9E4] px-2 py-0.5 text-xs font-medium text-[#6B6560]">
            {TYPE_LABELS[appliance.type] ?? appliance.type}
          </span>
          <SheetTitle className="text-xl">{appliance.brand}</SheetTitle>
          <p className="text-sm text-[#6B6560]">{appliance.model}</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-2xl font-semibold">{formatPrice(appliance.price)}</p>
            {appliance.category && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${CATEGORY_COLORS[appliance.category]}`}>
                {appliance.category}
              </span>
            )}
          </div>

          {specs.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B6560]">Specificaties</p>
              <div className="rounded-lg border border-[#DDD8D2] divide-y divide-[#F0EDE9]">
                {specs.map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[#6B6560]">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(appliance.supplier || appliance.quote_date) && (
            <div className="text-sm text-[#6B6560]">
              {appliance.supplier && <p>Leverancier: {appliance.supplier.name}</p>}
              {appliance.quote_date && (
                <p>Offertedatum: {new Date(appliance.quote_date).toLocaleDateString('nl-NL')}</p>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B6560]">Prijshistorie</p>
              <div className="space-y-1 rounded-lg bg-[#F7F5F2] p-3">
                {history.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-[#6B6560]">
                      {h.date ? new Date(h.date).toLocaleDateString('nl-NL') : '—'}
                    </span>
                    <span className="font-medium">{formatPrice(h.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-[#DDD8D2] pt-4">
            <button
              onClick={onToggle}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-[#1C1B19] text-white'
                  : 'border border-[#DDD8D2] hover:border-[#1C1B19]'
              }`}
            >
              {selected ? 'Deselecteren' : 'Selecteren voor berekening'}
            </button>
            <Link
              href={`/apparatuur/${appliance.id}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#DDD8D2] px-4 py-2 text-sm hover:border-[#1C1B19]"
            >
              Bewerken
              <ExternalLink size={13} />
            </Link>
            <button
              onClick={onDelete}
              className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={13} />
              Verwijderen
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function ApplianceLibrary({ appliances: initialAppliances }: { appliances: Appliance[] }) {
  const supabase = createClient()
  const [appliances, setAppliances] = useState(initialAppliances)
  const [activeView, setActiveView] = useState<ActiveView>('overview')
  const [activeCategory, setActiveCategory] = useState('alle')
  // Energielabel is generiek (geldt voor vrijwel elk type) en blijft daarom,
  // net als activeCategory, staan wanneer je van categorie wisselt — anders
  // dan specFilters, die per type-specifiek en wél gereset worden. Meerdere
  // labels tegelijk selecteren kan (bv. A + B), leeg = geen filter.
  const [energyLabelFilters, setEnergyLabelFilters] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('brand')
  const [sortAsc, setSortAsc] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [specFilters, setSpecFilters] = useState<Record<string, string>>({})

  const typeCounts = useMemo(() => countByType(appliances), [appliances])
  const detailAppliance = appliances.find(a => a.id === detailId) ?? null

  // Groep waar een type bij hoort (indien van toepassing) — oven/combi-oven/
  // magnetron vallen bijv. samen onder "Oven en magnetron".
  const groupForType = (type: string) => APPLIANCE_GROUPS.find(g => (g.types as readonly string[]).includes(type))

  // Navigatie-items voor sidebar/mobiel-dropdown/overzicht: verwante types
  // worden hier samengevoegd tot één groepsitem (zie APPLIANCE_GROUPS) — de
  // onderliggende data blijft gewoon per apparaat het eigen `type` houden.
  const navEntries = useMemo(() => {
    const entries: { key: string; label: string; count: number }[] = []
    const addedGroups = new Set<string>()
    for (const type of TYPE_ORDER) {
      const group = groupForType(type)
      if (group) {
        if (addedGroups.has(group.key)) continue
        addedGroups.add(group.key)
        const count = group.types.reduce((sum, t) => sum + (typeCounts[t] ?? 0), 0)
        if (count) entries.push({ key: group.key, label: group.label, count })
        continue
      }
      const count = typeCounts[type] ?? 0
      if (count) entries.push({ key: type, label: TYPE_LABELS[type], count })
    }
    return entries
  }, [typeCounts])

  function itemsForNavKey(key: string) {
    const group = APPLIANCE_GROUPS.find(g => g.key === key)
    return group
      ? appliances.filter(a => (group.types as readonly string[]).includes(a.type))
      : appliances.filter(a => a.type === key)
  }

  const filtered = useMemo(() => {
    return appliances.filter(a => {
      if (activeView !== 'overview') {
        const group = APPLIANCE_GROUPS.find(g => g.key === activeView)
        if (group) {
          if (!(group.types as readonly string[]).includes(a.type)) return false
        } else if (a.type !== activeView) return false
      }
      if (activeCategory !== 'alle' && a.category !== activeCategory) return false
      if (energyLabelFilters.size > 0 && !(a.specs?.energy_label && energyLabelFilters.has(a.specs.energy_label))) return false
      if (q) {
        const s = q.toLowerCase()
        const matchesType = TYPE_LABELS[a.type]?.toLowerCase().includes(s)
        if (!a.brand?.toLowerCase().includes(s) && !a.model?.toLowerCase().includes(s) && !matchesType) return false
      }
      const specs = a.specs ?? {}
      if (specFilters.cooling_type && a.type !== specFilters.cooling_type) return false
      if (specFilters.energy_type && specs.energy_type !== specFilters.energy_type) return false
      if (specFilters.oven_subtype && specs.oven_subtype !== specFilters.oven_subtype) return false
      if (specFilters.width_cm && String(specs.width_cm) !== specFilters.width_cm) return false
      if (specFilters.pyrolysis && String(specs.pyrolysis) !== specFilters.pyrolysis) return false
      if (specFilters.steam && String(specs.steam) !== specFilters.steam) return false
      if (specFilters.integration && specs.integration !== specFilters.integration) return false
      if (specFilters.afzuig_type && specs.afzuig_type !== specFilters.afzuig_type) return false
      if (specFilters.bowls && specs.bowls !== specFilters.bowls) return false
      return true
    })
  }, [appliances, activeView, activeCategory, energyLabelFilters, q, specFilters])

  const sorted = useMemo(() => {
    const items = [...filtered]
    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'brand') {
        cmp = `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'nl')
      } else if (sortKey === 'price') {
        cmp = (a.price ?? -1) - (b.price ?? -1)
      } else {
        cmp = (a.category ?? 'z').localeCompare(b.category ?? 'z')
      }
      return sortAsc ? cmp : -cmp
    })
    return items
  }, [filtered, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(prev => !prev)
    else { setSortKey(key); setSortAsc(true) }
  }

  function toggleAppliance(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteAppliance(id: string) {
    if (!confirm('Product verwijderen uit de bibliotheek?')) return
    await supabase.from('finka_appliances').delete().eq('id', id)
    setAppliances(prev => prev.filter(a => a.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    if (detailId === id) setDetailId(null)
  }

  function selectType(type: string) {
    setActiveView(type)
    setSpecFilters({})
  }

  function SpecFilterRow() {
    if (activeView === 'overview') return null

    const chip = (label: string, key: string, options: { v: string; l: string }[]) => (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[#6B6560]">{label}:</span>
        {options.map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setSpecFilters(prev => ({ ...prev, [key]: prev[key] === v ? '' : v }))}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
              specFilters[key] === v
                ? 'border-[#1C1B19] bg-[#1C1B19] text-white'
                : 'border-[#DDD8D2] bg-white text-[#6B6560] hover:border-[#1C1B19]'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    )

    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-[#EDE9E4] px-4 py-2">
        {activeView === 'kookplaat' && chip('Energie', 'energy_type', [
          { v: 'inductie', l: 'Inductie' }, { v: 'gas', l: 'Gas' }, { v: 'keramisch', l: 'Keramisch' },
        ])}
        {activeView === OVEN_GROUP.key && (
          <>
            {chip('Ovensoort', 'oven_subtype', [
              { v: 'solo', l: OVEN_SUBTYPE_LABELS.solo },
              { v: 'combi-magnetron', l: OVEN_SUBTYPE_LABELS['combi-magnetron'] },
              { v: 'stoom', l: OVEN_SUBTYPE_LABELS.stoom },
            ])}
            {chip('Nis', 'width_cm', [{ v: '45', l: '45 cm' }, { v: '60', l: '60 cm' }])}
            {chip('Pyrolyse', 'pyrolysis', [{ v: 'true', l: 'Ja' }, { v: 'false', l: 'Nee' }])}
            {chip('Stoomfunctie', 'steam', [{ v: 'true', l: 'Ja' }, { v: 'false', l: 'Nee' }])}
          </>
        )}
        {activeView === COOLING_GROUP.key && chip('Soort', 'cooling_type', [
          { v: 'koelvries', l: 'Koel/vries combinatie' },
          { v: 'vriezer', l: 'Vriezer' },
          { v: 'koelkast', l: 'Koelkast' },
          { v: 'wijnklimaatkast', l: 'Wijnklimaatkast' },
        ])}
        {activeView === 'vaatwasser' && chip('Integratie', 'integration', [
          { v: 'volledig', l: 'Volledig' }, { v: 'half', l: 'Half' },
        ])}
        {activeView === 'afzuigkap' && chip('Type', 'afzuig_type', [
          { v: 'wand', l: 'Wand' }, { v: 'eiland', l: 'Eiland' }, { v: 'inbouw', l: 'Inbouw' }, { v: 'plafond', l: 'Plafond' },
        ])}
        {activeView === 'spoelbak' && chip('Bakken', 'bowls', [
          { v: 'enkel', l: 'Enkel' }, { v: 'dubbel', l: 'Dubbel' },
        ])}
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-5">
        {/* Type navigatie */}
        <nav className="sticky top-0 hidden h-fit w-44 shrink-0 md:block">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-[#6B6560]">Categorie</p>
          <button
            onClick={() => { setActiveView('overview'); setSpecFilters({}) }}
            className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              activeView === 'overview'
                ? 'bg-[#1C1B19] text-white'
                : 'text-[#6B6560] hover:bg-white hover:text-[#1C1B19]'
            }`}
          >
            Overzicht
            <span className="text-xs opacity-70">{appliances.length}</span>
          </button>
          {navEntries.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => selectType(key)}
              className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                activeView === key
                  ? 'bg-[#1C1B19] text-white'
                  : 'text-[#6B6560] hover:bg-white hover:text-[#1C1B19]'
              }`}
            >
              <span className="truncate">{label}</span>
              <span className="ml-1 shrink-0 text-xs opacity-70">{count}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {/* Mobiel: type dropdown */}
          <div className="mb-4 md:hidden">
            <select
              value={activeView}
              onChange={e => {
                const v = e.target.value
                if (v === 'overview') { setActiveView('overview'); setSpecFilters({}) }
                else selectType(v)
              }}
              className="w-full rounded-lg border border-[#DDD8D2] bg-white px-3 py-2 text-sm"
            >
              <option value="overview">Overzicht ({appliances.length})</option>
              {navEntries.map(({ key, label, count }) => (
                <option key={key} value={key}>
                  {label} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* Filters */}
          <div className="sticky top-0 z-10 mb-4 rounded-xl border border-[#DDD8D2] bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="relative min-w-[180px] flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Zoek merk of model..."
                  className="w-full rounded-lg border border-[#DDD8D2] py-2 pl-8 pr-3 text-sm focus:border-[#1C1B19] focus:outline-none"
                />
              </div>
              <div className="flex gap-1">
                {['alle', 'budget', 'midden', 'premium'].map(c => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs capitalize transition-colors ${
                      activeCategory === c
                        ? 'border-[#1C1B19] bg-[#1C1B19] text-white'
                        : 'border-[#DDD8D2] text-[#6B6560] hover:border-[#1C1B19]'
                    }`}
                  >
                    {c === 'alle' ? 'Alle' : c}
                  </button>
                ))}
              </div>
              <EnergyLabelFilter selected={energyLabelFilters} onChange={setEnergyLabelFilters} />
            </div>
            {SpecFilterRow()}
          </div>

          {/* Overzicht: type-kaarten, geen lange lijst — behalve tijdens het
              zoeken, dan tonen we direct de resultatenlijst hieronder,
              anders leek zoeken vanuit Overzicht niets te doen. */}
          {activeView === 'overview' && !q ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {navEntries.map(({ key, label, count }) => {
                const items = itemsForNavKey(key)
                const range = priceRange(items)
                return (
                  <button
                    key={key}
                    onClick={() => selectType(key)}
                    className="group rounded-xl border border-[#DDD8D2] bg-white p-4 text-left transition-colors hover:border-[#C9A96E]"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-[#1C1B19]">{label}</p>
                        <p className="mt-0.5 text-sm text-[#6B6560]">{count} producten</p>
                      </div>
                      <ChevronRight size={16} className="text-[#DDD8D2] group-hover:text-[#C9A96E]" />
                    </div>
                    {range && (
                      <p className="mt-3 text-sm text-[#6B6560]">
                        {formatPrice(range.min)}
                        {range.min !== range.max && ` – ${formatPrice(range.max)}`}
                      </p>
                    )}
                  </button>
                )
              })}
              {appliances.length === 0 && (
                <div className="col-span-full rounded-xl border border-[#DDD8D2] bg-white py-16 text-center">
                  <p className="text-sm text-[#6B6560]">Nog geen apparatuur</p>
                  <Link href="/apparatuur/inbox" className="mt-1 inline-block text-sm text-[#C9A96E] hover:underline">
                    Gmail synchroniseren →
                  </Link>
                </div>
              )}
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-xl border border-[#DDD8D2] bg-white py-16 text-center">
              <p className="text-sm text-[#6B6560]">Geen resultaten</p>
            </div>
          ) : (
            /* Compacte tabel */
            <div className={`overflow-hidden rounded-xl border border-[#DDD8D2] bg-white ${selected.size > 0 ? 'mb-20' : ''}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2] text-left text-xs text-[#6B6560]">
                      <th className="w-10 px-3 py-2.5" />
                      <th className="cursor-pointer px-3 py-2.5 font-medium hover:text-[#1C1B19]" onClick={() => toggleSort('brand')}>
                        Product {sortKey === 'brand' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Kernspec</th>
                      <th className="cursor-pointer px-3 py-2.5 font-medium hover:text-[#1C1B19]" onClick={() => toggleSort('price')}>
                        Prijs {sortKey === 'price' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="hidden cursor-pointer px-3 py-2.5 font-medium hover:text-[#1C1B19] sm:table-cell" onClick={() => toggleSort('category')}>
                        Segment {sortKey === 'category' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="hidden px-3 py-2.5 font-medium md:table-cell">Leverancier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EDE9]">
                    {sorted.map(a => (
                      <tr
                        key={a.id}
                        onClick={() => setDetailId(a.id)}
                        className={`cursor-pointer transition-colors hover:bg-[#F7F5F2] ${
                          selected.has(a.id) ? 'bg-[#FAF8F5]' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(a.id)}
                            onChange={() => toggleAppliance(a.id)}
                            className="rounded border-[#DDD8D2]"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[#1C1B19]">{a.brand}</p>
                          <p className="text-xs text-[#6B6560]">{a.model}</p>
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-[#6B6560] lg:table-cell">
                          {getSpecSummary(a)}
                        </td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                          {formatPrice(a.price)}
                        </td>
                        <td className="hidden px-3 py-2.5 sm:table-cell">
                          {a.category ? (
                            <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${CATEGORY_COLORS[a.category]}`}>
                              {a.category}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-[#6B6560] md:table-cell">
                          {a.supplier?.name ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[#DDD8D2] px-4 py-2 text-xs text-[#6B6560]">
                {sorted.length} product{sorted.length !== 1 ? 'en' : ''} · klik op rij voor details
              </div>
            </div>
          )}
        </div>
      </div>

      <DetailSheet
        appliance={detailAppliance}
        open={detailId != null}
        onOpenChange={open => { if (!open) setDetailId(null) }}
        selected={detailId != null && selected.has(detailId)}
        onToggle={() => detailId && toggleAppliance(detailId)}
        onDelete={() => detailId && deleteAppliance(detailId)}
      />

      <SelectionBar
        selected={selected}
        appliances={appliances}
        onClear={() => setSelected(new Set())}
      />
    </>
  )
}
