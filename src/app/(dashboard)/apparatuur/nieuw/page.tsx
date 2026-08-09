'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { ApplianceType } from '@/lib/types'

const typeOptions: { value: ApplianceType; label: string }[] = [
  { value: 'kookplaat', label: 'Kookplaat' },
  { value: 'oven', label: 'Oven' },
  { value: 'combi-oven', label: 'Combi-oven' },
  { value: 'vaatwasser', label: 'Vaatwasser' },
  { value: 'afzuigkap', label: 'Afzuigkap' },
  { value: 'koelkast', label: 'Koelkast' },
  { value: 'koelvries', label: 'Koel-vriescombinatie' },
  { value: 'kokendwaterkraan', label: 'Kokendwaterkraan' },
  { value: 'kraan', label: 'Kraan' },
  { value: 'spoelbak', label: 'Spoelbak' },
  { value: 'anders', label: 'Anders' },
]

export default function NieuweApparatuurPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [type, setType] = useState<ApplianceType>('kookplaat')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)

    const specs: Record<string, unknown> = {}
    if (type === 'kookplaat') {
      if (form.get('energy_type')) specs.energy_type = form.get('energy_type')
      if (form.get('zones')) specs.zones = Number(form.get('zones'))
      if (form.get('watt')) specs.watt = Number(form.get('watt'))
      if (form.get('width_cm')) specs.width_cm = Number(form.get('width_cm'))
    }
    if (type === 'oven' || type === 'combi-oven') {
      specs.pyrolysis = form.get('pyrolysis') === 'ja'
      specs.steam = form.get('steam') === 'ja'
      if (form.get('capacity_liters')) specs.capacity_liters = Number(form.get('capacity_liters'))
    }
    if (type === 'vaatwasser') {
      if (form.get('integration')) specs.integration = form.get('integration')
      if (form.get('db_sound')) specs.db_sound = Number(form.get('db_sound'))
      if (form.get('capacity_sets')) specs.capacity_sets = Number(form.get('capacity_sets'))
    }
    if (type === 'afzuigkap') {
      if (form.get('afzuig_type')) specs.afzuig_type = form.get('afzuig_type')
      if (form.get('capacity_m3h')) specs.capacity_m3h = Number(form.get('capacity_m3h'))
    }
    if (type === 'koelkast') {
      if (form.get('fridge_liters')) specs.fridge_liters = Number(form.get('fridge_liters'))
      specs.freezer = form.get('freezer') === 'ja'
    }
    if (type === 'kokendwaterkraan') {
      if (form.get('functions_count')) specs.functions_count = Number(form.get('functions_count'))
      specs.has_sparkling = form.get('has_sparkling') === 'ja'
      if (form.get('tank_liters')) specs.tank_liters = Number(form.get('tank_liters'))
      if (form.get('finish')) specs.finish = form.get('finish')
    }
    if (type === 'kraan') {
      if (form.get('finish')) specs.finish = form.get('finish')
    }
    if (type === 'spoelbak') {
      if (form.get('material')) specs.material = form.get('material')
      if (form.get('bowls')) specs.bowls = form.get('bowls')
      if (form.get('width_cm')) specs.width_cm = Number(form.get('width_cm'))
    }
    if (type === 'anders') {
      if (form.get('custom_type')) specs.custom_type = form.get('custom_type')
    }

    // Upsert supplier if provided
    let supplier_id = null
    const supplierName = form.get('supplier_name') as string
    if (supplierName) {
      const { data: existing } = await supabase
        .from('finka_suppliers')
        .select('id')
        .ilike('name', supplierName)
        .single()
      if (existing) {
        supplier_id = existing.id
      } else {
        const { data: newSupplier } = await supabase
          .from('finka_suppliers')
          .insert({ name: supplierName })
          .select()
          .single()
        supplier_id = newSupplier?.id
      }
    }

    const { error } = await supabase.from('finka_appliances').insert({
      type,
      brand: form.get('brand') as string,
      model: form.get('model') as string,
      price: form.get('price') ? Number(form.get('price')) : null,
      category: form.get('category') as string || null,
      specs,
      notes: form.get('notes') as string || null,
      supplier_id,
      quote_date: form.get('quote_date') as string || null,
    })

    if (error) { setError(error.message); setLoading(false) }
    else router.push('/apparatuur')
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/apparatuur" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar apparatuur
      </Link>
      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-6">Apparatuur toevoegen</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
        {/* Basisinfo */}
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <select value={type} onChange={e => setType(e.target.value as ApplianceType)}
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
            {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Merk *</Label>
            <Input name="brand" required placeholder="bijv. Siemens" />
          </div>
          <div className="space-y-1.5">
            <Label>Model *</Label>
            <Input name="model" required placeholder="bijv. EX645FXB1E" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Prijs (€)</Label>
            <Input name="price" type="number" step="0.01" placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Categorie</Label>
            <select name="category"
              className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
              <option value="">— Kies categorie —</option>
              <option value="budget">Budget</option>
              <option value="midden">Midden</option>
              <option value="premium">Premium</option>
            </select>
          </div>
        </div>

        {/* Type-specifieke specs */}
        <div className="border-t border-[#F0EDE9] pt-4">
          <p className="text-xs font-medium text-[#6B6560] uppercase tracking-wider mb-3">Specificaties</p>

          {type === 'kookplaat' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Energietype</Label>
                <select name="energy_type" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="">—</option>
                  <option value="inductie">Inductie</option>
                  <option value="gas">Gas</option>
                  <option value="keramisch">Keramisch</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Aantal zones</Label><Input name="zones" type="number" min="1" max="8" /></div>
              <div className="space-y-1.5"><Label>Vermogen (W)</Label><Input name="watt" type="number" /></div>
              <div className="space-y-1.5"><Label>Breedte (cm)</Label><Input name="width_cm" type="number" /></div>
            </div>
          )}

          {(type === 'oven' || type === 'combi-oven') && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Pyrolyse</Label>
                <select name="pyrolysis" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="nee">Nee</option><option value="ja">Ja</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Stoom</Label>
                <select name="steam" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="nee">Nee</option><option value="ja">Ja</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Inhoud (L)</Label><Input name="capacity_liters" type="number" /></div>
            </div>
          )}

          {type === 'vaatwasser' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Integreerbaar</Label>
                <select name="integration" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="">—</option><option value="volledig">Volledig</option><option value="half">Half</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Geluid (dB)</Label><Input name="db_sound" type="number" step="0.1" /></div>
              <div className="space-y-1.5"><Label>Couverts</Label><Input name="capacity_sets" type="number" /></div>
            </div>
          )}

          {type === 'afzuigkap' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select name="afzuig_type" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="">—</option><option value="wand">Wand</option><option value="eiland">Eiland</option><option value="inbouw">Inbouw</option><option value="plafond">Plafond</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Capaciteit (m³/h)</Label><Input name="capacity_m3h" type="number" /></div>
            </div>
          )}

          {type === 'koelkast' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Inhoud (L)</Label><Input name="fridge_liters" type="number" /></div>
              <div className="space-y-1.5">
                <Label>Vriezer</Label>
                <select name="freezer" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="nee">Nee</option><option value="ja">Ja</option>
                </select>
              </div>
            </div>
          )}

          {type === 'kokendwaterkraan' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Functies (X-in-1)</Label><Input name="functions_count" type="number" placeholder="bijv. 3" /></div>
              <div className="space-y-1.5">
                <Label>Bruisend water</Label>
                <select name="has_sparkling" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="nee">Nee</option><option value="ja">Ja</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Tank (L)</Label><Input name="tank_liters" type="number" step="0.1" /></div>
              <div className="space-y-1.5"><Label>Afwerking</Label><Input name="finish" placeholder="chroom, goud, koper..." /></div>
            </div>
          )}

          {type === 'kraan' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Afwerking</Label><Input name="finish" placeholder="chroom, mat zwart, rvs..." /></div>
            </div>
          )}

          {type === 'spoelbak' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Materiaal</Label><Input name="material" placeholder="rvs, composiet, keramiek..." /></div>
              <div className="space-y-1.5">
                <Label>Aantal bakken</Label>
                <select name="bowls" className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]">
                  <option value="">—</option><option value="enkel">Enkel</option><option value="dubbel">Dubbel</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Breedte (cm)</Label><Input name="width_cm" type="number" /></div>
            </div>
          )}

          {type === 'anders' && (
            <div className="space-y-1.5">
              <Label>Omschrijving (wat is het?)</Label>
              <Input name="custom_type" placeholder="bijv. stoomoven, wijnklimaatkast, waterontharder..." />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-[#F0EDE9] pt-4">
          <div className="space-y-1.5"><Label>Leverancier</Label><Input name="supplier_name" placeholder="bijv. Bosch Nederland" /></div>
          <div className="space-y-1.5"><Label>Offertedatum</Label><Input name="quote_date" type="date" /></div>
        </div>

        <div className="space-y-1.5">
          <Label>Notities</Label>
          <textarea name="notes" rows={2}
            className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>{loading ? 'Opslaan...' : 'Opslaan'}</Button>
          <Link href="/apparatuur"><Button type="button" variant="outline">Annuleren</Button></Link>
        </div>
      </form>
    </div>
  )
}
