'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { formatPrice } from '@/lib/appliance-utils'
import { ConfiguratorOption, ConfiguratorScenario, ConfiguratorSection } from '@/lib/types'
import { Trash2 } from 'lucide-react'

const SECTIONS: ConfiguratorSection[] = ['kasten', 'apparatuur', 'werkblad', 'opslag']

const SECTION_LABELS: Record<ConfiguratorSection, string> = {
  kasten: 'Kasten',
  apparatuur: 'Apparatuur',
  werkblad: 'Werkblad',
  opslag: 'Opslag, levering en montage',
}

function selectedOptionId(scenario: ConfiguratorScenario, section: ConfiguratorSection): string | null {
  switch (section) {
    case 'kasten': return scenario.kasten_option_id
    case 'apparatuur': return scenario.apparatuur_option_id
    case 'werkblad': return scenario.werkblad_option_id
    case 'opslag': return scenario.opslag_option_id
  }
}

// Eén kostenoverzicht: per onderdeel precies één optie aanvinken (aanvinken
// van een andere optie in dezelfde rij vervangt de vorige keuze — geen
// meerdere tegelijk), een opgeteld kostprijs-totaal ter vergelijking, en de
// knop die deze combinatie daadwerkelijk naar het Offerte-tabblad doorzet.
export default function ScenarioCard({
  scenario,
  optionsBySection,
  onSelectOption,
  onRename,
  onDelete,
  onApply,
  canDelete,
  applying,
  applied,
  applyError,
}: {
  scenario: ConfiguratorScenario
  optionsBySection: Record<ConfiguratorSection, ConfiguratorOption[]>
  onSelectOption: (section: ConfiguratorSection, optionId: string | null) => void
  onRename: (name: string) => void
  onDelete: () => void
  onApply: () => void
  canDelete: boolean
  applying: boolean
  applied: boolean
  applyError: string
}) {
  const [editingName, setEditingName] = useState(false)

  const selected = SECTIONS.map((section) => {
    const id = selectedOptionId(scenario, section)
    return optionsBySection[section].find((o) => o.id === id)
  })
  const total = selected.reduce((sum, o) => sum + (o?.cost_total ?? 0), 0)
  const missing = SECTIONS.filter((_, i) => !selected[i] && optionsBySection[SECTIONS[i]].length > 0)

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        {editingName ? (
          <input
            autoFocus
            value={scenario.name}
            onChange={(e) => onRename(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(false) }}
            className="text-sm font-medium bg-transparent border-b border-[#DDD8D2] outline-none"
          />
        ) : (
          <button type="button" onClick={() => setEditingName(true)} title="Klik om naam te wijzigen" className="text-sm font-medium text-[#1C1B19] hover:underline">
            {scenario.name}
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} title="Kostenoverzicht verwijderen">
            <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => {
          const opts = optionsBySection[section]
          const currentId = selectedOptionId(scenario, section)
          if (!opts.length) {
            return (
              <p key={section} className="text-xs text-[#9A948D]">
                {SECTION_LABELS[section]}: nog geen optie aangemaakt hierboven
              </p>
            )
          }
          return (
            <div key={section} className="space-y-1.5">
              <p className="text-xs font-medium text-[#6B6560]">{SECTION_LABELS[section]}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {opts.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-1.5 text-xs text-[#1C1B19] cursor-pointer">
                    <Checkbox
                      checked={currentId === opt.id}
                      onCheckedChange={(checked) => onSelectOption(section, checked ? opt.id : null)}
                    />
                    {opt.name}
                    <span className="text-[#9A948D]">({formatPrice(opt.cost_total)})</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[#DDD8D2] pt-3">
        <div>
          <p className="text-xs text-[#6B6560]">Kostprijs (excl. marge en btw)</p>
          <p className="text-lg font-semibold text-[#1C1B19]">{formatPrice(total)}</p>
          {missing.length > 0 && (
            <p className="text-[10px] text-[#9A948D] mt-0.5">Nog geen keuze bij: {missing.map((s) => SECTION_LABELS[s]).join(', ')}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <Button onClick={onApply} disabled={applying}>
            {applying ? 'Toepassen...' : 'Toepassen op Offerte'}
          </Button>
          {applied && <p className="text-xs text-green-600 mt-1">Toegepast op Offerte</p>}
          {applyError && <p className="text-xs text-red-600 mt-1">{applyError}</p>}
        </div>
      </div>
    </div>
  )
}
