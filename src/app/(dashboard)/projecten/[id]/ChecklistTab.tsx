'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'
import { ChecklistCategory, ChecklistItem } from '@/lib/types'
import { CHECKLIST_CATEGORY_LABELS, CHECKLIST_CATEGORY_ORDER, checklistItemLabel } from '@/lib/checklist'

// Elk vinkje/label slaat meteen op (geen aparte "Opslaan"-knop) — zelfde
// aanpak als NotesPanel: bij een checklist voelt direct blijven staan
// natuurlijker dan een batch-opslag zoals bij Planning/Offerte.
export default function ChecklistTab({
  projectId,
  items: initialItems,
}: {
  projectId: string
  items: ChecklistItem[]
}) {
  const supabase = createClient()
  const [items, setItems] = useState<ChecklistItem[]>(initialItems)
  const [addingCategory, setAddingCategory] = useState<ChecklistCategory | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState('')

  const total = items.length
  const doneCount = items.filter((i) => i.checked).length

  function itemsFor(category: ChecklistCategory) {
    return items.filter((i) => i.category === category).sort((a, b) => a.sort_order - b.sort_order)
  }

  async function toggleChecked(item: ChecklistItem) {
    const checked = !item.checked
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked } : i)))
    const { error: updError } = await supabase
      .from('finka_checklist_items')
      .update({ checked, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  function updateLocalLabel(id: string, label: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)))
  }

  async function saveLabel(item: ChecklistItem) {
    const { error: updError } = await supabase
      .from('finka_checklist_items')
      .update({ label: item.label || null, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  async function addItem(category: ChecklistCategory) {
    if (!newLabel.trim()) {
      setAddingCategory(null)
      return
    }
    const maxOrder = itemsFor(category).reduce((max, i) => Math.max(max, i.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_checklist_items')
      .insert({ project_id: projectId, item_key: null, category, label: newLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setItems((prev) => [...prev, data as ChecklistItem])
    setNewLabel('')
    setAddingCategory(null)
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const { error: delError } = await supabase.from('finka_checklist_items').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#1C1B19]">Voortgang</span>
          <span className="text-sm text-[#6B6560]">{doneCount} van {total} afgevinkt · {percentage}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#F0EDE9] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#C9A96E] transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {CHECKLIST_CATEGORY_ORDER.map((category) => {
        const catItems = itemsFor(category)
        return (
          <div key={category} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <h3 className="text-sm font-medium text-[#1C1B19]">{CHECKLIST_CATEGORY_LABELS[category]}</h3>
            </div>
            <div className="divide-y divide-[#DDD8D2]">
              {catItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <Checkbox checked={item.checked} onCheckedChange={() => toggleChecked(item)} />
                  <input
                    value={item.label ?? (item.item_key ? checklistItemLabel(item) : '')}
                    placeholder={item.item_key ? undefined : 'Omschrijving...'}
                    onChange={(e) => updateLocalLabel(item.id, e.target.value)}
                    onBlur={() => saveLabel(item)}
                    className={`flex-1 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${item.checked ? 'line-through text-[#9A948D]' : 'text-[#1C1B19]'}`}
                  />
                  <button
                    onClick={() => removeItem(item.id)}
                    title={item.item_key ? 'Verwijderen (geldt niet voor toekomstige projecten)' : 'Punt verwijderen'}
                  >
                    <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                  </button>
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
                    placeholder="Nieuw punt..."
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
                  Punt toevoegen
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
