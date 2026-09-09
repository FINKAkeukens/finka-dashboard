'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'

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
}

type ColumnKey = 'reference' | 'title' | 'customerName' | 'statusLabel' | 'leadTime' | 'milestone'
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
]

const searchableKeys: SearchableKey[] = ['reference', 'title', 'customerName']

export default function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const [filters, setFilters] = useState<Record<SearchableKey, string>>({
    reference: '',
    title: '',
    customerName: '',
  })

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
      ),
    [rows, filters]
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
              {columns.map((col) => (
                <th key={col.key} className="text-left px-5 pt-3 pb-1 text-xs font-medium text-[#6B6560] whitespace-nowrap">
                  {col.label}
                </th>
              ))}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
