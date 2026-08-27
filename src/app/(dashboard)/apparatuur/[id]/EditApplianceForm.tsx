'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApplianceType } from '@/lib/types'
import { ENERGY_LABELS, PRODUCT_LINES } from '@/lib/appliance-utils'
import { Trash2 } from 'lucide-react'

const typeOptions: { value: ApplianceType; label: string }[] = [
  { value: 'kookplaat', label: 'Kookplaat' },
  { value: 'oven', label: 'Oven' },
  { value: 'combi-oven', label: 'Combi-oven' },
  { value: 'magnetron', label: 'Magnetron' },
  { value: 'vaatwasser', label: 'Vaatwasser' },
  { value: 'afzuigkap', label: 'Afzuigkap' },
  { value: 'koelkast', label: 'Koelkast' },
  { value: 'koelvries', label: 'Koel-vriescombinatie' },
  { value: 'vriezer', label: 'Vriezer' },
  { value: 'wijnklimaatkast', label: 'Wijnklimaatkast' },
  { value: 'kokendwaterkraan', label: 'Kokendwaterkraan' },
  { value: 'kraan', label: 'Kraan' },
  { value: 'spoelbak', label: 'Spoelbak' },
  { value: 'anders', label: 'Anders' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Select({ name, value, onChange, options, className }: {
  name?: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; className?: string
}) {
  return (
    <select name={name} value={value} onChange={e => onChange(e.target.value)}
      className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] ${className ?? ''}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function EditApplianceForm({
  appliance,
  suppliers,
}: {
  appliance: Record<string, unknown>
  suppliers: { id: string; name: string }[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [type, setType] = useState<ApplianceType>((appliance.type as ApplianceType) ?? 'anders')
  const [brand, setBrand] = useState((appliance.brand as string) ?? '')
  const [model, setModel] = useState((appliance.model as string) ?? '')
  const [price, setPrice] = useState(String(appliance.price ?? ''))
  const [category, setCategory] = useState((appliance.category as string) ?? '')
  const [supplierId, setSupplierId] = useState((appliance.supplier_id as string) ?? '')
  const [quoteDate, setQuoteDate] = useState((appliance.quote_date as string) ?? '')
  const [notes, setNotes] = useState((appliance.notes as string) ?? '')
  const [specs, setSpecs] = useState<Record<string, unknown>>((appliance.specs as Record<string, unknown>) ?? {})

  function updateSpec(key: string, value: unknown) {
    setSpecs(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    const { error } = await supabase.from('finka_appliances').update({
      type, brand, model,
      price: price ? Number(price) : null,
      category: category || null,
      supplier_id: supplierId || null,
      quote_date: quoteDate || null,
      notes: notes || null,
      specs,
    }).eq('id', appliance.id as string)

    if (error) { setError(error.message); setLoading(false) }
    else router.push('/apparatuur')
  }

  async function handleDelete() {
    if (!confirm(`${brand} ${model} verwijderen?`)) return
    await supabase.from('finka_appliances').delete().eq('id', appliance.id as string)
    router.push('/apparatuur')
  }

  const sel = (options: { value: string; label: string }[], val: string, onChange: (v: string) => void) =>
    <Select value={val} onChange={onChange} options={options} />

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
      {/* Basisinfo */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <Select value={type} onChange={v => setType(v as ApplianceType)} options={typeOptions} />
        </Field>
        <Field label="Categorie">
          <Select value={category} onChange={setCategory} options={[
            { value: '', label: '— Geen —' },
            { value: 'budget', label: 'Budget' },
            { value: 'midden', label: 'Midden' },
            { value: 'premium', label: 'Premium' },
          ]} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Merk">
          <Input value={brand} onChange={e => setBrand(e.target.value)} />
        </Field>
        <Field label="Model">
          <Input value={model} onChange={e => setModel(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Prijs (€ excl. BTW)">
          <Input type="number" value={price} onChange={e => setPrice(e.target.value)} step="0.01" />
        </Field>
        <Field label="Offertedatum">
          <Input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Leverancier">
          <Select value={supplierId} onChange={setSupplierId} options={[
            { value: '', label: '— Geen —' },
            ...suppliers.map(s => ({ value: s.id, label: s.name })),
          ]} />
        </Field>
        <Field label="Energielabel">
          <Select value={String(specs.energy_label ?? '')} onChange={v => updateSpec('energy_label', v || undefined)} options={[
            { value: '', label: '— Geen —' },
            ...ENERGY_LABELS.map(l => ({ value: l, label: l })),
          ]} />
        </Field>
      </div>

      <Field label="Productlijn">
        <Select value={String(specs.product_line ?? '')} onChange={v => updateSpec('product_line', v || undefined)} options={[
          { value: '', label: '— Geen —' },
          ...PRODUCT_LINES.map(l => ({ value: l, label: l })),
        ]} />
      </Field>

      {/* Specs */}
      <div className="border-t border-[#F0EDE9] pt-4 space-y-3">
        <p className="text-xs font-medium text-[#6B6560] uppercase tracking-wider">Specificaties</p>

        {type === 'kookplaat' && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Energietype">
              <Select value={String(specs.energy_type ?? '')} onChange={v => updateSpec('energy_type', v)}
                options={[{value:'',label:'—'},{value:'inductie',label:'Inductie'},{value:'gas',label:'Gas'},{value:'keramisch',label:'Keramisch'}]} />
            </Field>
            <Field label="Zones"><Input type="number" value={String(specs.zones ?? '')} onChange={e => updateSpec('zones', Number(e.target.value))} /></Field>
            <Field label="Vermogen (W)"><Input type="number" value={String(specs.watt ?? '')} onChange={e => updateSpec('watt', Number(e.target.value))} /></Field>
            <Field label="Breedte (cm)"><Input type="number" value={String(specs.width_cm ?? '')} onChange={e => updateSpec('width_cm', Number(e.target.value))} /></Field>
          </div>
        </>}

        {(type === 'oven' || type === 'combi-oven' || type === 'magnetron') && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ovensoort">
              <Select value={String(specs.oven_subtype ?? '')} onChange={v => updateSpec('oven_subtype', v || undefined)}
                options={[{value:'',label:'—'},{value:'solo',label:'Solo-oven'},{value:'combi-magnetron',label:'Combi magnetron/oven'},{value:'stoom',label:'Stoomoven'}]} />
            </Field>
            <Field label="Nis-breedte">
              <Select value={String(specs.width_cm ?? '')} onChange={v => updateSpec('width_cm', v ? Number(v) : undefined)}
                options={[{value:'',label:'—'},{value:'45',label:'45 cm'},{value:'60',label:'60 cm'}]} />
            </Field>
            <Field label="Pyrolyse">
              <Select value={specs.pyrolysis === true ? 'ja' : specs.pyrolysis === false ? 'nee' : ''} onChange={v => updateSpec('pyrolysis', v === 'ja')}
                options={[{value:'',label:'—'},{value:'ja',label:'Ja'},{value:'nee',label:'Nee'}]} />
            </Field>
            <Field label="Stoomfunctie">
              <Select value={specs.steam === true ? 'ja' : specs.steam === false ? 'nee' : ''} onChange={v => updateSpec('steam', v === 'ja')}
                options={[{value:'',label:'—'},{value:'ja',label:'Ja'},{value:'nee',label:'Nee'}]} />
            </Field>
            <Field label="Inhoud (L)"><Input type="number" value={String(specs.capacity_liters ?? '')} onChange={e => updateSpec('capacity_liters', Number(e.target.value))} /></Field>
          </div>
        </>}

        {type === 'vaatwasser' && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Integreerbaar">
              <Select value={String(specs.integration ?? '')} onChange={v => updateSpec('integration', v)}
                options={[{value:'',label:'—'},{value:'volledig',label:'Volledig'},{value:'half',label:'Half'}]} />
            </Field>
            <Field label="Nishoogte">
              <Select value={String(specs.niche_height_cm ?? '')} onChange={v => updateSpec('niche_height_cm', v ? Number(v) : undefined)}
                options={[{value:'',label:'—'},{value:'81.5',label:'81,5 cm'},{value:'86.5',label:'86,5 cm'}]} />
            </Field>
            <Field label="Geluid (dB)"><Input type="number" step="0.1" value={String(specs.db_sound ?? '')} onChange={e => updateSpec('db_sound', Number(e.target.value))} /></Field>
            <Field label="Couverts"><Input type="number" value={String(specs.capacity_sets ?? '')} onChange={e => updateSpec('capacity_sets', Number(e.target.value))} /></Field>
          </div>
        </>}

        {type === 'afzuigkap' && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={String(specs.afzuig_type ?? '')} onChange={v => updateSpec('afzuig_type', v)}
                options={[{value:'',label:'—'},{value:'wand',label:'Wand'},{value:'eiland',label:'Eiland'},{value:'inbouw',label:'Inbouw'},{value:'plafond',label:'Plafond'}]} />
            </Field>
            <Field label="Capaciteit (m³/h)"><Input type="number" value={String(specs.capacity_m3h ?? '')} onChange={e => updateSpec('capacity_m3h', Number(e.target.value))} /></Field>
            <Field label="Geluid (dB)"><Input type="number" step="0.1" value={String(specs.db_sound ?? '')} onChange={e => updateSpec('db_sound', Number(e.target.value))} /></Field>
          </div>
        </>}

        {(type === 'koelkast' || type === 'koelvries' || type === 'vriezer' || type === 'wijnklimaatkast') && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Inhoud (L)"><Input type="number" value={String(specs.fridge_liters ?? '')} onChange={e => updateSpec('fridge_liters', Number(e.target.value))} /></Field>
            <Field label="Vriezer">
              <Select value={specs.freezer === true ? 'ja' : 'nee'} onChange={v => updateSpec('freezer', v === 'ja')}
                options={[{value:'nee',label:'Nee'},{value:'ja',label:'Ja'}]} />
            </Field>
            <Field label="Geluid (dB)"><Input type="number" step="0.1" value={String(specs.db_sound ?? '')} onChange={e => updateSpec('db_sound', Number(e.target.value))} /></Field>
          </div>
        </>}

        {type === 'kokendwaterkraan' && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Functies (X-in-1)"><Input type="number" value={String(specs.functions_count ?? '')} onChange={e => updateSpec('functions_count', Number(e.target.value))} placeholder="bijv. 3" /></Field>
            <Field label="Bruisend water">
              <Select value={specs.has_sparkling === true ? 'ja' : 'nee'} onChange={v => updateSpec('has_sparkling', v === 'ja')}
                options={[{value:'nee',label:'Nee'},{value:'ja',label:'Ja'}]} />
            </Field>
            <Field label="Tank (L)"><Input type="number" step="0.1" value={String(specs.tank_liters ?? '')} onChange={e => updateSpec('tank_liters', Number(e.target.value))} /></Field>
            <Field label="Afwerking"><Input value={String(specs.finish ?? '')} onChange={e => updateSpec('finish', e.target.value)} placeholder="chroom, goud, koper..." /></Field>
          </div>
        </>}

        {type === 'kraan' && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Afwerking"><Input value={String(specs.finish ?? '')} onChange={e => updateSpec('finish', e.target.value)} placeholder="chroom, mat zwart, rvs..." /></Field>
          </div>
        </>}

        {type === 'spoelbak' && <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Materiaal"><Input value={String(specs.material ?? '')} onChange={e => updateSpec('material', e.target.value)} placeholder="rvs, composiet, keramiek..." /></Field>
            <Field label="Aantal bakken">
              <Select value={String(specs.bowls ?? '')} onChange={v => updateSpec('bowls', v)}
                options={[{value:'',label:'—'},{value:'enkel',label:'Enkel'},{value:'dubbel',label:'Dubbel'}]} />
            </Field>
            <Field label="Breedte (cm)"><Input type="number" value={String(specs.width_cm ?? '')} onChange={e => updateSpec('width_cm', Number(e.target.value))} /></Field>
          </div>
        </>}

        {type === 'anders' && (
          <Field label="Omschrijving">
            <Input value={String(specs.custom_type ?? '')} onChange={e => updateSpec('custom_type', e.target.value)} placeholder="bijv. wijnklimaatkast, waterontharder..." />
          </Field>
        )}

        {/* Geluid voor alle types */}
        {!['vaatwasser','afzuigkap','koelkast','koelvries','vriezer','wijnklimaatkast','kraan','spoelbak'].includes(type) && (
          <Field label="Geluid (dB) — indien van toepassing">
            <Input type="number" step="0.1" value={String(specs.db_sound ?? '')} onChange={e => updateSpec('db_sound', e.target.value ? Number(e.target.value) : '')} />
          </Field>
        )}
      </div>

      <Field label="Notities">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none" />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2 justify-between">
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Opslaan...' : 'Opslaan'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/apparatuur')}>Annuleren</Button>
        </div>
        <Button variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:border-red-200">
          <Trash2 size={13} className="mr-1.5" />
          Verwijderen
        </Button>
      </div>
    </div>
  )
}
