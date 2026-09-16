'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NieuweLeverancierPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)

    const { data, error } = await supabase
      .from('finka_suppliers')
      .insert({
        name: form.get('name') as string,
        email: (form.get('email') as string) || null,
        phone: (form.get('phone') as string) || null,
        notes: (form.get('notes') as string) || null,
      })
      .select()
      .single()

    if (error) {
      setError('Er ging iets mis: ' + error.message)
      setLoading(false)
    } else {
      router.push(`/leveranciers/${data.id}`)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/leveranciers" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar leveranciers
      </Link>

      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-6">Nieuwe leverancier</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Naam *</Label>
          <Input id="name" name="name" required autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mailadres</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefoon</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Aantekeningen</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
            placeholder="Bijv. afspraken, contactpersoon, bijzonderheden..."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Opslaan...' : 'Leverancier opslaan'}
          </Button>
          <Link href="/leveranciers">
            <Button type="button" variant="outline">Annuleren</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
