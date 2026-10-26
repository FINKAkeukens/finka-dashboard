'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sample, SampleModel, Supplier } from '@/lib/types'
import { SAMPLE_CATEGORY_LABELS, SAMPLE_SIZES, VENEER_MATERIAL } from '@/lib/samples'
import { createClient } from '@/lib/supabase/client'

const selectClass =
  'w-full h-9 px-3 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

// Foto's staan in de bestaande bucket offer-images onder samples/ — zie
// migratie-sectie 91.
export async function uploadSamplePhoto(
  supabase: ReturnType<typeof createClient>,
  file: File,
): Promise<{ url: string; path: string } | { error: string }> {
  const ext = file.name.split('.').pop()
  const path = `samples/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('offer-images').upload(path, file)
  if (error) return { error: error.message }
  return { url: supabase.storage.from('offer-images').getPublicUrl(path).data.publicUrl, path }
}

const OTHER_MATERIAL = '__anders'

export function readSampleForm(form: FormData) {
  const material = ((form.get('material') as string) ?? '').trim() || null
  return {
    name: form.get('name') as string,
    category: form.get('category') as string,
    supplier_id: (form.get('supplier_id') as string) || null,
    code: (form.get('code') as string) || null,
    model: (form.get('model') as string) || null,
    price_group: (form.get('price_group') as string) || null,
    color: (form.get('color') as string) || null,
    finish: (form.get('finish') as string) || null,
    size: (form.get('size') as string) || null,
    material,
    veneer_execution: material === VENEER_MATERIAL ? (form.get('veneer_execution') as string) || null : null,
    notes: (form.get('notes') as string) || null,
  }
}

// Gedeelde velden voor "Nieuwe sample" en "Sample bewerken". Zijn er voor
// de gekozen soort modellen (Instellingen → Sample-modellen), dan is Model
// een keuzelijst: zonder leverancier met alle modellen van die soort
// (gegroepeerd per leverancier), met leverancier alleen die van hem. Een
// gekozen model vult de leverancier en de PG meteen in.
export default function SampleFields({
  sample,
  suppliers,
  models,
  materials,
}: {
  sample?: Sample
  suppliers: Supplier[]
  models: SampleModel[]
  // Keuzelijst Materiaal: sampleMaterialOptions() over de bestaande samples.
  materials: string[]
}) {
  const [supplierId, setSupplierId] = useState(sample?.supplier_id ?? '')
  const [category, setCategory] = useState<string>(sample?.category ?? 'front')
  const [model, setModel] = useState(sample?.model ?? '')
  const [priceGroup, setPriceGroup] = useState(sample?.price_group ?? '')
  const [material, setMaterial] = useState(sample?.material ?? '')
  // "Anders" gekozen → vrij tekstveld; het ingevulde materiaal komt daarna
  // vanzelf in de lijst omdat de opties uit de bestaande samples komen.
  const [otherMaterial, setOtherMaterial] = useState(false)
  const materialSelectValue = otherMaterial ? OTHER_MATERIAL : material

  const categoryModels = models.filter((m) => m.category === category)
  const supplierModels = categoryModels.filter((m) => m.supplier_id === supplierId)
  // Leverancier zonder eigen lijst voor deze soort → vrij tekstveld.
  const modelOptions = supplierId ? supplierModels : categoryModels
  const optionGroups = suppliers
    .map((s) => ({ supplier: s, options: modelOptions.filter((m) => m.supplier_id === s.id) }))
    .filter((g) => g.options.length > 0)
  const selected = modelOptions.find((m) => m.name === model && (!supplierId || m.supplier_id === supplierId))
  // Een eerder opgeslagen model dat (nog) niet in de lijst staat blijft kiesbaar.
  const keepCurrent = model && !selected

  function handleModelChange(value: string) {
    const match = modelOptions.find((m) => m.id === value)
    if (!match) {
      setModel(value === '__current' ? model : '')
      return
    }
    setModel(match.name)
    setSupplierId(match.supplier_id)
    setPriceGroup(match.price_group ?? '')
  }

  function optionLabel(m: SampleModel) {
    return `${m.name}${m.price_group ? ` (PG ${m.price_group})` : ''}`
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="name">Naam *</Label>
        <Input id="name" name="name" required defaultValue={sample?.name} placeholder="Bijv. Eiken naturel mat" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="category">Soort</Label>
          <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
            {Object.entries(SAMPLE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supplier_id">Leverancier</Label>
          <select id="supplier_id" name="supplier_id" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="model">Model</Label>
        {modelOptions.length > 0 ? (
          <>
            {/* De keuzelijst werkt op id (namen kunnen bij twee leveranciers gelijk zijn); opgeslagen wordt de naam. */}
            <input type="hidden" name="model" value={model} />
            <select
              id="model"
              value={selected?.id ?? (keepCurrent ? '__current' : '')}
              onChange={(e) => handleModelChange(e.target.value)}
              className={selectClass}
            >
              <option value="">—</option>
              {keepCurrent && <option value="__current">{model}</option>}
              {optionGroups.length > 1
                ? optionGroups.map((g) => (
                    <optgroup key={g.supplier.id} label={g.supplier.name}>
                      {g.options.map((m) => <option key={m.id} value={m.id}>{optionLabel(m)}</option>)}
                    </optgroup>
                  ))
                : modelOptions.map((m) => <option key={m.id} value={m.id}>{optionLabel(m)}</option>)}
            </select>
          </>
        ) : (
          <Input id="model" name="model" value={model} onChange={(e) => setModel(e.target.value)} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code / artikelnummer</Label>
          <Input id="code" name="code" defaultValue={sample?.code ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price_group">PG (prijsgroep)</Label>
          <Input id="price_group" name="price_group" value={priceGroup} onChange={(e) => setPriceGroup(e.target.value)} placeholder="Bijv. 3" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="size">Maat</Label>
          <select id="size" name="size" defaultValue={sample?.size ?? ''} className={selectClass}>
            <option value="">—</option>
            {SAMPLE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="material_select">Materiaal</Label>
          <input type="hidden" name="material" value={material} />
          <select
            id="material_select"
            value={materialSelectValue}
            onChange={(e) => {
              const isOther = e.target.value === OTHER_MATERIAL
              setOtherMaterial(isOther)
              setMaterial(isOther ? '' : e.target.value)
            }}
            className={selectClass}
          >
            <option value="">—</option>
            {materials.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value={OTHER_MATERIAL}>Anders…</option>
          </select>
          {otherMaterial && (
            <Input
              aria-label="Ander materiaal"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="Vul het materiaal in"
              autoFocus
            />
          )}
        </div>
        {material === VENEER_MATERIAL && !otherMaterial && (
          <div className="space-y-1.5">
            <Label htmlFor="veneer_execution">Uitvoering</Label>
            <Input id="veneer_execution" name="veneer_execution" defaultValue={sample?.veneer_execution ?? ''} placeholder="Bijv. rift, dosse, gestoomd" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="color">Kleur</Label>
          <Input id="color" name="color" defaultValue={sample?.color ?? ''} placeholder="Bijv. eiken naturel, antraciet" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="finish">Afwerking</Label>
          <Input id="finish" name="finish" defaultValue={sample?.finish ?? ''} placeholder="Bijv. mat, hoogglans, structuur" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photo">{sample?.photo_url ? 'Foto vervangen' : 'Foto'}</Label>
        <input id="photo" name="photo" type="file" accept="image/*" className="block w-full text-sm text-[#6B6560]" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Aantekeningen</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={sample?.notes ?? ''}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
        />
      </div>
    </>
  )
}
