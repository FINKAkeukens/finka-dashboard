'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logFieldChanges, logAudit } from '@/lib/audit'
import { Customer, Project, ProjectStatus } from '@/lib/types'
import { Edit, Archive } from 'lucide-react'

export default function EditProjectForm({
  project,
  statuses,
  customers,
}: {
  project: Project
  statuses: ProjectStatus[]
  customers: Pick<Customer, 'id' | 'first_name' | 'last_name'>[]
}) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const { data: { user } } = await supabase.auth.getUser()

    const before = { title: project.title, status_id: project.status_id, customer_id: project.customer_id }
    const after = {
      title: form.get('title') as string,
      status_id: form.get('status_id') as string,
      customer_id: form.get('customer_id') as string,
    }

    const { error } = await supabase
      .from('finka_projects')
      .update({ ...after, updated_by: user?.email ?? null, updated_at: new Date().toISOString() })
      .eq('id', project.id)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    await logFieldChanges(supabase, 'finka_projects', project.id, before, after, user?.email)
    setEditing(false)
    router.refresh()
  }

  // Projecten worden gearchiveerd, niet hard verwijderd — historische offertes/
  // facturen/audit-log die eraan hangen mogen nooit stilzwijgend kapotgaan.
  async function handleArchive() {
    if (!confirm(`Project "${project.title}" archiveren? Het verdwijnt uit de lijst maar blijft bewaard.`)) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('finka_projects')
      .update({ archived_at: new Date().toISOString(), updated_by: user?.email ?? null })
      .eq('id', project.id)

    await logAudit(supabase, {
      tableName: 'finka_projects',
      recordId: project.id,
      action: 'archive',
      changedBy: user?.email,
    })

    router.push('/projecten')
  }

  if (!editing) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Edit size={13} className="mr-1.5" />
          Bewerken
        </Button>
        <Button variant="outline" size="sm" onClick={handleArchive} className="text-red-600 hover:text-red-700 hover:border-red-200">
          <Archive size={13} className="mr-1.5" />
          Archiveren
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-4">
      <h2 className="text-sm font-medium text-[#1C1B19] mb-4">Project bewerken</h2>

      <div className="space-y-1.5">
        <Label>Projectnaam</Label>
        <Input name="title" defaultValue={project.title} required />
      </div>
      <div className="space-y-1.5">
        <Label>Klant</Label>
        <select
          name="customer_id"
          defaultValue={project.customer_id}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </select>
        <p className="text-xs text-[#9A948D]">Offerte, facturen en historie van dit project gaan mee naar de nieuwe klant.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <select
          name="status_id"
          defaultValue={project.status_id ?? ''}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
        >
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={loading}>{loading ? 'Opslaan...' : 'Opslaan'}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Annuleren</Button>
      </div>
    </form>
  )
}
