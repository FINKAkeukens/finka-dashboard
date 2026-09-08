'use client'

import { CornerDownRight, X } from 'lucide-react'
import { answerOptions, possibleParents } from '@/lib/maatformulier'
import type { MaatformulierItem } from '@/lib/types'

// Minimale vorm die zowel MaatformulierTemplateItem als MaatformulierItem
// dekt — dit blokje wordt in Instellingen én op het projecttabblad gebruikt.
type SubQuestionShape = Pick<
  MaatformulierItem,
  'id' | 'label' | 'type' | 'options' | 'parent_id' | 'show_when_answer' | 'sort_order'
>

// "Alleen tonen als <vraag> = <antwoord>" — het koppelvlak waarmee een regel
// een sub-vraag van een regel erboven wordt (zie migratie-sectie 67). Zowel
// voor nieuwe als voor al bestaande regels: elke vraag in hetzelfde kopje
// die vaste antwoordopties heeft en erboven staat, kan de ouder worden.
export default function MaatformulierSubQuestionControl<T extends SubQuestionShape>({
  item,
  itemsInCategory,
  onChange,
}: {
  item: T
  itemsInCategory: T[]
  onChange: (patch: { parent_id: string | null; show_when_answer: string | null }) => void
}) {
  const parents = possibleParents(item, itemsInCategory)
  const parent = item.parent_id ? itemsInCategory.find((i) => i.id === item.parent_id) : null

  // Geen enkele bruikbare ouder én zelf nog geen sub-vraag: dan valt er niets
  // te kiezen en laten we de regel schoon.
  if (!parents.length && !parent) return null

  const triggerOptions = parent ? answerOptions(parent) : []

  return (
    <div className="mt-2 ml-7 flex flex-wrap items-center gap-1.5 text-xs text-[#6B6560]">
      <CornerDownRight size={12} className="text-[#9A948D]" />
      <span>Alleen tonen als</span>
      <select
        value={item.parent_id ?? ''}
        onChange={(e) => {
          const parentId = e.target.value || null
          const nextParent = parentId ? itemsInCategory.find((i) => i.id === parentId) : null
          // Bij een nieuwe ouder meteen de eerste optie als trigger, zodat de
          // regel nooit met een ouder maar zonder voorwaarde blijft staan
          // (die zou dan altijd zichtbaar zijn — verwarrend).
          onChange({
            parent_id: parentId,
            show_when_answer: nextParent ? answerOptions(nextParent)[0] ?? null : null,
          })
        }}
        className="max-w-[16rem] truncate bg-white border border-[#DDD8D2] rounded-lg px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
      >
        <option value="">— altijd zichtbaar —</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      {parent && (
        <>
          <span>=</span>
          <select
            value={item.show_when_answer ?? ''}
            onChange={(e) => onChange({ parent_id: parent.id, show_when_answer: e.target.value || null })}
            className="bg-white border border-[#DDD8D2] rounded-lg px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
          >
            {triggerOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange({ parent_id: null, show_when_answer: null })}
            title="Koppeling opheffen — regel weer altijd tonen"
          >
            <X size={12} className="text-[#9A948D] hover:text-red-600" />
          </button>
        </>
      )}
    </div>
  )
}
