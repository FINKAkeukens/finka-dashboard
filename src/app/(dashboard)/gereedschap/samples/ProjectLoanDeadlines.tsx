'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate, todayIso } from '@/lib/samples'

export interface ProjectLoanGroup {
  projectId: string
  name: string
  loanIds: string[]
  sampleNames: string[]
  // Gezamenlijke terugbrengdatum als alle uitleningen dezelfde hebben.
  dueDate: string | null
  mixedDates: boolean
}

// Per project in één keer de terugbrengdatum van alle uitgeleende samples
// aanpassen.
export default function ProjectLoanDeadlines({ groups }: { groups: ProjectLoanGroup[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [dates, setDates] = useState<Record<string, string>>(
    Object.fromEntries(groups.map((g) => [g.projectId, g.dueDate ?? '']))
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ projectId: string; text: string; error?: boolean } | null>(null)

  async function apply(g: ProjectLoanGroup) {
    setBusy(g.projectId)
    setMessage(null)
    const due = dates[g.projectId] || null
    const { error } = await supabase.from('finka_sample_loans').update({ due_date: due }).in('id', g.loanIds)
    setBusy(null)
    if (error) {
      setMessage({ projectId: g.projectId, text: error.message, error: true })
      return
    }
    setMessage({ projectId: g.projectId, text: `Aangepast voor ${g.loanIds.length === 1 ? '1 sample' : `${g.loanIds.length} samples`}.` })
    router.refresh()
  }

  if (!groups.length) return null

  return (
    <details className="bg-white rounded-xl border border-[#DDD8D2] mb-5">
      <summary className="px-4 py-3 text-sm font-medium text-[#1C1B19] cursor-pointer select-none">
        Terugbrengdatum per project <span className="font-normal text-[#6B6560]">({groups.length})</span>
      </summary>
      <ul className="divide-y divide-[#EFEBE6] border-t border-[#DDD8D2]">
        {groups.map((g) => {
          const overdue = !!g.dueDate && !g.mixedDates && g.dueDate < todayIso()
          const changed = (dates[g.projectId] || null) !== (g.mixedDates ? '__mixed' : g.dueDate)
          return (
            <li key={g.projectId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="flex-[1_1_260px] min-w-0">
                <p className="text-sm text-[#1C1B19] truncate">{g.name}</p>
                <p className="text-xs text-[#6B6560] truncate" title={g.sampleNames.join(', ')}>
                  {g.loanIds.length === 1 ? '1 sample' : `${g.loanIds.length} samples`}: {g.sampleNames.join(', ')}
                </p>
                <p className={cn('text-xs', overdue ? 'text-red-600' : 'text-[#6B6560]')}>
                  {g.mixedDates ? 'Nu verschillende datums' : g.dueDate ? `Nu terug op ${formatDate(g.dueDate)}` : 'Nu geen datum'}
                </p>
              </div>
              <Input
                type="date"
                aria-label={`Nieuwe terugbrengdatum voor ${g.name}`}
                value={dates[g.projectId] ?? ''}
                onChange={(e) => setDates((prev) => ({ ...prev, [g.projectId]: e.target.value }))}
                className="h-9 w-40"
              />
              <Button size="sm" className="h-9" disabled={busy === g.projectId || !changed} onClick={() => apply(g)}>
                {busy === g.projectId ? 'Bezig...' : 'Voor alle aanpassen'}
              </Button>
              {message?.projectId === g.projectId && (
                <p className={cn('basis-full text-xs', message.error ? 'text-red-600' : 'text-[#6B6560]')}>{message.text}</p>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
