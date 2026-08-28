'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfiguratorOption } from '@/lib/types'
import { Copy, Plus, Trash2 } from 'lucide-react'

// Gedeeld "opties"-kiezertje boven elke sectie-editor in de Configurator —
// pillen om tussen opties te wisselen (klik op de actieve pil om 'm te
// hernoemen), plus de twee knoppen die de kern van de Configurator vormen:
// "Extra optie toevoegen" (leeg beginnen) en "Dupliceren" (de actieve optie
// kopiëren om daarna aan te passen, bv. apparatuur van een ander merk).
export default function OptionTabs({
  options,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onRename,
  onDelete,
}: {
  options: ConfiguratorOption[]
  activeId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onDuplicate: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map((opt) => {
        const active = opt.id === activeId
        return (
          <div
            key={opt.id}
            className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs border transition-colors ${
              active ? 'bg-[#1C1B19] text-white border-[#1C1B19]' : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#C9A96E]'
            }`}
          >
            {editingId === opt.id ? (
              <input
                autoFocus
                value={opt.name}
                onChange={(e) => onRename(opt.id, e.target.value)}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null) }}
                className={`bg-transparent border-b outline-none w-24 ${active ? 'border-white/50 text-white' : 'border-[#DDD8D2]'}`}
              />
            ) : (
              <button
                type="button"
                onClick={() => (active ? setEditingId(opt.id) : onSelect(opt.id))}
                title={active ? 'Klik om naam te wijzigen' : 'Selecteren'}
              >
                {opt.name}
              </button>
            )}
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => onDelete(opt.id)}
                title="Optie verwijderen"
                className={`opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'text-white/70 hover:text-white' : 'text-[#9A948D] hover:text-red-600'}`}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus size={12} className="mr-1" />
        Extra optie toevoegen
      </Button>
      {options.length > 0 && (
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy size={12} className="mr-1" />
          Dupliceren
        </Button>
      )}
    </div>
  )
}
