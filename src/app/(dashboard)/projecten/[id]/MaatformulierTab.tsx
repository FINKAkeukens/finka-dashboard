'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, Eye, EyeOff, MessageSquare, Plus, Trash2, X } from 'lucide-react'
import {
  MaatformulierFieldType,
  MaatformulierItem,
  MaatformulierSignoff,
} from '@/lib/types'
import { categoriesInOrder, formatAnswer, itemsInTreeOrder, MAATFORMULIER_OTHER_OPTION, MAATFORMULIER_TYPE_LABELS } from '@/lib/maatformulier'
import AutoTextarea from '@/components/ui/auto-textarea'
import MaatformulierSubQuestionControl from '@/components/MaatformulierSubQuestionControl'
import { createMaatformulierForProject } from '@/lib/maatformulier-create'

// Het formulier "Ruimte gereed" van dít project: een kopie van het sjabloon uit
// Instellingen, hier per klant aan te passen. De antwoorden vult de klant
// zelf in via het portaal — staff ziet ze hier alleen, en bepaalt met de
// oog-knop welke regels de klant te zien krijgt.
export default function MaatformulierTab({
  projectId,
  items: initialItems,
  signoff: initialSignoff,
}: {
  projectId: string
  items: MaatformulierItem[]
  signoff: MaatformulierSignoff | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<MaatformulierItem[]>(initialItems)
  const [signoff, setSignoff] = useState<MaatformulierSignoff | null>(initialSignoff)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [addingCategory, setAddingCategory] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null)
  const [newOption, setNewOption] = useState('')
  const [error, setError] = useState('')

  function itemsFor(category: string) {
    return items.filter((i) => i.category === category).sort((a, b) => a.sort_order - b.sort_order)
  }

  // Afspraak-regels zijn puur tekst om te lezen, die vraagt niemand te
  // beantwoorden — die tellen dus niet mee in "x van y beantwoord".
  const answerableItems = items.filter((i) => i.type !== 'afspraak')
  const answerableCount = answerableItems.length
  const answeredCount = answerableItems.filter((i) => i.answer).length

  // Zelfde principe als "Checklist aanmaken": pas op deze knop wordt het
  // sjabloon gekopieerd, waarna dit project z'n eigen versie heeft. Bij de
  // status "Akkoord" gebeurt dit automatisch (zie EditProjectForm) — deze
  // knop blijft voor projecten waar dat niet is gebeurd, of waar het
  // formulier bewust is verwijderd en later toch weer nodig blijkt.
  async function createForm() {
    setCreating(true)
    setError('')
    const result = await createMaatformulierForProject(supabase, projectId)
    setCreating(false)
    if (result.status === 'created') {
      setItems(result.items)
    } else if (result.status === 'no-template') {
      setError('Geen standaardformulier gevonden — stel dit eerst in via Instellingen > Ruimte gereed.')
    } else if (result.status === 'error') {
      setError(result.message)
    } else {
      // Iemand anders was net voor — gewoon tonen wat er nu staat.
      router.refresh()
    }
  }

  // Het hele formulier van dit project weggooien, zodat er daarna een verse
  // kopie van het (mogelijk gewijzigde) sjabloon aangemaakt kan worden. Ook
  // de handtekening gaat mee: die hoort bij de weggegooide vragen/antwoorden,
  // en zou een nieuw formulier meteen als "al ondertekend" laten ogen.
  async function deleteForm() {
    const warning = signoff
      ? 'Dit formulier is al ondertekend door de klant. Het formulier, alle ingevulde antwoorden én de ondertekening worden verwijderd. Weet je het zeker?'
      : 'Het volledige formulier "Ruimte gereed" van dit project en alle ingevulde antwoorden worden verwijderd. Weet je het zeker?'
    if (!confirm(warning)) return

    setDeleting(true)
    setError('')
    const [{ error: itemsError }, { error: signoffError }] = await Promise.all([
      supabase.from('finka_maatformulier_items').delete().eq('project_id', projectId),
      supabase.from('finka_maatformulier_signoff').delete().eq('project_id', projectId),
    ])
    setDeleting(false)
    if (itemsError || signoffError) {
      setError((itemsError ?? signoffError)!.message)
      return
    }
    setItems([])
    setSignoff(null)
  }

  async function toggleVisible(item: MaatformulierItem) {
    const visible_to_customer = !item.visible_to_customer
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, visible_to_customer } : i)))
    const { error: updError } = await supabase
      .from('finka_maatformulier_items')
      .update({ visible_to_customer, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  function updateLocalLabel(id: string, label: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)))
  }

  async function saveLabel(item: MaatformulierItem) {
    if (!item.label.trim()) {
      setError('Een regel mag niet leeg zijn.')
      return
    }
    const { error: updError } = await supabase
      .from('finka_maatformulier_items')
      .update({ label: item.label.trim(), updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  async function addItem(category: string) {
    if (!newLabel.trim()) {
      setAddingCategory(null)
      return
    }
    const maxOrder = items.reduce((max, i) => Math.max(max, i.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_maatformulier_items')
      .insert({ project_id: projectId, category, label: newLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setItems((prev) => [...prev, data as MaatformulierItem])
    setNewLabel('')
    setAddingCategory(null)
  }

  async function updateType(item: MaatformulierItem, type: MaatformulierFieldType) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, type } : i)))
    const { error: updError } = await supabase
      .from('finka_maatformulier_items')
      .update({ type, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  // Keuzeopties en eenheid zijn per project aan te passen, net als in het
  // sjabloon — anders zou staff hier wel "Eigen keuzeopties" als type zien
  // staan, maar nergens wélke opties dat zijn.
  async function saveOptions(id: string, options: string[]) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, options } : i)))
    const { error: updError } = await supabase
      .from('finka_maatformulier_items')
      .update({ options, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  function addOption(id: string) {
    if (!newOption.trim()) {
      setAddingOptionFor(null)
      return
    }
    if (newOption.trim().toLowerCase().startsWith('anders')) {
      setError(`"${MAATFORMULIER_OTHER_OPTION}" wordt al automatisch bij elke keuzevraag getoond — geen aparte optie nodig.`)
      return
    }
    const item = items.find((i) => i.id === id)
    if (item) saveOptions(id, [...item.options, newOption.trim()])
    setNewOption('')
    setAddingOptionFor(null)
  }

  function removeOption(id: string, index: number) {
    const item = items.find((i) => i.id === id)
    if (item) saveOptions(id, item.options.filter((_, i) => i !== index))
  }

  async function updateUnit(id: string, unit: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, unit: unit || null } : i)))
    const { error: updError } = await supabase
      .from('finka_maatformulier_items')
      .update({ unit: unit || null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  // Een regel aan een vraag erboven koppelen (of die koppeling weer opheffen)
  // — geldt alleen voor dit project, het sjabloon blijft ongewijzigd.
  async function updateParent(id: string, patch: { parent_id: string | null; show_when_answer: string | null }) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    const { error: updError } = await supabase
      .from('finka_maatformulier_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const { error: delError } = await supabase.from('finka_maatformulier_items').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 flex flex-col items-center text-center gap-3">
          <p className="text-sm text-[#6B6560] max-w-sm">
            Dit project heeft nog geen formulier &quot;Ruimte gereed&quot;. Maak &apos;m aan op basis van het standaardformulier uit
            Instellingen; daarna kun je regels aanpassen, verbergen of toevoegen voor deze klant.
          </p>
          <Button onClick={createForm} disabled={creating}>
            {creating ? 'Bezig...' : 'Formulier aanmaken'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          {signoff ? (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-900">
              <CheckCircle2 size={15} />
              Ondertekend door {signoff.signed_by} op{' '}
              {new Date(signoff.signed_at).toLocaleString('nl-NL', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          ) : (
            <p className="text-sm text-[#6B6560]">
              Nog niet ondertekend — de klant vult dit in via het klantportaal.
            </p>
          )}
          {answerableCount > 0 && (
            <p className="text-xs text-[#6B6560]">
              <span className="font-medium text-[#1C1B19]">{answeredCount} van {answerableCount}</span> vragen beantwoord
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={deleteForm}
          disabled={deleting}
          className="flex shrink-0 items-center gap-1.5 text-xs text-[#9A948D] hover:text-red-600 disabled:opacity-50"
          title="Het hele formulier verwijderen, zodat je 'm opnieuw kunt aanmaken"
        >
          <Trash2 size={13} />
          {deleting ? 'Bezig...' : 'Formulier verwijderen'}
        </button>
      </div>

      {categoriesInOrder(items).map((category) => (
        <div key={category} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
            <h3 className="text-sm font-medium text-[#1C1B19]">{category}</h3>
          </div>
          <div className="divide-y divide-[#DDD8D2]">
            {itemsInTreeOrder(itemsFor(category)).map(({ item, depth }) => (
              <div key={item.id} className="px-5 py-3" style={depth ? { paddingLeft: 20 + depth * 24 } : undefined}>
                <div className="flex items-start gap-3">
                  <AutoTextarea
                    value={item.label}
                    onChange={(v) => updateLocalLabel(item.id, v)}
                    onBlur={() => saveLabel(item)}
                    className={`flex-1 min-w-0 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${
                      item.visible_to_customer ? 'text-[#1C1B19]' : 'text-[#9A948D]'
                    }`}
                  />
                  <select
                    value={item.type}
                    onChange={(e) => updateType(item, e.target.value as MaatformulierFieldType)}
                    className="shrink-0 text-xs px-2 py-1.5 bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                  >
                    {(Object.keys(MAATFORMULIER_TYPE_LABELS) as MaatformulierFieldType[]).map((type) => (
                      <option key={type} value={type}>{MAATFORMULIER_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                  {item.type === 'getal' && (
                    <input
                      value={item.unit ?? ''}
                      onChange={(e) => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, unit: e.target.value || null } : i)))}
                      onBlur={(e) => updateUnit(item.id, e.target.value)}
                      placeholder="cm"
                      className="w-14 shrink-0 text-xs px-2 py-1.5 bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                    />
                  )}
                  <button
                    onClick={() => toggleVisible(item)}
                    className="shrink-0 pt-1"
                    title={item.visible_to_customer ? 'Zichtbaar voor klant — klik om te verbergen' : 'Verborgen voor klant — klik om te tonen'}
                  >
                    {item.visible_to_customer ? (
                      <Eye size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
                    ) : (
                      <EyeOff size={14} className="text-[#C9A96E]" />
                    )}
                  </button>
                  <button onClick={() => removeItem(item.id)} title="Regel verwijderen" className="shrink-0 pt-1">
                    <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                  </button>
                </div>
                {item.type === 'keuze' && (
                  <div className="mt-2 ml-2 flex flex-wrap items-center gap-1.5">
                    {item.options.map((opt, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-[#F7F5F2] border border-[#DDD8D2] rounded-full pl-2.5 pr-1.5 py-1 text-[#1C1B19]">
                        {opt}
                        <button onClick={() => removeOption(item.id, i)} title="Optie verwijderen">
                          <X size={11} className="text-[#9A948D] hover:text-red-600" />
                        </button>
                      </span>
                    ))}
                    {addingOptionFor === item.id ? (
                      <Input
                        autoFocus
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        onBlur={() => addOption(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addOption(item.id)
                          if (e.key === 'Escape') { setAddingOptionFor(null); setNewOption('') }
                        }}
                        placeholder="Nieuwe optie..."
                        className="h-7 w-36 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingOptionFor(item.id)}
                        className="text-xs text-[#6B6560] hover:text-[#1C1B19] flex items-center gap-1"
                      >
                        <Plus size={11} />
                        Optie
                      </button>
                    )}
                    <span className="text-xs text-[#9A948D]">
                      + &quot;{MAATFORMULIER_OTHER_OPTION}&quot;
                    </span>
                  </div>
                )}
                {/* Het antwoord van de klant is waar staff dit tabblad voor
                    opent — dus als eigen blok met accentrand, niet als losse
                    regel die wegvalt tussen de bewerkvelden eromheen. */}
                {item.type !== 'afspraak' && (
                  item.answer ? (
                    <div className="mt-2 ml-2 flex items-start gap-2 rounded-lg border border-[#E6DAC6] border-l-[3px] border-l-[#C9A96E] bg-[#FBF8F2] px-3 py-2">
                      <MessageSquare size={13} className="mt-0.5 shrink-0 text-[#C9A96E]" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-[#9A948D]">Antwoord klant</p>
                        <p className="text-sm font-medium text-[#1C1B19] break-words">{formatAnswer(item)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 ml-2 text-xs text-[#9A948D] italic">Nog niet ingevuld</p>
                  )
                )}

                <MaatformulierSubQuestionControl
                  item={item}
                  itemsInCategory={itemsFor(category)}
                  onChange={(patch) => updateParent(item.id, patch)}
                />
              </div>
            ))}

            {addingCategory === category ? (
              <div className="flex items-center gap-2 px-5 py-3">
                <Input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addItem(category)
                    if (e.key === 'Escape') { setAddingCategory(null); setNewLabel('') }
                  }}
                  placeholder="Nieuwe regel..."
                  className="h-8 flex-1"
                />
                <Button size="sm" onClick={() => addItem(category)}>Toevoegen</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategory(category)}
                className="w-full flex items-center gap-1.5 px-5 py-3 text-xs text-[#6B6560] hover:text-[#1C1B19]"
              >
                <Plus size={12} />
                Regel toevoegen
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
