'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatDate, todayIso } from '@/lib/samples'
import { LoanWithProject, loanBorrower } from '../loan-borrower'

export interface ProjectOption {
  id: string
  title: string
  customer: { first_name: string; last_name: string } | null
}

const selectClass =
  'w-full h-9 px-3 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

export default function SampleLoans({
  sampleId,
  loans,
  projects,
}: {
  sampleId: string
  loans: LoanWithProject[]
  projects: ProjectOption[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [projectId, setProjectId] = useState('')

  const openLoan = loans.find((l) => !l.returned_at) ?? null
  const history = loans.filter((l) => l.returned_at)

  async function handleLend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const borrowerName = (form.get('borrower_name') as string)?.trim()
    if (!projectId && !borrowerName) {
      setError('Kies een project of vul een naam in.')
      return
    }
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('finka_sample_loans').insert({
      sample_id: sampleId,
      project_id: projectId || null,
      borrower_name: projectId ? null : borrowerName,
      lent_at: (form.get('lent_at') as string) || todayIso(),
      due_date: (form.get('due_date') as string) || null,
      notes: (form.get('notes') as string) || null,
      created_by: user?.email ?? null,
    })
    setLoading(false)
    if (error) { setError('Er ging iets mis: ' + error.message); return }
    setProjectId('')
    router.refresh()
  }

  async function handleReturn() {
    if (!openLoan) return
    setLoading(true)
    setError('')
    const { error } = await supabase
      .from('finka_sample_loans')
      .update({ returned_at: todayIso() })
      .eq('id', openLoan.id)
    setLoading(false)
    if (error) { setError('Er ging iets mis: ' + error.message); return }
    router.refresh()
  }

  const overdue = openLoan?.due_date && openLoan.due_date < todayIso()

  return (
    <div className="space-y-6">
      {openLoan ? (
        <div className={cn('rounded-xl border p-5', overdue ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100')}>
          <p className="text-sm font-medium text-[#1C1B19]">Ligt bij {loanBorrower(openLoan)}</p>
          <p className="text-sm text-[#6B6560] mt-1">
            Uitgeleend op {formatDate(openLoan.lent_at)}
            {openLoan.due_date && <> · {overdue ? 'had terug moeten zijn op' : 'terug uiterlijk'} {formatDate(openLoan.due_date)}</>}
          </p>
          {openLoan.notes && <p className="text-sm text-[#6B6560] mt-1 whitespace-pre-wrap">{openLoan.notes}</p>}
          <Button size="sm" className="mt-4" onClick={handleReturn} disabled={loading}>
            {loading ? 'Opslaan...' : 'Teruggebracht'}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleLend} className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project_id">Project</Label>
            <select id="project_id" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
              <option value="">Geen project — vul hieronder een naam in</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title.trim()}{p.customer ? ` — ${p.customer.first_name} ${p.customer.last_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          {!projectId && (
            <div className="space-y-1.5">
              <Label htmlFor="borrower_name">Naam</Label>
              <Input id="borrower_name" name="borrower_name" placeholder="Bijv. naam van een prospect" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lent_at">Uitgeleend op</Label>
              <Input id="lent_at" name="lent_at" type="date" defaultValue={todayIso()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_date">Terug uiterlijk</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan_notes">Aantekeningen</Label>
            <Input id="loan_notes" name="notes" />
          </div>
          <Button type="submit" size="sm" disabled={loading}>{loading ? 'Opslaan...' : 'Uitlenen'}</Button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {history.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-[#6B6560] mb-2">Eerder uitgeleend</h3>
          <ul className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
            {history.map((l) => (
              <li key={l.id} className="px-4 py-3 text-sm">
                <p className="text-[#1C1B19]">{loanBorrower(l)}</p>
                <p className="text-xs text-[#6B6560]">
                  {formatDate(l.lent_at)} – {formatDate(l.returned_at)}
                  {l.notes && ` · ${l.notes}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
