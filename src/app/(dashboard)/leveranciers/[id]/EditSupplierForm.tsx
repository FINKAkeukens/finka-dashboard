'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Supplier } from '@/lib/types'
import { Edit, Trash2 } from 'lucide-react'

export default function EditSupplierForm({ supplier }: { supplier: Supplier }) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)

    const { error } = await supabase
      .from('finka_suppliers')
      .update({
        name: form.get('name') as string,
        email: (form.get('email') as string) || null,
        phone: (form.get('phone') as string) || null,
        notes: (form.get('notes') as string) || null,
      })
      .eq('id', supplier.id)

    if (error) { setError(error.message); setLoading(false) }
    else { setEditing(false); router.refresh() }
  }

  async function handleDelete() {
    if (!confirm(`Leverancier ${supplier.name} verwijderen? Alle mappen en documenten van deze leverancier worden ook verwijderd. Dit kan niet ongedaan gemaakt worden.`)) return
    await supabase.from('finka_suppliers').delete().eq('id', supplier.id)
    router.push('/leveranciers')
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {supplier.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{supplier.notes}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit size={13} className="mr-1.5" />
            Bewerken
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:border-red-200">
            <Trash2 size={13} className="mr-1.5" />
            Verwijderen
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-4">
      <h2 className="text-sm font-medium text-[#1C1B19] mb-4">Leverancier bewerken</h2>

      <div className="space-y-1.5">
        <Label>Naam</Label>
        <Input name="name" defaultValue={supplier.name} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input name="email" type="email" defaultValue={supplier.email ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefoon</Label>
          <Input name="phone" defaultValue={supplier.phone ?? ''} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Aantekeningen</Label>
        <textarea name="notes" defaultValue={supplier.notes ?? ''} rows={4}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={loading}>{loading ? 'Opslaan...' : 'Opslaan'}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Annuleren</Button>
      </div>
    </form>
  )
}
