'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import AutoTextarea from '@/components/ui/auto-textarea'
import { DefaultTexts } from '@/lib/types'
import { DEFAULT_TEXTS } from '@/lib/default-texts'

type TextKey = Exclude<keyof DefaultTexts, 'id' | 'updated_at'>

const FIELDS: { key: TextKey; label: string; hint: string }[] = [
  {
    key: 'offerte_closing_quote',
    label: 'Offerte — afsluitende quote',
    hint: 'Kleine, persoonlijke afsluitzin onderaan de klantversie.',
  },
  {
    key: 'offerte_disclaimer_text',
    label: 'Offerte — disclaimer bij de prijspagina',
    hint: '',
  },
  {
    key: 'offerte_connections_disclaimer',
    label: 'Offerte — disclaimer bij de aansluitingenpagina',
    hint: '',
  },
  {
    key: 'aansluitschema_let_op_notities',
    label: 'Aansluitschema — "Let op"-notities',
    hint: 'Eén bulletpunt per regel (met een "- " ervoor).',
  },
]

export default function DefaultTextsForm({ texts }: { texts: DefaultTexts | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [values, setValues] = useState<Record<TextKey, string>>(() => {
    const initial = {} as Record<TextKey, string>
    for (const { key } of FIELDS) initial[key] = texts ? texts[key] : DEFAULT_TEXTS[key]
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!texts) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-6">
        Nog geen tekstenrij gevonden — draai de laatste migratie (finka_default_texts) in Supabase en herlaad deze pagina.
      </p>
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('finka_default_texts')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', texts!.id)

    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-5">
      {FIELDS.map(({ key, label, hint }) => (
        <div key={key} className="space-y-1.5">
          <Label className="text-xs">{label}</Label>
          {hint && <p className="text-xs text-[#9A948D]">{hint}</p>}
          <AutoTextarea
            value={values[key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
            className="w-full min-h-[2.5rem] px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          />
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2 border-t border-[#DDD8D2]">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
