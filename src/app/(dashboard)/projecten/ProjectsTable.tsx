'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react'

// Alles wat de tabel toont staat al klaar in deze platte vorm — de
// serverpagina rekent de mijlpaal/doorlooptijd uit, hier wordt alleen nog
// gefilterd en gerenderd. Dat houdt het filteren op één plek: dezelfde tekst
// die je ziet, is de tekst waarop gezocht wordt.
export interface ProjectRow {
  id: string
  reference: string
  title: string
  customerId: string | null
  customerName: string
  statusLabel: string
  statusColor: string | null
  leadTime: string
  milestone: string
  milestoneClass: string
  hasPortalActivity: boolean
  lastEdited: string
  // Ruwe waarden om op te sorteren — de weergavetekst hierboven ("12 dagen",
  // "Inmeten — 3 okt") sorteert niet logisch. null = onbekend, staat altijd
  // onderaan, in welke richting je ook sorteert.
  sort: {
    customer: string | null
    statusOrder: number | null
    leadDays: number | null
    milestoneTime: number | null
    lastEditedTime: number
  }
}

type ColumnKey = 'reference' | 'title' | 'customerName' | 'statusLabel' | 'leadTime' | 'milestone' | 'lastEdited'
// Alleen de kolommen met vrije tekst krijgen een zoekveld. Status heeft de
// knoppenbalk erboven al, en doorlooptijd/mijlpaal zijn afgeleide waarden
// waar tekstueel zoeken weinig oplevert.
type SearchableKey = 'reference' | 'title' | 'customerName'

const columns: { key: ColumnKey; label: string; placeholder?: string }[] = [
  { key: 'reference', label: 'Referentie', placeholder: 'Zoek ref...' },
  { key: 'title', label: 'Project', placeholder: 'Zoek project...' },
  { key: 'customerName', label: 'Klant', placeholder: 'Zoek klant...' },
  { key: 'statusLabel', label: 'Status' },
  { key: 'leadTime', label: 'Doorlooptijd' },
  { key: 'milestone', label: 'Volgende mijlpaal' },
  { key: 'lastEdited', label: 'Laatst bewerkt' },
]

type SortDir = 'asc' | 'desc'
interface SortState { key: ColumnKey; dir: SortDir }

// Richting bij de eerste klik op een kolom — wat je daar meestal wilt zien.
// Nog een keer klikken draait 'm om.
const FIRST_CLICK_DIR: Record<ColumnKey, SortDir> = {
  reference: 'desc', // nieuwste project bovenaan
  title: 'asc', // A → Z
  customerName: 'asc', // A → Z op achternaam
  statusLabel: 'asc', // volgorde van de pijplijn (zoals de statusknoppen)
  leadTime: 'desc', // langst lopend bovenaan
  milestone: 'asc', // eerstvolgende datum bovenaan
  lastEdited: 'desc', // net bewerkt bovenaan
}

// Zelfde volgorde als de server aanlevert: eerstvolgende mijlpaal bovenaan.
const DEFAULT_SORT: SortState = { key: 'milestone', dir: 'asc' }
const SORT_STORAGE_KEY = 'finka-projecten-sortering'

const collator = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' })

// Waarde per kolom om op te sorteren; null = onbekend (altijd onderaan).
function sortValue(row: ProjectRow, key: ColumnKey): string | number | null {
  switch (key) {
    case 'reference': return row.reference || null
    case 'title': return row.title || null
    case 'customerName': return row.sort.customer
    case 'statusLabel': return row.sort.statusOrder
    case 'leadTime': return row.sort.leadDays
    case 'milestone': return row.sort.milestoneTime
    case 'lastEdited': return row.sort.lastEditedTime
  }
}

function compareValues(a: string | number | null, b: string | number | null, dir: SortDir): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b))
  return dir === 'asc' ? cmp : -cmp
}

// Bij gelijke waarde (bv. dezelfde status) beslist eerst de eerstvolgende
// mijlpaal, dan het referentienummer — zo blijft de volgorde binnen een
// groep ook logisch i.p.v. willekeurig.
function compareRows(a: ProjectRow, b: ProjectRow, sort: SortState): number {
  return (
    compareValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir) ||
    compareValues(a.sort.milestoneTime, b.sort.milestoneTime, 'asc') ||
    compareValues(a.reference, b.reference, 'desc')
  )
}

const searchableKeys: SearchableKey[] = ['reference', 'title', 'customerName']

