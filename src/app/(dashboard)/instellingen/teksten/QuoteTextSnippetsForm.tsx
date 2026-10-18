'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AutoTextarea from '@/components/ui/auto-textarea'
import { QuoteTextSnippet } from '@/lib/types'
import { QUOTE_TEXT_FIELDS } from '@/lib/quote-text-snippets'

// Werkkopie — nieuwe teksten krijgen een tijdelijk id (prefix "temp-"),
// zelfde aanpak als DraftItem in QuoteEditor.tsx.
type DraftSnippet = Pick<QuoteTextSnippet, 'id' | 'field_key' | 'title' | 'body' | 'sort_order'>

export default function QuoteTextSnippetsForm({ snippets }: { snippets: QuoteTextSnippet[] | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [drafts, setDrafts] = useState<DraftSnippet[]>(() =>
    (snippets ?? []).map(({ id, field_key, title, body, sort_order }) => ({ id, field_key, title, body, sort_order }))
  )
  const [openFields, setOpenFields] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const groups = useMemo(() => {
    const result: { group: string; fields: typeof QUOTE_TEXT_FIELDS }[] = []
    for (const field of QUOTE_TEXT_FIELDS) {
      const last = result[result.length - 1]
      if (last && last.group === field.group) last.fields.push(field)
      else result.push({ group: field.group, fields: [field] })
    }
    return result
  }, [])

  if (!snippets) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-6">
        Nog geen tabel voor standaardteksten per veld gevonden — draai de laatste migratie (85, finka_quote_text_snippets) in Supabase en herlaad deze pagina.
      </p>
    )
  }

  function toggleField(key: string) {
    setOpenFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function addSnippet(fieldKey: string) {
    setDrafts((prev) => {
      const maxOrder = Math.max(-1, ...prev.filter((d) => d.field_key === fieldKey).map((d) => d.sort_order))
      return [...prev, { id: `temp-${crypto.randomUUID()}`, field_key: fieldKey, title: '', body: '', sort_order: maxOrder + 1 }]
    })
    setOpenFields((prev) => new Set(prev).add(fieldKey))
  }

  function updateSnippet(id: string, patch: Partial<DraftSnippet>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function removeSnippet(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const original = new Map((snippets ?? []).map((s) => [s.id, s]))
    // Lege teksten niet bewaren (en een bestaande die leeg is gemaakt verwijderen).
    const kept = drafts.filter((d) => d.body.trim())
    const keptIds = new Set(kept.map((d) => d.id))

    const toDelete = [...original.keys()].filter((id) => !keptIds.has(id))
    const toInsert = kept
      .filter((d) => d.id.startsWith('temp-'))
      .map(({ field_key, title, body, sort_order }) => ({ field_key, title: title.trim(), body, sort_order }))
    const toUpdate = kept.filter((d) => {
      const o = original.get(d.id)
      return o && (o.title !== d.title || o.body !== d.body || o.sort_order !== d.sort_order)
    })

    const results = await Promise.all([
      toDelete.length ? supabase.from('finka_quote_text_snippets').delete().in('id', toDelete) : null,
      toInsert.length ? supabase.from('finka_quote_text_snippets').insert(toInsert) : null,
      ...toUpdate.map((d) =>
        supabase
          .from('finka_quote_text_snippets')
          .update({ title: d.title.trim(), body: d.body, sort_order: d.sort_order })
          .eq('id', d.id)
      ),
    ])
    const failed = results.find((r) => r?.error)
    if (failed?.error) {
      setError(failed.error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-6">
      {groups.map(({ group, fields }) => (
        <div key={group} className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#9A948D]">{group}</h3>
          <div className="rounded-lg border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
            {fields.map((field) => {
              const fieldDrafts = drafts.filter((d) => d.field_key === field.key).sort((a, b) => a.sort_order - b.sort_order)
              const open = openFields.has(field.key)
              return (
                <div key={field.key} className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleField(field.key)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <ChevronDown size={14} className={`text-[#9A948D] transition-transform ${open ? '' : '-rotate-90'}`} />
                      <span className="text-sm text-[#1C1B19]">{field.label}</span>
                      <span className="text-xs text-[#9A948D]">
                        {fieldDrafts.length === 0 ? '' : `${fieldDrafts.length} tekst${fieldDrafts.length === 1 ? '' : 'en'}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addSnippet(field.key)}
                      className="inline-flex items-center gap-1 text-xs text-[#6B6560] hover:text-[#1C1B19]"
                    >
                      <Plus size={11} />
                      Tekst toevoegen
                    </button>
                  </div>
                  {open && (
                    <div className="space-y-3 pl-6">
                      {field.hint && <p className="text-xs text-[#9A948D]">{field.hint}</p>}
                      {fieldDrafts.length === 0 && (
                        <p className="text-xs text-[#6B6560]">Nog geen standaardteksten voor dit veld.</p>
                      )}
                      {fieldDrafts.map((d) => (
                        <div key={d.id} className="space-y-1.5 rounded-lg bg-[#F7F5F2] border border-[#DDD8D2] p-3">
                          <div className="flex items-center gap-2">
                            <Input
                              value={d.title}
                              onChange={(e) => updateSnippet(d.id, { title: e.target.value })}
                              placeholder={field.mode === 'cost' ? 'Label, bijv. KEUKEN' : 'Naam in het keuzemenu (optioneel)'}
                              className="h-8 text-sm bg-white"
                            />
                            <button type="button" onClick={() => removeSnippet(d.id)} title="Tekst verwijderen">
                              <Trash2 size={13} className="text-[#9A948D] hover:text-red-600" />
                            </button>
                          </div>
                          <AutoTextarea
                            value={d.body}
                            onChange={(v) => updateSnippet(d.id, { body: v })}
                            placeholder="De tekst die in de offerte wordt ingevoegd..."
                            className="w-full min-h-[2.5rem] px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white rounded-b-xl flex items-center gap-3 border-t border-[#DDD8D2]">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
