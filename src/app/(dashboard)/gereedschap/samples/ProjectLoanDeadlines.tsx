'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate, todayIso } from '@/lib/samples'

export interface ProjectLoanGroup {
  projectId: string
  name: string
  loans: { id: string; sampleName: string; dueDate: string | null }[]
  // Gezamenlijke terugbrengdatum als alle uitleningen dezelfde hebben.
  dueDate: string | null
  mixedDates: boolean
}

const count = (n: number) => (n === 1 ? '1 sample' : `${n} samples`)

// Overzicht van de uitgeleende samples per project. De aangevinkte samples
// krijgen in één keer een nieuwe terugbrengdatum of worden teruggemeld.
export default function ProjectLoanDeadlines({ groups }: { groups: ProjectLoanGroup[] }) {
  if (!groups.length) return null

  return (
    <details className="bg-white rounded-xl border border-[#DDD8D2] mb-5">
      <summary className="px-4 py-3 text-sm font-medium text-[#1C1B19] cursor-pointer select-none">
        Overzicht per project <span className="font-normal text-[#6B6560]">({groups.length})</span>
      </summary>
      <ul className="divide-y divide-[#EFEBE6] border-t border-[#DDD8D2]">
        {groups.map((g) => (
          <ProjectGroup key={g.projectId} group={g} />
        ))}
      </ul>
    </details>
  )
}

function ProjectGroup({ group: g }: { group: ProjectLoanGroup }) {
  const router = useRouter()
  const supabase = createClient()
  const [date, setDate] = useState(g.dueDate ?? '')
  const [checked, setChecked] = useState<Set<string>>(() => new Set(g.loans.map((l) => l.id)))
  const [busy, setBusy] = useState<'date' | 'return' | null>(null)
  const [message, setMessage] = useState<{
    text: string
    error?: boolean
  } | null>(null)

  // Na een refresh kunnen teruggebrachte samples verdwenen zijn.
  const selected = g.loans.filter((l) => checked.has(l.id)).map((l) => l.id)
  const allChecked = selected.length === g.loans.length
  const today = todayIso()

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function update(kind: 'date' | 'return') {
    if (!selected.length) return
    if (kind === 'return' && !confirm(`${count(selected.length)} als teruggebracht markeren?`)) return
    setBusy(kind)
    setMessage(null)
    const patch = kind === 'date' ? { due_date: date || null } : { returned_at: today }
    const { error } = await supabase.from('finka_sample_loans').update(patch).in('id', selected)
    setBusy(null)
    if (error) {
      setMessage({ text: error.message, error: true })
      return
    }
    setMessage({
      text: kind === 'date' ? `Datum aangepast voor ${count(selected.length)}.` : `${count(selected.length)} teruggemeld.`,
    })
    router.refresh()
  }

  return (
    <li>
      <details className="group">
        <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 cursor-pointer select-none list-none hover:bg-[#FAF9F7] [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="text-[#6B6560] transition-transform group-open:rotate-90" />
          <p className="text-sm font-medium text-[#1C1B19] flex-1 min-w-0 truncate">{g.name}</p>
          <p className={cn('text-xs', g.dueDate && !g.mixedDates && g.dueDate < today ? 'text-red-600' : 'text-[#6B6560]')}>
            {count(g.loans.length)} ·{' '}
            {g.mixedDates ? 'verschillende datums' : g.dueDate ? `terug op ${formatDate(g.dueDate)}` : 'geen datum'}
          </p>
        </summary>
        <div className="px-4 pb-3 space-y-2">
          <div className="rounded-lg border border-[#EFEBE6]">
            <label className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#6B6560] border-b border-[#EFEBE6] bg-[#F7F5F2] rounded-t-lg cursor-pointer">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = selected.length > 0 && !allChecked
                }}
                onChange={() => setChecked(allChecked ? new Set() : new Set(g.loans.map((l) => l.id)))}
                className="w-4 h-4 accent-[#1C1B19]"
              />
              Alles aanvinken
              <span className="font-normal">
                ({selected.length} van {g.loans.length})
              </span>
            </label>
            <ul>
              {g.loans.map((l) => {
                const overdue = !!l.dueDate && l.dueDate < today
                return (
                  <li key={l.id}>
                    <label className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-[#1C1B19] cursor-pointer hover:bg-[#FAF9F7]">
                      <input
                        type="checkbox"
                        checked={checked.has(l.id)}
                        onChange={() => toggle(l.id)}
                        className="w-4 h-4 accent-[#1C1B19]"
                      />
                      <span className="flex-1 min-w-0 truncate">{l.sampleName}</span>
                      <span className={cn('text-xs shrink-0', overdue ? 'text-red-600' : 'text-[#6B6560]')}>
                        {l.dueDate ? formatDate(l.dueDate) : 'geen datum'}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label={`Nieuwe terugbrengdatum voor ${g.name}`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-40"
            />
            <Button size="sm" variant="outline" className="h-9" disabled={!!busy || !selected.length} onClick={() => update('date')}>
              {busy === 'date' ? 'Bezig...' : 'Datum aanpassen'}
            </Button>
            <Button size="sm" className="h-9" disabled={!!busy || !selected.length} onClick={() => update('return')}>
              {busy === 'return' ? 'Bezig...' : 'Teruggebracht'}
            </Button>
            {message && <p className={cn('text-xs', message.error ? 'text-red-600' : 'text-[#6B6560]')}>{message.text}</p>}
          </div>
        </div>
      </details>
    </li>
  )
}
