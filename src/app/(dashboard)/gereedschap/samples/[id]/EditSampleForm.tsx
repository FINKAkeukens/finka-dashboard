'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Sample, SampleModel, Supplier } from '@/lib/types'
import { Edit, Trash2 } from 'lucide-react'
import SampleFields, { readSampleForm, uploadSamplePhoto } from '../SampleFields'

export default function EditSampleForm({
  sample,
  suppliers,
  models,
  materials,
}: {
  sample: Sample
  suppliers: Supplier[]
  models: SampleModel[]
  materials: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(e.currentTarget)

    let photo: { photo_url: string; storage_path: string } | null = null
    const file = form.get('photo') as File | null
    if (file && file.size > 0) {
      const result = await uploadSamplePhoto(supabase, file)
      if ('error' in result) {
        setError('Foto uploaden mislukt: ' + result.error)
        setLoading(false)
        return
      }
      photo = { photo_url: result.url, storage_path: result.path }
    }

    const { error } = await supabase
      .from('finka_samples')
      .update({ ...readSampleForm(form), ...photo, updated_at: new Date().toISOString() })
      .eq('id', sample.id)

    if (error) { setError(error.message); setLoading(false); return }
    // Oude foto pas opruimen als de nieuwe goed is opgeslagen.
    if (photo && sample.storage_path) await supabase.storage.from('offer-images').remove([sample.storage_path])
    setLoading(false)
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm(`Sample "${sample.name}" verwijderen? De uitleenhistorie wordt ook verwijderd. Dit kan niet ongedaan gemaakt worden.`)) return
    const { error } = await supabase.from('finka_samples').delete().eq('id', sample.id)
    if (error) { setError(error.message); return }
    if (sample.storage_path) await supabase.storage.from('offer-images').remove([sample.storage_path])
    router.push('/gereedschap/samples')
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {sample.notes && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{sample.notes}</p>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-4">
      <h2 className="text-sm font-medium text-[#1C1B19] mb-4">Sample bewerken</h2>
      <SampleFields sample={sample} suppliers={suppliers} models={models} materials={materials} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={loading}>{loading ? 'Opslaan...' : 'Opslaan'}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Annuleren</Button>
      </div>
    </form>
  )
}
