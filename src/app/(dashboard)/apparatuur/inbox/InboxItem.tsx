'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Check, X, Paperclip, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AiExtracted } from '@/lib/types'

interface EmailQueueItem {
  id: string
  subject: string
  sender: string
  received_at: string
  body_preview: string
  has_attachments: boolean
  ai_extracted: AiExtracted | null
}

export default function InboxItem({ item, readonly = false }: { item: EmailQueueItem; readonly?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleReprocess() {
    setReprocessing(true)
    const res = await fetch('/api/gmail/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    })
    const data = await res.json()
    if (data.appliances) setAppliances(data.appliances)
    setReprocessing(false)
    router.refresh()
  }
  const [appliances, setAppliances] = useState(item.ai_extracted?.appliances ?? [])
  const router = useRouter()
  const supabase = createClient()

  async function handleApprove() {
    setSaving(true)
    setSaveError(null)
    const extracted = item.ai_extracted
    const errors: string[] = []

    // Upsert leverancier
    let supplier_id = null
    if (extracted?.supplier_name) {
      const { data: existing } = await supabase
        .from('finka_suppliers')
        .select('id')
        .ilike('name', extracted.supplier_name)
        .single()
      if (existing) {
        supplier_id = existing.id
      } else {
        const { data: newS, error } = await supabase
          .from('finka_suppliers')
          .insert({ name: extracted.supplier_name, email: extracted.supplier_email })
          .select().single()
        if (error) errors.push(`Leverancier "${extracted.supplier_name}": ${error.message}`)
        supplier_id = newS?.id
      }
    }

    // Sla alle apparatuur op — bij duplicaat prijshistorie bijwerken
    for (const a of appliances) {
      if (!a.brand || !a.model) {
        errors.push(`Product zonder merk/model overgeslagen: ${a.type ?? '?'}`)
        continue
      }
      const category = a.category ? (a.category as string).toLowerCase() : null

      const { data: existing } = await supabase
        .from('finka_appliances')
        .select('id, price_history')
        .ilike('brand', a.brand)
        .ilike('model', a.model)
        .single()

      if (existing) {
        if (a.price) {
          const history: { price: number; date: string | null; supplier_name: string | null; email_subject: string | null }[] = existing.price_history ?? []
          const alreadyExists = history.some((h: { price: number }) => h.price === a.price)
          if (!alreadyExists) {
            history.push({ price: a.price, date: extracted?.quote_date ?? null, supplier_name: extracted?.supplier_name ?? null, email_subject: item.subject })
            const { error } = await supabase.from('finka_appliances').update({ price_history: history, quote_date: extracted?.quote_date ?? null }).eq('id', existing.id)
            if (error) errors.push(`${a.brand} ${a.model}: ${error.message}`)
          }
        }
        continue
      }

      const history = a.price ? [{ price: a.price, date: extracted?.quote_date ?? null, supplier_name: extracted?.supplier_name ?? null, email_subject: item.subject }] : []
      const { error } = await supabase.from('finka_appliances').insert({
        type: a.type || 'anders',
        brand: a.brand,
        model: a.model,
        price: a.price ?? null,
        category,
        specs: a.specs ?? {},
        price_history: history,
        supplier_id,
        quote_date: extracted?.quote_date ?? null,
        source_email_subject: item.subject,
      })
      if (error) errors.push(`${a.brand} ${a.model}: ${error.message}`)
    }

    if (errors.length > 0) {
      setSaveError(errors.join(' · '))
      setSaving(false)
      return
    }

    await supabase.from('finka_email_queue').update({ status: 'processed' }).eq('id', item.id)
    router.refresh()
  }

  async function handleSkip() {
    await supabase.from('finka_email_queue').update({ status: 'skipped' }).eq('id', item.id)
    router.refresh()
  }

  const categoryBadge: Record<string, string> = {
    budget: 'bg-green-50 text-green-700',
    midden: 'bg-blue-50 text-blue-700',
    premium: 'bg-amber-50 text-amber-700',
  }

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#F7F5F2] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-[#1C1B19] truncate">{item.subject}</p>
            {item.has_attachments && <Paperclip size={12} className="text-[#6B6560] shrink-0" />}
            {(appliances.length > 0) && (
              <span className="text-xs bg-[#EDE9E4] text-[#6B6560] px-2 py-0.5 rounded-full shrink-0">
                {appliances.length} product{appliances.length !== 1 ? 'en' : ''} gevonden
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B6560]">
            {item.sender} · {new Date(item.received_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-[#6B6560]" /> : <ChevronDown size={16} className="text-[#6B6560]" />}
      </div>

      {expanded && (
        <div className="border-t border-[#DDD8D2] p-5 space-y-4">
          {/* Leverancier info */}
          {item.ai_extracted?.supplier_name && (
            <div className="text-xs bg-[#F7F5F2] rounded-lg px-3 py-2">
              <span className="text-[#6B6560]">Leverancier: </span>
              <span className="font-medium text-[#1C1B19]">{item.ai_extracted.supplier_name}</span>
              {item.ai_extracted.quote_date && (
                <span className="text-[#6B6560] ml-2">· {item.ai_extracted.quote_date}</span>
              )}
            </div>
          )}

          {/* Gevonden producten */}
          {appliances.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#6B6560] uppercase tracking-wider">Gevonden producten — controleer en pas aan</p>
              {appliances.map((a, i) => (
                <div key={i} className="border border-[#DDD8D2] rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-4 gap-2 items-center">
                  <div>
                    <p className="text-xs text-[#6B6560]">Type</p>
                    <select
                      value={a.type ?? ''}
                      onChange={e => {
                        const updated = [...appliances]
                        updated[i] = { ...updated[i], type: e.target.value as import('@/lib/types').ApplianceType }
                        setAppliances(updated)
                      }}
                      className="text-sm w-full border-0 bg-transparent focus:outline-none text-[#1C1B19] font-medium"
                    >
                      {['kookplaat','oven','combi-oven','vaatwasser','afzuigkap','koelkast','koelvries','kokendwaterkraan','anders'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B6560]">Merk · Model</p>
                    <p className="text-sm font-medium text-[#1C1B19]">{a.brand} {a.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B6560]">Prijs</p>
                    <Input
                      type="number"
                      value={a.price ?? ''}
                      onChange={e => {
                        const updated = [...appliances]
                        updated[i] = { ...updated[i], price: Number(e.target.value) }
                        setAppliances(updated)
                      }}
                      className="h-7 text-sm"
                      placeholder="€"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-[#6B6560]">Categorie</p>
                    <select
                      value={a.category ?? ''}
                      onChange={e => {
                        const updated = [...appliances]
                        updated[i] = { ...updated[i], category: e.target.value as import('@/lib/types').ApplianceCategory }
                        setAppliances(updated)
                      }}
                      className={`text-sm px-2 py-0.5 rounded-full w-full focus:outline-none ${categoryBadge[a.category ?? ''] ?? 'bg-gray-50 text-gray-600'}`}
                    >
                      <option value="">—</option>
                      <option value="budget">Budget</option>
                      <option value="midden">Midden</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                </div>
                  {a.type === 'anders' && (
                    <div>
                      <p className="text-xs text-[#6B6560] mb-1">Omschrijving (wat is het?)</p>
                      <Input
                        value={(a.specs as Record<string, string>)?.custom_type ?? ''}
                        onChange={e => {
                          const updated = [...appliances]
                          updated[i] = { ...updated[i], specs: { ...(updated[i].specs ?? {}), custom_type: e.target.value } }
                          setAppliances(updated)
                        }}
                        className="h-7 text-sm"
                        placeholder="bijv. stoomoven, wijnklimaatkast..."
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#6B6560] bg-[#F7F5F2] rounded-lg px-3 py-2">
              Geen producten automatisch herkend. Controleer de e-mail handmatig.
            </div>
          )}

          {/* Body preview */}
          <details className="text-xs">
            <summary className="text-[#6B6560] cursor-pointer hover:text-[#1C1B19]">E-mailtekst bekijken</summary>
            <pre className="mt-2 p-3 bg-[#F7F5F2] rounded-lg text-[#6B6560] whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
              {item.body_preview}
            </pre>
          </details>

          {/* Fout bij opslaan */}
          {saveError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Opslaan mislukt: {saveError}
            </div>
          )}

          {/* Acties */}
          {!readonly && (
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button size="sm" onClick={handleApprove} disabled={saving || appliances.length === 0}>
                <Check size={13} className="mr-1.5" />
                {saving ? 'Opslaan...' : `${appliances.length} product${appliances.length !== 1 ? 'en' : ''} toevoegen`}
              </Button>
              <Button size="sm" variant="outline" onClick={handleReprocess} disabled={reprocessing}>
                <RefreshCw size={13} className={`mr-1.5 ${reprocessing ? 'animate-spin' : ''}`} />
                Opnieuw verwerken
              </Button>
              <Button size="sm" variant="outline" onClick={handleSkip}>
                <X size={13} className="mr-1.5" />
                Overslaan
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
