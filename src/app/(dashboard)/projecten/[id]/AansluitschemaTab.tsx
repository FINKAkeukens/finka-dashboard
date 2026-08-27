'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { ConnectionCategory, ConnectionItem, ConnectionSchema, ConnectionSectionBlock, Project } from '@/lib/types'
import { CATEGORY_LABELS, CATEGORY_ORDER, DEFAULT_LET_OP_NOTITIES, seedConnectionItems } from '@/lib/aansluitschema'

type DraftItem = ConnectionItem & { isNew?: boolean }

interface AiSuggestionItem {
  standard_key: string
  van_toepassing?: boolean
  aantal?: string
  hoogte_cm?: string
  positie_toelichting?: string
}
interface AiSuggestionNewItem {
  category: ConnectionCategory
  omschrijving: string
  aantal?: string
  hoogte_cm?: string
  positie_toelichting?: string
}
interface AiSuggestion {
  items: AiSuggestionItem[]
  nieuwe_regels: AiSuggestionNewItem[]
}

function genId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function AansluitschemaTab({
  projectId,
  project,
  items: initialItems,
  schema,
  vooraanzichtUrls,
}: {
  projectId: string
  project: Project
  items: ConnectionItem[]
  schema: ConnectionSchema | null
  vooraanzichtUrls: string[]
}) {
  const supabase = createClient()
  const router = useRouter()

  const [items, setItems] = useState<DraftItem[]>(() => {
    if (initialItems.length) return [...initialItems].sort((a, b) => a.sort_order - b.sort_order)
    return seedConnectionItems(projectId).map((row) => ({ ...row, id: genId(), created_at: '', updated_at: '', isNew: true }))
  })
  const originalItemIds = useRef(new Set(initialItems.map((i) => i.id)))

  const [klantReferentie, setKlantReferentie] = useState(schema?.klant_referentie ?? project.reference_number ?? '')
  const [adres, setAdres] = useState(schema?.adres ?? '')
  const [opsteller, setOpsteller] = useState(schema?.opsteller ?? '')
  const [behorendBijTekening, setBehorendBijTekening] = useState(schema?.behorend_bij_tekening ?? '')
  const [versie, setVersie] = useState(schema?.versie ?? 1)
  const [groepenverdelingTekst, setGroepenverdelingTekst] = useState(schema?.groepenverdeling_tekst ?? '')
  const [extraSecties, setExtraSecties] = useState<ConnectionSectionBlock[]>(schema?.extra_secties ?? [])
  const [letOpNotities, setLetOpNotities] = useState(schema?.let_op_notities ?? DEFAULT_LET_OP_NOTITIES)

  const [customImageUrls, setCustomImageUrls] = useState<string[]>([])
  const imageOptions = [...vooraanzichtUrls, ...customImageUrls]
  const [uploadingTekening, setUploadingTekening] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [vrijeTekst, setVrijeTekst] = useState('')
  const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(() => new Set(vooraanzichtUrls))
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null)
  const [aiChecked, setAiChecked] = useState<Set<string>>(new Set())

  const [pdfLoading, setPdfLoading] = useState(false)

  function updateItem(id: string, patch: Partial<ConnectionItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function addCustomItem(category: ConnectionCategory) {
    const maxSort = items.reduce((max, i) => Math.max(max, i.sort_order), -1)
    setItems((prev) => [
      ...prev,
      {
        id: genId(),
        project_id: projectId,
        category,
        standard_key: null,
        sort_order: maxSort + 1,
        omschrijving: '',
        van_toepassing: true,
        aantal: null,
        hoogte_cm: null,
        positie_toelichting: null,
        created_at: '',
        updated_at: '',
        isNew: true,
      },
    ])
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function addSectie() {
    setExtraSecties((prev) => [...prev, { titel: '', tekst: '' }])
  }
  function updateSectie(idx: number, patch: Partial<ConnectionSectionBlock>) {
    setExtraSecties((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function removeSectie(idx: number) {
    setExtraSecties((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUploadTekening(file: File) {
    setUploadingTekening(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', `${projectId}/aansluitschema-${Date.now()}-${file.name}`)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Upload mislukt')
      setCustomImageUrls((prev) => [...prev, body.url])
      setSelectedImageUrls((prev) => new Set(prev).add(body.url))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploadingTekening(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    const currentIds = new Set(items.filter((i) => !i.isNew).map((i) => i.id))
    const toDelete = [...originalItemIds.current].filter((id) => !currentIds.has(id))
    const toInsert = items.filter((i) => i.isNew)
    const toUpdate = items.filter((i) => !i.isNew)

    if (toDelete.length) {
      const { error: delError } = await supabase.from('finka_connection_items').delete().in('id', toDelete)
      if (delError) {
        setError(delError.message)
        setSaving(false)
        return
      }
    }

    let insertedRows: ConnectionItem[] = []
    if (toInsert.length) {
      const { data, error: insError } = await supabase
        .from('finka_connection_items')
        .insert(toInsert.map(({ id: _id, isNew: _isNew, created_at: _c, updated_at: _u, ...rest }) => rest))
        .select()
      if (insError) {
        setError(insError.message)
        setSaving(false)
        return
      }
      insertedRows = (data ?? []) as ConnectionItem[]
    }

    for (const i of toUpdate) {
      const { error: updError } = await supabase
        .from('finka_connection_items')
        .update({
          category: i.category,
          sort_order: i.sort_order,
          omschrijving: i.omschrijving,
          van_toepassing: i.van_toepassing,
          aantal: i.aantal,
          hoogte_cm: i.hoogte_cm,
          positie_toelichting: i.positie_toelichting,
          updated_at: new Date().toISOString(),
        })
        .eq('id', i.id)
      if (updError) {
        setError(updError.message)
        setSaving(false)
        return
      }
    }

    let insertIdx = 0
    const finalItems = items.map((i) => (i.isNew ? { ...(insertedRows[insertIdx++] ?? i), isNew: false } : i))
    setItems(finalItems)
    originalItemIds.current = new Set(finalItems.map((i) => i.id))

    const { error: schemaError } = await supabase.from('finka_connection_schema').upsert(
      {
        project_id: projectId,
        klant_referentie: klantReferentie || null,
        adres: adres || null,
        opsteller: opsteller || null,
        behorend_bij_tekening: behorendBijTekening || null,
        versie,
        groepenverdeling_tekst: groepenverdelingTekst || null,
        extra_secties: extraSecties,
        let_op_notities: letOpNotities || null,
        // De kastenrij-tekening ("wanden") wordt in deze versie van het
        // aansluitschema nog niet via de UI bewerkt (zie AansluitschemaTekening.tsx
        // — nog niet af). Ongewijzigd terugschrijven i.p.v. weglaten, anders
        // overschrijft deze upsert bestaande wand-data (bv. al ingevoerd
        // tijdens lokaal testen) met een lege array.
        wanden: schema?.wanden ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    if (schemaError) {
      setError(schemaError.message)
      setSaving(false)
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  function toggleSelectedImage(url: string) {
    setSelectedImageUrls((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  // Verwerkt alle aangevinkte vooraanzichten in één keer — één API-call per
  // afbeelding (parallel), en/of je vrije tekst. Elke afbeelding kan ook
  // los bijdragen aan de voorgestelde checklist-regels; de eerste afbeelding
  // (of de tekst-call, indien ingevuld) levert het items/nieuwe_regels-voorstel
  // zodat diezelfde regels niet per afbeelding dubbel worden voorgesteld. De
  // AI leest ook een eventuele kastenrij/aansluitpunten uit de tekening,
  // maar dat voorstel wordt in deze versie nog niet getoond/toegepast — de
  // visuele tekening (AansluitschemaTekening.tsx) is nog niet af.
  async function handleAiHulp() {
    setAiLoading(true)
    setAiError('')
    setAiSuggestion(null)
    try {
      const catalogus = items.map((i) => ({ standard_key: i.standard_key, omschrijving: i.omschrijving }))
      const imageUrls = [...selectedImageUrls]
      if (!vrijeTekst.trim() && !imageUrls.length) throw new Error('Kies minstens één tekening of vul tekst in')

      async function callApi(plattegrondUrl: string | null) {
        const res = await fetch('/api/aansluitschema/ai-vul-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vrijeTekst, plattegrondUrl, catalogus }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'AI-hulp mislukt')
        return body
      }

      const [textResult, ...imageResults] = await Promise.all([
        vrijeTekst.trim() ? callApi(null) : Promise.resolve(null),
        ...imageUrls.map((url) => callApi(url)),
      ])

      const items_ = textResult ? (textResult.items ?? []) : imageResults[0]?.items ?? []
      const nieuweRegels = textResult ? (textResult.nieuwe_regels ?? []) : imageResults[0]?.nieuwe_regels ?? []

      const suggestion: AiSuggestion = { items: items_, nieuwe_regels: nieuweRegels }
      setAiSuggestion(suggestion)
      const allKeys = new Set<string>()
      suggestion.items.forEach((it, i) => allKeys.add(`item-${i}`))
      suggestion.nieuwe_regels.forEach((_, i) => allKeys.add(`new-${i}`))
      setAiChecked(allKeys)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI-hulp mislukt')
    } finally {
      setAiLoading(false)
    }
  }

  function toggleAiChecked(key: string) {
    setAiChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function applyAiSuggestion() {
    if (!aiSuggestion) return

    setItems((prev) => {
      let next = [...prev]
      aiSuggestion.items.forEach((s, i) => {
        if (!aiChecked.has(`item-${i}`)) return
        next = next.map((it) =>
          it.standard_key === s.standard_key
            ? {
                ...it,
                van_toepassing: s.van_toepassing ?? it.van_toepassing,
                aantal: s.aantal ?? it.aantal,
                hoogte_cm: s.hoogte_cm ?? it.hoogte_cm,
                positie_toelichting: s.positie_toelichting ?? it.positie_toelichting,
              }
            : it
        )
      })
      const maxSort = next.reduce((max, i) => Math.max(max, i.sort_order), -1)
      let offset = 1
      aiSuggestion.nieuwe_regels.forEach((nr, i) => {
        if (!aiChecked.has(`new-${i}`)) return
        next = [
          ...next,
          {
            id: genId(),
            project_id: projectId,
            category: nr.category,
            standard_key: null,
            sort_order: maxSort + offset++,
            omschrijving: nr.omschrijving,
            van_toepassing: true,
            aantal: nr.aantal ?? null,
            hoogte_cm: nr.hoogte_cm ?? null,
            positie_toelichting: nr.positie_toelichting ?? null,
            created_at: '',
            updated_at: '',
            isNew: true,
          },
        ]
      })
      return next
    })

    setAiSuggestion(null)
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const res = await fetch(`/api/aansluitschema/${projectId}/pdf`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(`PDF-download mislukt: ${body.error ?? res.statusText}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aansluitschema-${projectId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#DDD8D2] rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-xs font-semibold text-[#9A948D] uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={13} /> AI-hulp — concept invullen
          </h3>
        </div>
        <p className="text-xs text-[#6B6560] mb-3">
          De AI leest alle hieronder aangevinkte tekeningen tegelijk en/of je vrije tekst, en stelt een concept voor: welke standaardregels van toepassing zijn, en aantal/hoogte/positie. Jij vinkt alleen aan wat je overneemt, niets wordt automatisch opgeslagen.
        </p>
        <textarea
          value={vrijeTekst}
          onChange={(e) => setVrijeTekst(e.target.value)}
          placeholder="Optioneel: apparatuurlijst, bijzonderheden of dingen die niet op de tekeningen te zien zijn (bv. gewenste wattages, merken, uitzonderingen). Leeg laten mag als de tekeningen genoeg zeggen."
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {imageOptions.length > 0 && (
          <div className="mt-3">
            <span className="block text-xs text-[#9A948D] mb-1.5">Tekeningen om te analyseren</span>
            <div className="flex flex-wrap gap-3">
              {imageOptions.map((url, i) => (
                <label key={url} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={selectedImageUrls.has(url)} onCheckedChange={() => toggleSelectedImage(url)} />
                  {i < vooraanzichtUrls.length ? `Vooraanzicht ${i + 1} (offerte)` : `Eigen upload ${i - vooraanzichtUrls.length + 1}`}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 mt-3">
          <label className="text-xs text-[#C9A96E] hover:underline cursor-pointer">
            {uploadingTekening ? 'Uploaden...' : 'Andere tekening uploaden'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingTekening}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUploadTekening(file)
              }}
            />
          </label>
          <div className="flex-1" />
          <Button size="sm" onClick={handleAiHulp} disabled={aiLoading || (!vrijeTekst.trim() && !selectedImageUrls.size)}>
            {aiLoading ? 'Bezig...' : 'Voorstel genereren'}
          </Button>
        </div>
        {aiError && <p className="text-sm text-red-600 mt-2">{aiError}</p>}

        {aiSuggestion && (
          <div className="mt-4 border-t border-[#DDD8D2] pt-4">
            <h4 className="text-xs font-semibold text-[#9A948D] uppercase tracking-wider mb-2">Voorstel — beoordeel voor je het overneemt</h4>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {aiSuggestion.items.map((s, i) => (
                <label key={i} className="flex items-start gap-2 text-sm py-1">
                  <Checkbox checked={aiChecked.has(`item-${i}`)} onCheckedChange={() => toggleAiChecked(`item-${i}`)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{items.find((it) => it.standard_key === s.standard_key)?.omschrijving ?? s.standard_key}</span>
                    {' — '}
                    {s.van_toepassing ? 'van toepassing' : 'n.v.t.'}
                    {s.aantal && `, aantal ${s.aantal}`}
                    {s.hoogte_cm && `, hoogte ${s.hoogte_cm} cm`}
                    {s.positie_toelichting && `, ${s.positie_toelichting}`}
                  </span>
                </label>
              ))}
              {aiSuggestion.nieuwe_regels.map((nr, i) => (
                <label key={i} className="flex items-start gap-2 text-sm py-1">
                  <Checkbox checked={aiChecked.has(`new-${i}`)} onCheckedChange={() => toggleAiChecked(`new-${i}`)} className="mt-0.5" />
                  <span>
                    <span className="text-[#C9A96E]">Nieuwe regel — </span>
                    <span className="font-medium">{nr.omschrijving}</span>
                    {nr.hoogte_cm && `, hoogte ${nr.hoogte_cm} cm`}
                    {nr.positie_toelichting && `, ${nr.positie_toelichting}`}
                  </span>
                </label>
              ))}
              {!aiSuggestion.items.length && !aiSuggestion.nieuwe_regels.length && (
                <p className="text-sm text-[#6B6560]">Geen voorstel kunnen maken uit deze input.</p>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={applyAiSuggestion}>Voorstel toepassen op concept</Button>
              <Button size="sm" variant="outline" onClick={() => setAiSuggestion(null)}>Negeren</Button>
            </div>
          </div>
        )}
      </div>

      {/* Nog alleen de checklist — de kastenrij-tekening (voorheen een tweede
         tab hier) is nog niet af, zie AansluitschemaTekening.tsx. */}
      <div className="space-y-4">
          <div className="bg-white border border-[#DDD8D2] rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Klant / referentie"><Input className="h-9" value={klantReferentie} onChange={(e) => setKlantReferentie(e.target.value)} /></Field>
            <Field label="Adres"><Input className="h-9" value={adres} onChange={(e) => setAdres(e.target.value)} /></Field>
            <Field label="Opsteller"><Input className="h-9" value={opsteller} onChange={(e) => setOpsteller(e.target.value)} /></Field>
            <Field label="Behorend bij tekening"><Input className="h-9" value={behorendBijTekening} onChange={(e) => setBehorendBijTekening(e.target.value)} /></Field>
            <Field label="Versie"><Input type="number" min={1} className="h-9" value={versie} onChange={(e) => setVersie(Number(e.target.value) || 1)} /></Field>
          </div>

          {CATEGORY_ORDER.map((category) => {
            const rows = items.filter((i) => i.category === category).sort((a, b) => a.sort_order - b.sort_order)
            return (
              <div key={category} className="bg-white border border-[#DDD8D2] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[#F7F5F2] text-xs font-semibold text-[#6B6560] uppercase tracking-wider">
                  {CATEGORY_LABELS[category]}
                </div>
                {rows.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3 border-t border-[#DDD8D2]">
                    <Checkbox
                      checked={item.van_toepassing}
                      onCheckedChange={(checked) => updateItem(item.id, { van_toepassing: !!checked })}
                      className="mt-2.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      {item.standard_key ? (
                        <p className="text-sm text-[#1C1B19] py-2">{item.omschrijving}</p>
                      ) : (
                        <Input
                          className="h-9"
                          placeholder="Omschrijving aansluiting"
                          value={item.omschrijving}
                          onChange={(e) => updateItem(item.id, { omschrijving: e.target.value })}
                        />
                      )}
                    </div>
                    <Input
                      className="h-9 w-20 shrink-0"
                      placeholder="Aantal"
                      value={item.aantal ?? ''}
                      onChange={(e) => updateItem(item.id, { aantal: e.target.value || null })}
                    />
                    <Input
                      className="h-9 w-28 shrink-0"
                      placeholder="Hoogte (cm)"
                      value={item.hoogte_cm ?? ''}
                      onChange={(e) => updateItem(item.id, { hoogte_cm: e.target.value || null })}
                    />
                    <Input
                      className="h-9 flex-1 min-w-0"
                      placeholder="Positie / toelichting"
                      value={item.positie_toelichting ?? ''}
                      onChange={(e) => updateItem(item.id, { positie_toelichting: e.target.value || null })}
                    />
                    <button onClick={() => removeItem(item.id)} className="mt-2 shrink-0" title="Regel verwijderen">
                      <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  </div>
                ))}
                <div className="px-4 py-2.5 border-t border-[#DDD8D2] bg-[#FBFAF8]">
                  <Button variant="outline" size="sm" onClick={() => addCustomItem(category)}>
                    <Plus size={13} className="mr-1.5" /> Eigen regel toevoegen
                  </Button>
                </div>
              </div>
            )
          })}

          <div className="bg-white border border-[#DDD8D2] rounded-xl p-4 space-y-4">
            <Field label="Groepenverdeling">
              <textarea
                value={groepenverdelingTekst}
                onChange={(e) => setGroepenverdelingTekst(e.target.value)}
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>

            {extraSecties.map((sectie, idx) => (
              <div key={idx} className="border border-[#DDD8D2] rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9"
                    placeholder="Titel (bv. 'Spoelkast als centraal aansluitpunt')"
                    value={sectie.titel}
                    onChange={(e) => updateSectie(idx, { titel: e.target.value })}
                  />
                  <button onClick={() => removeSectie(idx)} title="Sectie verwijderen">
                    <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                  </button>
                </div>
                <textarea
                  value={sectie.tekst}
                  onChange={(e) => updateSectie(idx, { tekst: e.target.value })}
                  className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addSectie}>
              <Plus size={13} className="mr-1.5" /> Sectie toevoegen
            </Button>

            <Field label="Let op (bulletlijst, één regel per punt)">
              <textarea
                value={letOpNotities}
                onChange={(e) => setLetOpNotities(e.target.value)}
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
          </div>
      </div>

      <div className="flex items-center gap-3 bg-white border border-[#DDD8D2] rounded-xl px-5 py-4">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        <Button variant="outline" onClick={handleDownloadPdf} disabled={pdfLoading}>{pdfLoading ? 'PDF maken...' : 'Download PDF'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#9A948D] mb-1">{label}</span>
      {children}
    </label>
  )
}
