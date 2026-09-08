'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { MaatformulierCategoryItem, MaatformulierFieldType, MaatformulierTemplateItem } from '@/lib/types'
import { itemsInTreeOrder, MAATFORMULIER_OTHER_OPTION, MAATFORMULIER_TYPE_LABELS } from '@/lib/maatformulier'
import AutoTextarea from '@/components/ui/auto-textarea'
import MaatformulierSubQuestionControl from '@/components/MaatformulierSubQuestionControl'

// Zelfde aanpak als ChecklistTemplateForm: elke wijziging slaat direct op,
// kopjes en de regels erbinnen zijn allebei aan te passen.
export default function MaatformulierTemplateForm({
  initialCategories,
  initialItems,
}: {
  initialCategories: MaatformulierCategoryItem[]
  initialItems: MaatformulierTemplateItem[]
}) {
  const supabase = createClient()
  const [categories, setCategories] = useState<MaatformulierCategoryItem[]>(initialCategories)
  const [items, setItems] = useState<MaatformulierTemplateItem[]>(initialItems)
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null)
  const [newOption, setNewOption] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [error, setError] = useState('')

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  function itemsFor(categoryId: string) {
    return items.filter((i) => i.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  }

  // --- Regels binnen een kopje --------------------------------------------

  function updateLocal(id: string, patch: Partial<MaatformulierTemplateItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  async function save(id: string, patch: Partial<MaatformulierTemplateItem>) {
    const { error: updError } = await supabase
      .from('finka_maatformulier_templates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function saveLabel(item: MaatformulierTemplateItem) {
    if (!item.label.trim()) {
      setError('Een regel mag niet leeg zijn.')
      return
    }
    await save(item.id, { label: item.label.trim() })
  }

  async function updateType(id: string, type: MaatformulierFieldType) {
    updateLocal(id, { type })
    await save(id, { type })
  }

  // Een regel aan een vraag erboven koppelen (of die koppeling weer opheffen).
  async function updateParent(id: string, patch: { parent_id: string | null; show_when_answer: string | null }) {
    updateLocal(id, patch)
    await save(id, patch)
  }

  async function updateUnit(id: string, unit: string) {
    updateLocal(id, { unit: unit || null })
    await save(id, { unit: unit || null })
  }

  async function addItem(categoryId: string) {
    if (!newLabel.trim()) {
      setAddingItemFor(null)
      return
    }
    const maxOrder = itemsFor(categoryId).reduce((max, i) => Math.max(max, i.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_maatformulier_templates')
      .insert({ category_id: categoryId, label: newLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setItems((prev) => [...prev, data as MaatformulierTemplateItem])
    setNewLabel('')
    setAddingItemFor(null)
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const { error: delError } = await supabase.from('finka_maatformulier_templates').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  async function moveItem(categoryId: string, id: string, direction: -1 | 1) {
    const ordered = itemsFor(categoryId)
    const index = ordered.findIndex((i) => i.id === id)
    const swapWith = ordered[index + direction]
    if (!swapWith) return
    const current = ordered[index]
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === current.id) return { ...i, sort_order: swapWith.sort_order }
        if (i.id === swapWith.id) return { ...i, sort_order: current.sort_order }
        return i
      })
    )
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from('finka_maatformulier_templates').update({ sort_order: swapWith.sort_order }).eq('id', current.id),
      supabase.from('finka_maatformulier_templates').update({ sort_order: current.sort_order }).eq('id', swapWith.id),
    ])
    if (err1 || err2) setError((err1 ?? err2)!.message)
  }

  // --- Keuzeopties (alleen bij type 'keuze') -------------------------------

  async function saveOptions(id: string, options: string[]) {
    updateLocal(id, { options })
    await save(id, { options })
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

  // --- Kopjes ---------------------------------------------------------------

  function updateLocalCategoryLabel(id: string, label: string) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }

  async function saveCategoryLabel(category: MaatformulierCategoryItem) {
    if (!category.label.trim()) {
      setError('Een kopje mag niet leeg zijn.')
      return
    }
    const { error: updError } = await supabase
      .from('finka_maatformulier_categories')
      .update({ label: category.label.trim(), updated_at: new Date().toISOString() })
      .eq('id', category.id)
    if (updError) setError(updError.message)
  }

  async function addCategory() {
    if (!newCategoryLabel.trim()) {
      setAddingCategory(false)
      return
    }
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_maatformulier_categories')
      .insert({ label: newCategoryLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setCategories((prev) => [...prev, data as MaatformulierCategoryItem])
    setNewCategoryLabel('')
    setAddingCategory(false)
  }

  async function removeCategory(category: MaatformulierCategoryItem) {
    const count = itemsFor(category.id).length
    const warning = count > 0
      ? `Kopje "${category.label}" verwijderen? De ${count} regel(s) erbinnen worden dan ook verwijderd.`
      : `Kopje "${category.label}" verwijderen?`
    if (!confirm(warning)) return
    setCategories((prev) => prev.filter((c) => c.id !== category.id))
    setItems((prev) => prev.filter((i) => i.category_id !== category.id))
    const { error: delError } = await supabase.from('finka_maatformulier_categories').delete().eq('id', category.id)
    if (delError) setError(delError.message)
  }

  async function moveCategory(id: string, direction: -1 | 1) {
    const index = orderedCategories.findIndex((c) => c.id === id)
    const swapWith = orderedCategories[index + direction]
    if (!swapWith) return
    const current = orderedCategories[index]
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === current.id) return { ...c, sort_order: swapWith.sort_order }
        if (c.id === swapWith.id) return { ...c, sort_order: current.sort_order }
        return c
      })
    )
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from('finka_maatformulier_categories').update({ sort_order: swapWith.sort_order }).eq('id', current.id),
      supabase.from('finka_maatformulier_categories').update({ sort_order: current.sort_order }).eq('id', swapWith.id),
    ])
    if (err1 || err2) setError((err1 ?? err2)!.message)
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {orderedCategories.map((category, catIndex) => {
        const catItems = itemsFor(category.id)
        return (
          <div key={category.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <div className="flex flex-col -space-y-1 shrink-0">
                <button type="button" onClick={() => moveCategory(category.id, -1)} disabled={catIndex === 0} className="disabled:opacity-20" title="Kopje omhoog">
                  <ChevronUp size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
                <button type="button" onClick={() => moveCategory(category.id, 1)} disabled={catIndex === orderedCategories.length - 1} className="disabled:opacity-20" title="Kopje omlaag">
                  <ChevronDown size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
              </div>
              <input
                value={category.label}
                onChange={(e) => updateLocalCategoryLabel(category.id, e.target.value)}
                onBlur={() => saveCategoryLabel(category)}
                className="flex-1 text-sm font-medium bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] text-[#1C1B19]"
              />
              <button onClick={() => removeCategory(category)} title="Kopje verwijderen">
                <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>
            <div className="divide-y divide-[#DDD8D2]">
              {itemsInTreeOrder(catItems).map(({ item, depth }) => {
                const index = catItems.findIndex((i) => i.id === item.id)
                return (
                <div key={item.id} className="px-5 py-3" style={depth ? { paddingLeft: 20 + depth * 24 } : undefined}>
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col -space-y-1 shrink-0 pt-1">
                      <button type="button" onClick={() => moveItem(category.id, item.id, -1)} disabled={index === 0} className="disabled:opacity-20" title="Omhoog">
                        <ChevronUp size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                      </button>
                      <button type="button" onClick={() => moveItem(category.id, item.id, 1)} disabled={index === catItems.length - 1} className="disabled:opacity-20" title="Omlaag">
                        <ChevronDown size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                      </button>
                    </div>
                    <AutoTextarea
                      value={item.label}
                      onChange={(v) => updateLocal(item.id, { label: v })}
                      onBlur={() => saveLabel(item)}
                      className="flex-1 min-w-0 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] text-[#1C1B19]"
                    />
                    <select
                      value={item.type}
                      onChange={(e) => updateType(item.id, e.target.value as MaatformulierFieldType)}
                      className="text-xs px-2 py-1.5 bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] shrink-0"
                    >
                      {(Object.keys(MAATFORMULIER_TYPE_LABELS) as MaatformulierFieldType[]).map((type) => (
                        <option key={type} value={type}>{MAATFORMULIER_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                    {item.type === 'getal' && (
                      <input
                        value={item.unit ?? ''}
                        onChange={(e) => updateLocal(item.id, { unit: e.target.value || null })}
                        onBlur={(e) => updateUnit(item.id, e.target.value)}
                        placeholder="cm"
                        className="w-14 shrink-0 text-xs px-2 py-1.5 bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                      />
                    )}
                    <button onClick={() => removeItem(item.id)} title="Regel verwijderen" className="shrink-0 pt-1">
                      <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  </div>

                  {item.type === 'keuze' && (
                    <div className="mt-2 ml-7 flex flex-wrap items-center gap-1.5">
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
                    </div>
                  )}
                  {item.type === 'keuze' && (
                    <p className="mt-1.5 ml-7 text-xs text-[#9A948D]">
                      &quot;{MAATFORMULIER_OTHER_OPTION}&quot; wordt hier altijd automatisch bij getoond, met een invulveld voor de klant.
                    </p>
                  )}

                  <MaatformulierSubQuestionControl
                    item={item}
                    itemsInCategory={catItems}
                    onChange={(patch) => updateParent(item.id, patch)}
                  />
                </div>
                )
              })}

              {addingItemFor === category.id ? (
                <div className="flex items-center gap-2 px-5 py-3">
                  <Input
                    autoFocus
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addItem(category.id)
                      if (e.key === 'Escape') { setAddingItemFor(null); setNewLabel('') }
                    }}
                    placeholder="Nieuwe regel..."
                    className="h-8 flex-1"
                  />
                  <Button size="sm" onClick={() => addItem(category.id)}>Toevoegen</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingItemFor(category.id)}
                  className="w-full flex items-center gap-1.5 px-5 py-3 text-xs text-[#6B6560] hover:text-[#1C1B19]"
                >
                  <Plus size={12} />
                  Regel toevoegen
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] overflow-hidden">
        {addingCategory ? (
          <div className="flex items-center gap-2 px-5 py-3">
            <Input
              autoFocus
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCategory()
                if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryLabel('') }
              }}
              placeholder="Naam van nieuw kopje..."
              className="h-8 flex-1"
            />
            <Button size="sm" onClick={addCategory}>Toevoegen</Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="w-full flex items-center justify-center gap-1.5 px-5 py-3 text-sm text-[#6B6560] hover:text-[#1C1B19]"
          >
            <Plus size={14} />
            Kopje toevoegen
          </button>
        )}
      </div>
    </div>
  )
}
