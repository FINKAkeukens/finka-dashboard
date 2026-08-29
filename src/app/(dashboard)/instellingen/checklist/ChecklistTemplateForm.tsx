'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { ChecklistCategoryItem, ChecklistTemplateItem } from '@/lib/types'

// Zelfde aanpak als ChecklistTab: elke wijziging slaat meteen op, geen
// aparte "Opslaan"-knop. Kopjes (categorieën) en de items erbinnen zijn
// hier allebei aan te passen — kopje verwijderen verwijdert (via ON DELETE
// CASCADE) ook de items erbinnen, vandaar de confirm().
export default function ChecklistTemplateForm({
  initialCategories,
  initialItems,
}: {
  initialCategories: ChecklistCategoryItem[]
  initialItems: ChecklistTemplateItem[]
}) {
  const supabase = createClient()
  const [categories, setCategories] = useState<ChecklistCategoryItem[]>(initialCategories)
  const [items, setItems] = useState<ChecklistTemplateItem[]>(initialItems)
  const [addingCategoryId, setAddingCategoryId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [error, setError] = useState('')

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  function itemsFor(categoryId: string) {
    return items.filter((i) => i.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  }

  // --- Items binnen een kopje -------------------------------------------

  function updateLocalLabel(id: string, label: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)))
  }

  async function saveLabel(item: ChecklistTemplateItem) {
    if (!item.label.trim()) {
      setError('Een checklist-item mag niet leeg zijn.')
      return
    }
    const { error: updError } = await supabase
      .from('finka_checklist_templates')
      .update({ label: item.label.trim(), updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  async function addItem(categoryId: string) {
    if (!newLabel.trim()) {
      setAddingCategoryId(null)
      return
    }
    const maxOrder = itemsFor(categoryId).reduce((max, i) => Math.max(max, i.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_checklist_templates')
      .insert({ category_id: categoryId, label: newLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setItems((prev) => [...prev, data as ChecklistTemplateItem])
    setNewLabel('')
    setAddingCategoryId(null)
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const { error: delError } = await supabase.from('finka_checklist_templates').delete().eq('id', id)
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
      supabase.from('finka_checklist_templates').update({ sort_order: swapWith.sort_order }).eq('id', current.id),
      supabase.from('finka_checklist_templates').update({ sort_order: current.sort_order }).eq('id', swapWith.id),
    ])
    if (err1 || err2) setError((err1 ?? err2)!.message)
  }

  // --- Kopjes (categorieën) zelf -----------------------------------------

  function updateLocalCategoryLabel(id: string, label: string) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }

  async function saveCategoryLabel(category: ChecklistCategoryItem) {
    if (!category.label.trim()) {
      setError('Een kopje mag niet leeg zijn.')
      return
    }
    const { error: updError } = await supabase
      .from('finka_checklist_categories')
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
      .from('finka_checklist_categories')
      .insert({ label: newCategoryLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setCategories((prev) => [...prev, data as ChecklistCategoryItem])
    setNewCategoryLabel('')
    setAddingCategory(false)
  }

  async function removeCategory(category: ChecklistCategoryItem) {
    const count = itemsFor(category.id).length
    const warning = count > 0
      ? `Kopje "${category.label}" verwijderen? De ${count} item(s) erbinnen worden dan ook verwijderd.`
      : `Kopje "${category.label}" verwijderen?`
    if (!confirm(warning)) return
    setCategories((prev) => prev.filter((c) => c.id !== category.id))
    setItems((prev) => prev.filter((i) => i.category_id !== category.id))
    const { error: delError } = await supabase.from('finka_checklist_categories').delete().eq('id', category.id)
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
      supabase.from('finka_checklist_categories').update({ sort_order: swapWith.sort_order }).eq('id', current.id),
      supabase.from('finka_checklist_categories').update({ sort_order: current.sort_order }).eq('id', swapWith.id),
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
                <button
                  type="button"
                  onClick={() => moveCategory(category.id, -1)}
                  disabled={catIndex === 0}
                  className="disabled:opacity-20"
                  title="Kopje omhoog"
                >
                  <ChevronUp size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCategory(category.id, 1)}
                  disabled={catIndex === orderedCategories.length - 1}
                  className="disabled:opacity-20"
                  title="Kopje omlaag"
                >
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
              {catItems.map((item, index) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex flex-col -space-y-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveItem(category.id, item.id, -1)}
                      disabled={index === 0}
                      className="disabled:opacity-20"
                      title="Omhoog"
                    >
                      <ChevronUp size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(category.id, item.id, 1)}
                      disabled={index === catItems.length - 1}
                      className="disabled:opacity-20"
                      title="Omlaag"
                    >
                      <ChevronDown size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                    </button>
                  </div>
                  <input
                    value={item.label}
                    onChange={(e) => updateLocalLabel(item.id, e.target.value)}
                    onBlur={() => saveLabel(item)}
                    className="flex-1 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] text-[#1C1B19]"
                  />
                  <button onClick={() => removeItem(item.id)} title="Item verwijderen">
                    <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                  </button>
                </div>
              ))}

              {addingCategoryId === category.id ? (
                <div className="flex items-center gap-2 px-5 py-3">
                  <Input
                    autoFocus
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addItem(category.id)
                      if (e.key === 'Escape') { setAddingCategoryId(null); setNewLabel('') }
                    }}
                    placeholder="Nieuw item..."
                    className="h-8 flex-1"
                  />
                  <Button size="sm" onClick={() => addItem(category.id)}>Toevoegen</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingCategoryId(category.id)}
                  className="w-full flex items-center gap-1.5 px-5 py-3 text-xs text-[#6B6560] hover:text-[#1C1B19]"
                >
                  <Plus size={12} />
                  Item toevoegen
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
