'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Copy } from 'lucide-react'
import { Sample } from '@/lib/types'
import { sampleCopyNames, sampleNumberBase } from '@/lib/samples'

const MAX_COPIES = 20

// Meer exemplaren van hetzelfde sample (bv. extra groene of oranje FINKA-
// tassen): alle gegevens worden overgenomen, alleen de naam krijgt het
// volgende nummer. Een foto wordt per kopie apart gekopieerd in Storage,
// anders zou bewerken/verwijderen van één exemplaar de foto van de rest
// meenemen (zie EditSampleForm).
export default function CopySampleButton({ sample }: { sample: Sample }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleCopy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = Math.floor(Number(count))
    if (!(n >= 1 && n <= MAX_COPIES)) {
      setError(`Kies een aantal van 1 t/m ${MAX_COPIES}.`)
      return
    }
    setLoading(true)
    setError('')

    const { base } = sampleNumberBase(sample.name)
    const { data: existing, error: listError } = await supabase
      .from('finka_samples')
      .select('name')
      .ilike('name', `%${base.replace(/[\\%_]/g, '\\$&')}%`)
    if (listError) { setError(listError.message); setLoading(false); return }
    const names = sampleCopyNames(sample.name, (existing ?? []).map((s) => s.name), n)

    const copiedPaths: string[] = []
    const rows = []
    for (const name of names) {
      let photo: { photo_url: string | null; storage_path: string | null } = { photo_url: null, storage_path: null }
      if (sample.storage_path) {
        const ext = sample.storage_path.split('.').pop()
        const path = `samples/${crypto.randomUUID()}.${ext}`
        const { error: copyError } = await supabase.storage.from('offer-images').copy(sample.storage_path, path)
        if (!copyError) {
          copiedPaths.push(path)
          photo = { photo_url: supabase.storage.from('offer-images').getPublicUrl(path).data.publicUrl, storage_path: path }
        }
      }
      rows.push({
        name,
        category: sample.category,
        supplier_id: sample.supplier_id,
        code: sample.code,
        model: sample.model,
        price_group: sample.price_group,
        color: sample.color,
        finish: sample.finish,
        size: sample.size,
        material: sample.material,
        veneer_execution: sample.veneer_execution,
        notes: sample.notes,
        ...photo,
      })
    }

    const { error: insertError } = await supabase.from('finka_samples').insert(rows)
    if (insertError) {
      if (copiedPaths.length) await supabase.storage.from('offer-images').remove(copiedPaths)
      setError(insertError.message)
      setLoading(false)
      return
    }
    setLoading(false)
    setOpen(false)
    setCount('1')
    setDone(names.length === 1 ? `Toegevoegd: ${names[0]}` : `Toegevoegd: ${names[0]} t/m ${names[names.length - 1]}`)
    router.refresh()
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => { setOpen(true); setDone('') }}>
          <Copy size={13} className="mr-1.5" />
          Kopieën toevoegen
        </Button>
        {done && <p className="text-sm text-green-700">{done}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleCopy} className="bg-white rounded-xl border border-[#DDD8D2] p-4 space-y-3">
      <p className="text-sm text-[#1C1B19]">
        Extra exemplaren van dit sample, met dezelfde gegevens. De naam krijgt het
        volgende vrije nummer.
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="copy-count" className="text-sm text-[#6B6560]">Aantal</label>
        <Input
          id="copy-count"
          type="number"
          min={1}
          max={MAX_COPIES}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="w-20"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>{loading ? 'Toevoegen...' : 'Toevoegen'}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); setError('') }}>Annuleren</Button>
      </div>
    </form>
  )
}
