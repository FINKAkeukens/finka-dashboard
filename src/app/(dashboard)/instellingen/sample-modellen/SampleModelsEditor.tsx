'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SampleCategory, SampleModel, Supplier } from '@/lib/types'
import { SAMPLE_CATEGORY_LABELS } from '@/lib/samples'

// Bronafbeelding uit de catalogus per leverancier + soort, om de lijst tegen
// na te kijken. Op id i.p.v. naam: de leveranciersnaam kan veranderen.
const REFERENCE_IMAGES: { supplierId: string; category: SampleCategory; src: string; title: string }[] = [
  {
    supplierId: '1f216d82-95f6-439a-8817-34147b6a083e',
    category: 'front',
    src: '/samples/sachsen-fronten-overzicht.png',
    title: 'Sachsen — Overzicht Modellen (catalogus)',
  },
]

const selectClass =
  'h-9 px-3 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

export default function SampleModelsEditor({ models, suppliers }: { models: SampleModel[]; suppliers: Supplier[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [supplierId, setSupplierId] = useState(models[0]?.supplier_id ?? suppliers[0]?.id ?? '')
  const [category, setCategory] = useState<SampleCategory>(models[0]?.category ?? 'front')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = models.filter((m) => m.supplier_id === supplierId && m.category === category)
  const reference = REFERENCE_IMAGES.find((r) => r.supplierId === supplierId && r.category === category)

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError('')
    const { error } = await action
    setBusy(false)
    if (error) { setError(error.message); return false }
    router.refresh()
    return true
  }

  function updateField(id: string, field: 'name' | 'price_group' | 'catalog_page', value: string, previous: string | null) {
    const next = value.trim() || null
    if (next === previous) return
    if (field === 'name' && !next) return
    run(supabase.from('finka_sample_models').update({ [field]: next }).eq('id', id))
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const ok = await run(
      supabase.from('finka_sample_models').insert({
        supplier_id: supplierId,
        category,
        name: (form.get('name') as string).trim(),
        price_group: (form.get('price_group') as string).trim() || null,
        catalog_page: (form.get('catalog_page') as string).trim() || null,
      })
    )
    if (ok) formEl.reset()
  }

  function handleDelete(m: SampleModel) {
    if (!confirm(`Model "${m.name}" uit de lijst verwijderen? Samples met dit model houden hun model en PG.`)) return
    run(supabase.from('finka_sample_models').delete().eq('id', m.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as SampleCategory)} className={selectClass}>
          {Object.entries(SAMPLE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        <div className="grid grid-cols-[1fr_5rem_7rem_2.5rem] gap-2 px-4 py-2 border-b border-[#DDD8D2] bg-[#F7F5F2] text-xs font-medium text-[#6B6560]">
          <span>Model</span>
          <span>PG</span>
          <span>Catalogus</span>
          <span />
        </div>
        {rows.length === 0 && <p className="px-4 py-6 text-sm text-[#6B6560]">Nog geen modellen voor deze leverancier en soort.</p>}
        <ul className="divide-y divide-[#DDD8D2]">
          {rows.map((m) => (
            // key met de waarden erin, zodat de velden na router.refresh() de opgeslagen waarde tonen.
            <li key={`${m.id}-${m.name}-${m.price_group}-${m.catalog_page}`} className="grid grid-cols-[1fr_5rem_7rem_2.5rem] gap-2 px-4 py-1.5 items-center">
              <Input defaultValue={m.name} onBlur={(e) => updateField(m.id, 'name', e.target.value, m.name)} />
              <Input defaultValue={m.price_group ?? ''} onBlur={(e) => updateField(m.id, 'price_group', e.target.value, m.price_group)} />
              <Input defaultValue={m.catalog_page ?? ''} onBlur={(e) => updateField(m.id, 'catalog_page', e.target.value, m.catalog_page)} />
              <button type="button" onClick={() => handleDelete(m)} disabled={busy} className="text-[#9A948D] hover:text-red-600 justify-self-center" title="Verwijderen">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAdd} className="grid grid-cols-[1fr_5rem_7rem_2.5rem] gap-2 px-4 py-3 border-t border-[#DDD8D2] bg-[#F7F5F2]">
          <Input name="name" required placeholder="Nieuw model" />
          <Input name="price_group" placeholder="PG" />
          <Input name="catalog_page" placeholder="Pagina" />
          <Button type="submit" size="sm" disabled={busy || !supplierId} className="px-0">+</Button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-[#9A948D]">Wijzigingen worden opgeslagen zodra je uit een veld klikt.</p>

      {reference && (
        <details className="bg-white rounded-xl border border-[#DDD8D2]" open>
          <summary className="px-4 py-3 text-sm font-medium text-[#1C1B19] cursor-pointer">{reference.title}</summary>
          <a href={reference.src} target="_blank" rel="noopener noreferrer" className="block px-4 pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reference.src} alt={reference.title} className="w-full rounded-lg border border-[#DDD8D2]" />
          </a>
        </details>
      )}
    </div>
  )
}