export default function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const [filters, setFilters] = useState<Record<SearchableKey, string>>({
    reference: '',
    title: '',
    customerName: '',
  })

  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

  // Gekozen sortering onthouden in deze browser, zodat 'ie na het openen van
  // een project en weer teruggaan nog staat. Leest pas na het mounten (niet
  // tijdens render) om een hydration-verschil met de server te voorkomen.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? 'null') as SortState | null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalig herstellen uit localStorage
      if (saved && saved.key in FIRST_CLICK_DIR && (saved.dir === 'asc' || saved.dir === 'desc')) setSort(saved)
    } catch {
      // geen of ongeldige opgeslagen sortering — standaard aanhouden
    }
  }, [])

  function toggleSort(key: ColumnKey) {
    const next: SortState = sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: FIRST_CLICK_DIR[key] }
    setSort(next)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // opslaan is een gemak, geen vereiste
    }
  }

  const activeFilterCount = Object.values(filters).filter((v) => v.trim()).length

  // Per kolom een losse zoekterm; een rij blijft staan als hij aan álle
  // ingevulde filters voldoet (AND), hoofdletterongevoelig op deelstring.
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        searchableKeys.every((key) => {
          const term = filters[key].trim().toLowerCase()
          return !term || row[key].toLowerCase().includes(term)
        })
      ).sort((a, b) => compareRows(a, b, sort)),
    [rows, filters, sort]
  )

  function setFilter(key: SearchableKey, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setFilters({ reference: '', title: '', customerName: '' })
  }

  return (
    <div className="space-y-2">
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#6B6560]">
          <span>
            <span className="font-medium text-[#1C1B19]">{filtered.length}</span> van {rows.length} projecten
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 text-[#9A948D] hover:text-[#1C1B19]"
          >
            <X size={11} />
            Filters wissen
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
              {columns.map((col) => {
                const active = sort.key === col.key
                const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={col.key}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="text-left px-5 pt-3 pb-1 text-xs font-medium whitespace-nowrap"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      title="Sorteren — nog een keer klikken draait de volgorde om"
                      className={`group inline-flex items-center gap-1 hover:text-[#1C1B19] ${active ? 'text-[#1C1B19]' : 'text-[#6B6560]'}`}
                    >
                      {col.label}
                      <Icon size={11} className={active ? '' : 'opacity-0 group-hover:opacity-60'} />
                    </button>
                  </th>
                )
              })}
            </tr>
            <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
              {columns.map((col) => {
                const key = searchableKeys.find((k) => k === col.key)
                return (
                  <th key={col.key} className="px-5 pb-3 pt-0 font-normal">
                    {key && (
                      <div className="relative">
                        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9A948D]" />
                        <input
                          value={filters[key]}
                          onChange={(e) => setFilter(key, e.target.value)}
                          placeholder={col.placeholder}
                          className="w-full rounded-lg border border-[#DDD8D2] bg-white py-1 pl-6 pr-6 text-xs font-normal text-[#1C1B19] placeholder:text-[#9A948D] focus:border-[#1C1B19] focus:outline-none"
                        />
                        {filters[key] && (
                          <button
                            type="button"
                            onClick={() => setFilter(key, '')}
                            title="Wissen"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#9A948D] hover:text-[#1C1B19]"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDD8D2]">
            {!filtered.length ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-[#6B6560]">
                  Geen projecten die aan de zoekopdracht voldoen
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[#F7F5F2] transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/projecten/${row.id}`} className="font-mono text-xs text-[#6B6560] hover:text-[#1C1B19]">
                      {row.reference}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <Link href={`/projecten/${row.id}`} className="font-medium text-[#1C1B19] hover:underline">
                        {row.title}
                      </Link>
                      {row.hasPortalActivity && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-green-500"
                          title="De klant heeft wijzigingen doorgevoerd in het portaal"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {row.customerId ? (
                      <Link href={`/klanten/${row.customerId}`} className="text-[#6B6560] hover:text-[#1C1B19]">
                        {row.customerName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  {/* whitespace-nowrap: een label van twee woorden ("In
                      uitvoering") brak middenin de pil af zodra de kolom krap
                      werd; de kolom mag liever iets breder worden. */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {row.statusLabel && (
                      <span
                        className="inline-block text-xs px-2 py-0.5 rounded-full border whitespace-nowrap"
                        style={{ borderColor: row.statusColor ?? undefined, color: row.statusColor ?? undefined }}
                      >
                        {row.statusLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#6B6560]">{row.leadTime}</td>
                  <td className="px-5 py-3.5 text-xs">
                    <span className={row.milestoneClass || 'text-[#9A948D] italic'}>{row.milestone}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#6B6560] whitespace-nowrap">{row.lastEdited}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
