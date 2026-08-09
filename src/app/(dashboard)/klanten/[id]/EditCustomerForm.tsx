'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Customer } from '@/lib/types'
import { Edit, Trash2 } from 'lucide-react'

export default function EditCustomerForm({ customer }: { customer: Customer }) {
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
      .from('finka_customers')
      .update({
        first_name: form.get('first_name') as string,
        last_name: form.get('last_name') as string,
        email: form.get('email') as string || null,
        phone: form.get('phone') as string || null,
        address: form.get('address') as string || null,
        city: form.get('city') as string || null,
        notes: form.get('notes') as string || null,
        status: form.get('status') as string,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id)

    if (error) { setError(error.message); setLoading(false) }
    else { setEditing(false); router.refresh() }
  }

  async function handleDelete() {
    if (!confirm(`Klant ${customer.first_name} ${customer.last_name} verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return
    await supabase.from('finka_customers').delete().eq('id', customer.id)
    router.push('/klanten')
  }

  if (!editing) {
    return (
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
    )
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-4">
      <h2 className="text-sm font-medium text-[#1C1B19] mb-4">Klant bewerken</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Voornaam</Label>
          <Input name="first_name" defaultValue={customer.first_name} required />
        </div>
        <div className="space-y-1.5">
          <Label>Achternaam</Label>
          <Input name="last_name" defaultValue={customer.last_name} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input name="email" type="email" defaultValue={customer.email ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefoon</Label>
          <Input name="phone" defaultValue={customer.phone ?? ''} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Adres</Label>
          <Input name="address" defaultValue={customer.address ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label>Stad</Label>
          <Input name="city" defaultValue={customer.city ?? ''} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <select name="status" defaultValue={customer.status}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
          <option value="prospect">Prospect</option>
          <option value="actief">Actief</option>
          <option value="on-hold">On hold</option>
          <option value="afgerond">Afgerond</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Notities</Label>
        <textarea name="notes" defaultValue={customer.notes ?? ''} rows={3}
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
