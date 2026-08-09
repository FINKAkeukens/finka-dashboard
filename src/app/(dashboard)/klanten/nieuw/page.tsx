'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NieuweKlantPage() {
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
      .from('finka_customers')
      .insert({
        first_name: form.get('first_name') as string,
        last_name: form.get('last_name') as string,
        email: form.get('email') as string || null,
        phone: form.get('phone') as string || null,
        address: form.get('address') as string || null,
        city: form.get('city') as string || null,
        notes: form.get('notes') as string || null,
        status: form.get('status') as string,
        reference_number: '',
      })
      .select()
      .single()

    if (error) {
      setError('Er ging iets mis: ' + error.message)
      setLoading(false)
    } else {
      await supabase.from('finka_offers').insert({
        customer_id: data.id,
        subtitle: (form.get('city') as string) ? `Een woonkeuken in ${form.get('city')}.` : '',
        intro_text: `Hi ${form.get('first_name')},\n\nWe hebben onze plannen voor jouw keuken op papier gezet. Hieronder vind je een overzicht van wat we voor ogen hebben — qua stijl, materialen en uitvoering.\n\nNeem de tijd om het rustig door te lezen. We zijn benieuwd wat je ervan vindt.\n\nMet vriendelijke groet,\nMerel & Kieke\nFINKA keukens`,
        specs: {
          fronten: ['Hoogwaardige fronten in hoofdkleur — kleur mag je kiezen', 'Greeplijsten bij hoge kasten en bovenste rij lades', 'Push to open in onderste lades van de onderkasten'],
          werkblad: ['RVS blad van 4 mm dik, werkdiepte 96 cm', 'Gootsteen ingelast in het RVS blad', 'Levering, installatie en inmeting van het blad ná installatie van de keukenkasten'],
          klimuur: [],
          kookeiland: [],
          apparatuur: [],
          maatwerk: ['Levering en installatie van de keuken'],
        },
        inspiration_images: [],
      })
      router.push(`/klanten/${data.id}?tab=offerte`)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/klanten" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar klanten
      </Link>

      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-6">Nieuwe klant</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">Voornaam *</Label>
            <Input id="first_name" name="first_name" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">Achternaam *</Label>
            <Input id="last_name" name="last_name" required />
          </div>
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="address">Adres</Label>
            <Input id="address" name="address" placeholder="Straat + huisnummer" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">Stad</Label>
            <Input id="city" name="city" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue="prospect"
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="prospect">Prospect</option>
            <option value="actief">Actief</option>
            <option value="on-hold">On hold</option>
            <option value="afgerond">Afgerond</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notities</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
            placeholder="Bijv. voorkeur stijl, budget, bijzonderheden..."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Opslaan...' : 'Klant opslaan'}
          </Button>
          <Link href="/klanten">
            <Button type="button" variant="outline">Annuleren</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
