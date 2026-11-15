'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AutoTextarea from '@/components/ui/auto-textarea'
import { QuoteTextSnippet } from '@/lib/types'
import { WHATSAPP_FIELD_KEY } from '@/lib/quote-text-snippets'

// Zelf samengestelde WhatsApp-berichten met een titel, om te kopiëren en in
// WhatsApp te plakken, elk in een enkelvoudige (body) en meervoudige versie
// (body_plural). Staan in finka_quote_text_snippets met field_key
// 'whatsapp'; zelfde opslaan-aanpak als QuoteTextSnippetsForm.tsx.
type DraftMessage = Pick<QuoteTextSnippet, 'id' | 'title' | 'body' | 'sort_order'> & { body_plural: string }
type Version = 'enkel' | 'meer'

const text = (d: DraftMessage, v: Version) => (v === 'enkel' ? d.body : d.body_plural)

export default function WhatsappMessagesForm({ messages }: { messages: QuoteTextSnippet[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [drafts, setDrafts] = useState<DraftMessage[]>(() =>
    [...messages]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, title, body, body_plural, sort_order }) => ({ id, title, body, body_plural: body_plural ?? '', sort_order })),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, Version>>({})
  const [error, setError] = useState('')

  function add() {
    setDrafts((prev) => [...prev, { id: `temp-${crypto.randomUUID()}`, title: '', body: '', body_plural: '', sort_order: prev.length }])
  }

  function update(id: string, patch: Partial<DraftMessage>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function move(index: number, dir: -1 | 1) {
    setDrafts((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((d, i) => ({ ...d, sort_order: i }))
    })
  }

  function copy(d: DraftMessage, v: Version) {
    navigator.clipboard.writeText(text(d, v)).then(() => {
      setCopied(d.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const original = new Map(messages.map((m) => [m.id, m]))
    // Lege berichten niet bewaren (en een bestaand bericht dat leeg is gemaakt verwijderen).
    const kept = drafts.filter((d) => d.body.trim() || d.body_plural.trim())
    const keptIds = new Set(kept.map((d) => d.id))

    const toDelete = [...original.keys()].filter((id) => !keptIds.has(id))
    const toInsert = kept
      .filter((d) => d.id.startsWith('temp-'))
      .map(({ title, body, body_plural, sort_order }) => ({
        field_key: WHATSAPP_FIELD_KEY,
        title: title.trim(),
        body,
        body_plural,
        sort_order,
      }))
    const toUpdate = kept.filter((d) => {
      const o = original.get(d.id)
      return o && (o.title !== d.title || o.body !== d.body || (o.body_plural ?? '') !== d.body_plural || o.sort_order !== d.sort_order)
    })

    const results = await Promise.all([
      toDelete.length ? supabase.from('finka_quote_text_snippets').delete().in('id', toDelete) : null,
      toInsert.length ? supabase.from('finka_quote_text_snippets').insert(toInsert) : null,
      ...toUpdate.map((d) =>
        supabase
          .from('finka_quote_text_snippets')
          .update({ title: d.title.trim(), body: d.body, body_plural: d.body_plural, sort_order: d.sort_order })
          .eq('id', d.id),
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
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-3">
      {drafts.length === 0 && <p className="text-sm text-[#6B6560]">Nog geen WhatsApp-berichten.</p>}
      {drafts.map((d, i) => {
        const v = versions[d.id] ?? 'enkel'
        return (
          <div key={d.id} className="space-y-1.5 rounded-lg bg-[#F7F5F2] border border-[#DDD8D2] p-3">
            <div className="flex items-center gap-2">
              <Input
                value={d.title}
                onChange={(e) => update(d.id, { title: e.target.value })}
                placeholder="Titel, bijv. Afspraak bevestigen"
                autoFocus={d.id.startsWith('temp-') && !d.title && !d.body && !d.body_plural}
                className="h-8 text-sm font-medium bg-white"
              />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Omhoog" className="disabled:opacity-30">
                <ChevronUp size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === drafts.length - 1}
                title="Omlaag"
                className="disabled:opacity-30"
              >
                <ChevronDown size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
              </button>
              <button type="button" onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))} title="Bericht verwijderen">
                <Trash2 size={13} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-[#DDD8D2] bg-white p-0.5">
                {(['enkel', 'meer'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setVersions((prev) => ({ ...prev, [d.id]: opt }))}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      v === opt ? 'bg-[#1C1B19] text-white' : 'text-[#6B6560] hover:text-[#1C1B19]'
                    }`}
                  >
                    {opt === 'enkel' ? 'Enkelvoud' : 'Meervoud'}
                    {!text(d, opt).trim() && <span className="opacity-60"> (leeg)</span>}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => copy(d, v)}
                disabled={!text(d, v).trim()}
                className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-[#1C1B19] text-white hover:bg-[#2D2C2A] disabled:opacity-30"
              >
                {copied === d.id ? <Check size={13} /> : <Copy size={13} />}
                {copied === d.id ? 'Gekopieerd' : `Kopieer ${v === 'enkel' ? 'enkelvoud' : 'meervoud'}`}
              </button>
            </div>
            <AutoTextarea
              key={v}
              value={text(d, v)}
              onChange={(val) => update(d.id, v === 'enkel' ? { body: val } : { body_plural: val })}
              placeholder={v === 'enkel' ? 'Het bericht aan één persoon (je/jij)...' : 'Het bericht aan meerdere personen (jullie)...'}
              className="w-full min-h-[4rem] px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            />
          </div>
        )
      })}

      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm text-[#6B6560] hover:text-[#1C1B19]">
        <Plus size={13} />
        Bericht toevoegen
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white rounded-b-xl flex items-center gap-3 border-t border-[#DDD8D2]">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
