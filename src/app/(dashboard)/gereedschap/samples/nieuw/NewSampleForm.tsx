'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SampleModel, Supplier } from '@/lib/types'
import SampleFields, { readSampleForm, uploadSamplePhoto } from '../SampleFields'

export default function NewSampleForm({
  suppliers,
  models,
  materials,
}: {
  suppliers: Supplier[]
  models: SampleModel[]
  materials: string[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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

    const { data, error } = await supabase
      .from('finka_samples')
      .insert({ ...readSampleForm(form), ...photo })
      .select()
      .single()

    if (error) {
      setError('Er ging iets mis: ' + error.message)
      setLoading(false)
    } else {
      router.push(`/gereedschap/samples/${data.id}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
      <SampleFields suppliers={suppliers} models={models} materials={materials} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Opslaan...' : 'Sample opslaan'}
        </Button>
        <Link href="/gereedschap/samples">
          <Button type="button" variant="outline">Annuleren</Button>
        </Link>
      </div>
    </form>
  )
}
