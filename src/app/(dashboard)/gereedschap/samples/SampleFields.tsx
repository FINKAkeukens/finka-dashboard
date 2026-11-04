'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sample, SampleModel, Supplier } from '@/lib/types'
import { SampleFieldKey, SampleSettings, sampleCategoryLabel, sampleFieldLabel, samplePlaceholder, withCurrent } from '@/lib/samples'
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

// Een via "Anders" ingevuld materiaal komt na opslaan in de materialenlijst
// van Sample instellingen, zodat het de volgende keer gewoon kiesbaar is.
export async function rememberMaterial(
  supabase: ReturnType<typeof createClient>,
  settings: SampleSettings,
  material: string | null,
) {
  const value = material?.trim()
  if (!value || settings.materials.some((m) => m.toLowerCase() === value.toLowerCase())) return
  await supabase
    .from('finka_sample_settings')
    .upsert({ id: 1, materials: [...settings.materials, value], updated_at: new Date().toISOString() })
}

export function readSampleForm(form: FormData, settings: SampleSettings) {
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
    veneer_execution: material && material === settings.veneer_material ? (form.get('veneer_execution') as string) || null : null,
    notes: (form.get('notes') as string) || null,
  }
}

// Gedeelde velden voor "Nieuwe sample" en "Sample bewerken". Namen,
// voorbeeldteksten en keuzelijsten komen uit Sample instellingen. Zijn er voor
// de gekozen soort modellen (Instellingen → Sample instellingen), dan is Model
// een keuzelijst: zonder leverancier met alle modellen van die soort
// (gegroepeerd per leverancier), met leverancier alleen die van hem. Een
// gekozen model vult de leverancier en de PG meteen in.
export default function SampleFields({
  sample,
  suppliers,
  models,
  settings,
}: {
  sample?: Sample
  suppliers: Supplier[]
  models: SampleModel[]
  settings: SampleSettings
}) {
  const label = (key: SampleFieldKey) => sampleFieldLabel(settings, key)
  const placeholder = (key: SampleFieldKey) => samplePlaceholder(settings, key) || undefined
  const categoryKeys = withCurrent(settings.categories.map((c) => c.key), sample?.category)
  const sizes = withCurrent(settings.sizes, sample?.size)
  const materials = withCurrent(settings.materials, sample?.material)
  const [supplierId, setSupplierId] = useState(sample?.supplier_id ?? '')
  const [category, setCategory] = useState<string>(sample?.category ?? settings.categories[0]?.key ?? 'anders')
  const [model, setModel] = useState(sample?.model ?? '')
  const [priceGroup, setPriceGroup] = useState(sample?.price_group ?? '')
  const [material, setMaterial] = useState(sample?.material ?? '')
  // "Anders" gekozen → vrij tekstveld; het ingevulde materiaal komt na
  // opslaan in de lijst (rememberMaterial).
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
        <Label htmlFor="name">{label('name')} *</Label>
        <Input id="name" name="name" required defaultValue={sample?.name} placeholder={placeholder('name')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="category">{label('category')}</Label>
          <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
            {categoryKeys.map((key) => (
              <option key={key} value={key}>{sampleCategoryLabel(settings, key)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supplier_id">{label('supplier_id')}</Label>
          <select id="supplier_id" name="supplier_id" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="model">{label('model')}</Label>
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
          <Input id="model" name="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={placeholder('model')} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">{label('code')}</Label>
          <Input id="code" name="code" defaultValue={sample?.code ?? ''} placeholder={placeholder('code')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price_group">{label('price_group')}</Label>
          <Input id="price_group" name="price_group" value={priceGroup} onChange={(e) => setPriceGroup(e.target.value)} placeholder={placeholder('price_group')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="size">{label('size')}</Label>
          <select id="size" name="size" defaultValue={sample?.size ?? ''} className={selectClass}>
            <option value="">—</option>
            {sizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="material_select">{label('material')}</Label>
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
              aria-label={`Ander ${label('material').toLowerCase()}`}
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="Vul het materiaal in"
              autoFocus
            />
          )}
        </div>
        {!!material && material === settings.veneer_material && !otherMaterial && (
          <div className="space-y-1.5">
            <Label htmlFor="veneer_execution">{label('veneer_execution')}</Label>
            <Input id="veneer_execution" name="veneer_execution" defaultValue={sample?.veneer_execution ?? ''} placeholder={placeholder('veneer_execution')} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="color">{label('color')}</Label>
          <Input id="color" name="color" defaultValue={sample?.color ?? ''} placeholder={placeholder('color')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="finish">{label('finish')}</Label>
          <Input id="finish" name="finish" defaultValue={sample?.finish ?? ''} placeholder={placeholder('finish')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photo">{sample?.photo_url ? `${label('photo')} vervangen` : label('photo')}</Label>
        <input id="photo" name="photo" type="file" accept="image/*" className="block w-full text-sm text-[#6B6560]" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">{label('notes')}</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={sample?.notes ?? ''}
          placeholder={placeholder('notes')}
          className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
        />
      </div>
    </>
  )
}
