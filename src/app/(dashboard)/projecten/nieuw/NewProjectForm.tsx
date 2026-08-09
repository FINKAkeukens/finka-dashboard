'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logAudit } from '@/lib/audit'
import { Customer, ProjectStatus } from '@/lib/types'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewProjectForm({
  customers,
  statuses,
  defaultCustomerId,
}: {
  customers: Pick<Customer, 'id' | 'first_name' | 'last_name'>[]
  statuses: ProjectStatus[]
  defaultCustomerId?: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('finka_projects')
      .insert({
        customer_id: form.get('customer_id') as string,
        title: form.get('title') as string,
        status_id: form.get('status_id') as string,
        created_by: user?.email ?? null,
        updated_by: user?.email ?? null,
      })
      .select()
      .single()

    if (error) {
      setError('Er ging iets mis: ' + error.message)
      setLoading(false)
      return
    }

    await logAudit(supabase, {
      tableName: 'finka_projects',
      recordId: data.id,
      action: 'create',
      newValue: data.title,
      changedBy: user?.email,
    })

    router.push(`/projecten/${data.id}`)
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/projecten" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar projecten
      </Link>

      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-6">Nieuw project</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="customer_id">Klant *</Label>
          <select
            id="customer_id"
            name="customer_id"
            required
            defaultValue={defaultCustomerId ?? ''}
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="" disabled>Kies een klant...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Projectnaam *</Label>
          <Input id="title" name="title" required placeholder="Bijv. Keuken Van der Berg" autoFocus />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status_id">Status</Label>
          <select
            id="status_id"
            name="status_id"
            defaultValue={statuses[0]?.id}
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Opslaan...' : 'Project opslaan'}
          </Button>
          <Link href="/projecten">
            <Button type="button" variant="outline">Annuleren</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
