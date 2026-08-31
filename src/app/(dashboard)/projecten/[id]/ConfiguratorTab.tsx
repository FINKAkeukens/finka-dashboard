'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Appliance,
  ApparatuurOptionData,
  ConfiguratorOption,
  ConfiguratorOptionData,
  ConfiguratorScenario,
  ConfiguratorSection,
  EurolineRates,
  KastenOptionData,
  OpslagOptionData,
  Quote,
  WerkbladOptionData,
  WerkbladRates,
} from '@/lib/types'
import { DEFAULT_WERKBLAD_RATES } from '@/lib/werkblad-calc'
import { computeEurolineTotals, DEFAULT_EUROLINE_INPUTS, DEFAULT_EUROLINE_RATES } from '@/lib/euroline-calc'
import { applianceCustomerText, DEFAULT_COST_BREAKDOWN, patchCostRow, replaceCategoryLines } from '@/lib/configurator'
import KastenOptionEditor from './configurator/KastenOptionEditor'
import WerkbladOptionEditor from './configurator/WerkbladOptionEditor'
import OpslagOptionEditor from './configurator/OpslagOptionEditor'
import ApparatuurOptionEditor from './configurator/ApparatuurOptionEditor'
import OptionTabs from './configurator/OptionTabs'
import ScenarioCard from './configurator/ScenarioCard'

const SECTIONS: ConfiguratorSection[] = ['kasten', 'apparatuur', 'werkblad', 'opslag']

const SECTION_LABELS: Record<ConfiguratorSection, string> = {
  kasten: 'Kasten',
  apparatuur: 'Apparatuur',
  werkblad: 'Werkblad',
  opslag: 'Opslag, levering en montage',
}

const SECTION_DESCRIPTIONS: Record<ConfiguratorSection, string> = {
  kasten: 'Winner Flex / Compusoft-uitdraai — upload de tekening + onderdelenlijst per optie.',
  apparatuur: 'Kies apparatuur uit de bibliotheek — vergelijk bijvoorbeeld twee merken als losse opties.',
  werkblad: 'Upload een werkblad-specificatie of bereken zelf een richtprijs per optie.',
  opslag: 'Opslag, levering, installatie en service op basis van de Euroline-tarieven.',
}

type OptionPatch = Partial<Pick<ConfiguratorOption, 'name' | 'data' | 'cost_total'>>
type ScenarioPatch = Partial<Pick<ConfiguratorScenario, 'name' | 'kasten_option_id' | 'apparatuur_option_id' | 'werkblad_option_id' | 'opslag_option_id'>>

const SCENARIO_FIELD_BY_SECTION: Record<ConfiguratorSection, keyof ScenarioPatch> = {
  kasten: 'kasten_option_id',
  apparatuur: 'apparatuur_option_id',
  werkblad: 'werkblad_option_id',
  opslag: 'opslag_option_id',
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export default function ConfiguratorTab({
  quote,
  options: initialOptions,
  scenarios: initialScenarios,
  werkbladRates,
  eurolineRates,
  appliances,
}: {
  quote: Quote | null
  options: ConfiguratorOption[]
  scenarios: ConfiguratorScenario[]
  werkbladRates: WerkbladRates | null
  eurolineRates: EurolineRates | null
  appliances: Appliance[]
}) {
  const wbRates = werkbladRates ?? DEFAULT_WERKBLAD_RATES
  // Merge i.p.v. harde ?? fallback: als de DB-rij bestaat maar een nieuw
  // toegevoegd tariefveld nog mist, voorkomt dit een crash op een ontbrekend
  // veld i.p.v. alleen de hele rij te negeren wanneer er kennelijk al wél
  // een rij bestaat. Zelfde patroon als voorheen in QuoteEditor.
  const eRates = { ...DEFAULT_EUROLINE_RATES, ...(eurolineRates ?? {}) }
  const supabase = createClient()
  const [options, setOptions] = useState<ConfiguratorOption[]>(initialOptions)
  const [activeIds, setActiveIds] = useState<Partial<Record<ConfiguratorSection, string>>>(() => {
    const initial: Partial<Record<ConfiguratorSection, string>> = {}
    for (const section of SECTIONS) {
      const first = initialOptions.filter((o) => o.section === section).sort((a, b) => a.sort_order - b.sort_order)[0]
      if (first) initial[section] = first.id
    }
    return initial
  })
  const [scenarios, setScenarios] = useState<ConfiguratorScenario[]>(
    [...initialScenarios].sort((a, b) => a.sort_order - b.sort_order)
  )
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set())
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  if (!quote) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">
          Maak eerst een offerte aan op het Offerte-tabblad — de Configurator werkt per offerte.
        </p>
      </div>
    )
  }

  function optionsFor(section: ConfiguratorSection) {
    return options.filter((o) => o.section === section).sort((a, b) => a.sort_order - b.sort_order)
  }

  async function createOption(section: ConfiguratorSection, overrides: { name?: string; data?: ConfiguratorOptionData; cost_total?: number } = {}) {
    if (!quote) return
    const sectionOptions = optionsFor(section)
    const { data, error: insError } = await supabase
      .from('finka_configurator_options')
      .insert({
        quote_id: quote.id,
        section,
        name: overrides.name ?? `Optie ${sectionOptions.length + 1}`,
        sort_order: sectionOptions.length,
        data: overrides.data ?? {},
        cost_total: overrides.cost_total ?? 0,
      })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    const created = data as ConfiguratorOption
    setOptions((prev) => [...prev, created])
    setActiveIds((prev) => ({ ...prev, [section]: created.id }))
  }

  function duplicateOption(section: ConfiguratorSection) {
    const active = optionsFor(section).find((o) => o.id === activeIds[section])
    if (!active) return
    createOption(section, { name: `${active.name} (kopie)`, data: active.data, cost_total: active.cost_total })
  }

  async function updateOption(id: string, patch: OptionPatch) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    const { error: updError } = await supabase
      .from('finka_configurator_options')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function deleteOption(section: ConfiguratorSection, id: string) {
    const remaining = optionsFor(section).filter((o) => o.id !== id)
    setOptions((prev) => prev.filter((o) => o.id !== id))
    setActiveIds((prev) => ({ ...prev, [section]: remaining[0]?.id }))
    const { error: delError } = await supabase.from('finka_configurator_options').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  async function createScenario() {
    if (!quote) return
    const { data, error: insError } = await supabase
      .from('finka_configurator_scenarios')
      .insert({ quote_id: quote.id, name: `Kostenoverzicht ${scenarios.length + 1}`, sort_order: scenarios.length })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setScenarios((prev) => [...prev, data as ConfiguratorScenario])
  }

  async function updateScenario(id: string, patch: ScenarioPatch) {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    const { error: updError } = await supabase
      .from('finka_configurator_scenarios')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function deleteScenario(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id))
    const { error: delError } = await supabase.from('finka_configurator_scenarios').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  // De kern van de Configurator: neemt de per onderdeel gekozen optie van dit
  // kostenoverzicht en zet 'm door naar de daadwerkelijke offerte —
  // kostprijs-opbouw + klantversie in finka_quotes, en de apparatuur-regels
  // in finka_quote_items (zodat de downloadgeschiedenis/diff-functie in
  // Offerte kloppend blijft). Werkt rechtstreeks op de database: Configurator
  // en Offerte zijn twee losse pagina's, geen gedeelde React-state.
  async function applyScenario(scenario: ConfiguratorScenario) {
    if (!quote) return
    setApplyingIds((prev) => new Set(prev).add(scenario.id))
    setApplyErrors((prev) => ({ ...prev, [scenario.id]: '' }))
    try {
      const { data: freshQuote, error: fetchError } = await supabase
        .from('finka_quotes')
        .select('cost_breakdown, customer_sections')
        .eq('id', quote.id)
        .single()
      if (fetchError || !freshQuote) throw new Error(fetchError?.message ?? 'Offerte niet gevonden')

      let costBreakdown = freshQuote.cost_breakdown?.length ? freshQuote.cost_breakdown : DEFAULT_COST_BREAKDOWN
      let customerSections = Array.isArray(freshQuote.customer_sections) ? freshQuote.customer_sections : []

      const kasten = options.find((o) => o.id === scenario.kasten_option_id)
      const werkblad = options.find((o) => o.id === scenario.werkblad_option_id)
      const opslag = options.find((o) => o.id === scenario.opslag_option_id)
      const apparatuur = options.find((o) => o.id === scenario.apparatuur_option_id)

      if (kasten) {
        const d = kasten.data as KastenOptionData
        costBreakdown = patchCostRow(costBreakdown, 'keukenkastjes', kasten.cost_total)
        customerSections = replaceCategoryLines(customerSections, 'kasten', 'Kasten', d.summary_lines ?? [])
      }
      if (werkblad) {
        const d = werkblad.data as WerkbladOptionData
        costBreakdown = patchCostRow(costBreakdown, 'werkblad', werkblad.cost_total)
        customerSections = replaceCategoryLines(customerSections, 'werkblad', 'Werkblad', d.summary_lines ?? [])
      }
      if (opslag) {
        // Optie nog nooit aangeraakt (data === {}) → val terug op de
        // standaardinvoer, anders crasht computeEurolineTotals op een
        // ontbrekend veld.
        const d = opslag.data as Partial<OpslagOptionData>
        const inputs = d.euroline_inputs && Object.keys(d.euroline_inputs).length
          ? { ...DEFAULT_EUROLINE_INPUTS, ...d.euroline_inputs }
          : DEFAULT_EUROLINE_INPUTS
        const totals = computeEurolineTotals(inputs, eRates)
        costBreakdown = patchCostRow(costBreakdown, 'opslag', totals.opslag)
        costBreakdown = patchCostRow(costBreakdown, 'levering', totals.levering)
        costBreakdown = patchCostRow(costBreakdown, 'installatie', totals.installatie)
        costBreakdown = patchCostRow(costBreakdown, 'service', totals.service)
      }
      let apparatuurItems: ApparatuurOptionData['items'] | null = null
      if (apparatuur) {
        const d = apparatuur.data as Partial<ApparatuurOptionData>
        const items = d.items ?? []
        costBreakdown = patchCostRow(costBreakdown, 'apparatuur', apparatuur.cost_total)
        const itemLines = items
          .filter((i) => i.include_in_customer_view)
          .map((i) => {
            const appliance = i.appliance_id ? appliances.find((a) => a.id === i.appliance_id) : undefined
            if (appliance) return applianceCustomerText(appliance)
            return i.brand && i.model ? `${i.brand} ${i.model}` : i.description
          })
          .filter((text): text is string => !!text)
        customerSections = replaceCategoryLines(customerSections, 'apparatuur', 'Apparatuur', [...itemLines, ...(d.summary_lines ?? [])])
        apparatuurItems = items
      }

      const { error: updError } = await supabase
        .from('finka_quotes')
        .update({ cost_breakdown: costBreakdown, customer_sections: customerSections, updated_at: new Date().toISOString() })
        .eq('id', quote.id)
      if (updError) throw new Error(updError.message)

      if (apparatuurItems) {
        const { error: delError } = await supabase.from('finka_quote_items').delete().eq('quote_id', quote.id).eq('type', 'apparaat')
        if (delError) throw new Error(delError.message)
        if (apparatuurItems.length) {
          // sort_order verder laten lopen na de al bestaande (niet-apparaat)
          // regels, i.p.v. bij 0 te beginnen — anders raken de nieuwe
          // apparatuur-regels door elkaar gehusseld met product/dienst/
          // maatwerk-regels die al in de tabel stonden.
          const { count } = await supabase
            .from('finka_quote_items')
            .select('id', { count: 'exact', head: true })
            .eq('quote_id', quote.id)
          const baseOrder = count ?? 0
          const { error: insError } = await supabase.from('finka_quote_items').insert(
            apparatuurItems.map((item, idx) => ({
              quote_id: quote.id,
              type: 'apparaat' as const,
              appliance_id: item.appliance_id,
              description: item.description,
              brand: item.brand,
              model: item.model,
              quantity: item.quantity,
              unit_price: item.unit_price,
              unit_price_source: 'in' as const,
              line_total: round2(item.quantity * item.unit_price),
              line_total_source: 'auto' as const,
              sort_order: baseOrder + idx,
              include_in_customer_view: item.include_in_customer_view,
            }))
          )
          if (insError) throw new Error(insError.message)
        }
      }

      setAppliedIds((prev) => new Set(prev).add(scenario.id))
      setTimeout(() => {
        setAppliedIds((prev) => {
          const next = new Set(prev)
          next.delete(scenario.id)
          return next
        })
      }, 3000)
    } catch (err) {
      setApplyErrors((prev) => ({ ...prev, [scenario.id]: err instanceof Error ? err.message : 'Toepassen mislukt' }))
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev)
        next.delete(scenario.id)
        return next
      })
    }
  }

  const optionsBySection: Record<ConfiguratorSection, ConfiguratorOption[]> = {
    kasten: optionsFor('kasten'),
    apparatuur: optionsFor('apparatuur'),
    werkblad: optionsFor('werkblad'),
    opslag: optionsFor('opslag'),
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {SECTIONS.map((section) => {
        const sectionOptions = optionsFor(section)
        const active = sectionOptions.find((o) => o.id === activeIds[section]) ?? sectionOptions[0]

        return (
          <div key={section} className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-[#1C1B19]">{SECTION_LABELS[section]}</h3>
              <p className="text-xs text-[#6B6560] mt-0.5">{SECTION_DESCRIPTIONS[section]}</p>
            </div>

            {sectionOptions.length === 0 ? (
              <button
                type="button"
                onClick={() => createOption(section)}
                className="text-sm text-[#C9A96E] hover:underline"
              >
                + Eerste optie aanmaken
              </button>
            ) : (
              <>
                <OptionTabs
                  options={sectionOptions}
                  activeId={active?.id ?? null}
                  onSelect={(id) => setActiveIds((prev) => ({ ...prev, [section]: id }))}
                  onAdd={() => createOption(section)}
                  onDuplicate={() => duplicateOption(section)}
                  onRename={(id, name) => updateOption(id, { name })}
                  onDelete={(id) => deleteOption(section, id)}
                />
                {active && section === 'kasten' && (
                  <KastenOptionEditor
                    quoteId={quote.id}
                    option={active}
                    onChange={(patch) => updateOption(active.id, patch)}
                  />
                )}
                {active && section === 'werkblad' && (
                  <WerkbladOptionEditor
                    quoteId={quote.id}
                    wbRates={wbRates}
                    option={active}
                    onChange={(patch) => updateOption(active.id, patch)}
                  />
                )}
                {active && section === 'opslag' && (
                  <OpslagOptionEditor
                    rates={eRates}
                    option={active}
                    onChange={(patch) => updateOption(active.id, patch)}
                  />
                )}
                {active && section === 'apparatuur' && (
                  <ApparatuurOptionEditor
                    quoteId={quote.id}
                    appliances={appliances}
                    option={active}
                    onChange={(patch) => updateOption(active.id, patch)}
                  />
                )}
              </>
            )}
          </div>
        )
      })}

      {/* Kostenoverzichten — elk combineert precies één optie per onderdeel
         tot een vergelijkbaar totaal, en kan met "Toepassen op Offerte"
         daadwerkelijk naar de offerte doorgezet worden. */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[#1C1B19]">Kostenoverzichten</h3>
          <p className="text-xs text-[#6B6560] mt-0.5">
            Vink per onderdeel de optie aan die je in dit overzicht wilt meenemen, en vergelijk het totaal met een ander overzicht.
          </p>
        </div>

        {scenarios.length === 0 ? (
          <button type="button" onClick={createScenario} className="text-sm text-[#C9A96E] hover:underline">
            + Eerste kostenoverzicht aanmaken
          </button>
        ) : (
          <div className="space-y-4">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                optionsBySection={optionsBySection}
                onSelectOption={(section, optionId) => updateScenario(scenario.id, { [SCENARIO_FIELD_BY_SECTION[section]]: optionId })}
                onRename={(name) => updateScenario(scenario.id, { name })}
                onDelete={() => deleteScenario(scenario.id)}
                onApply={() => applyScenario(scenario)}
                canDelete={scenarios.length > 1}
                applying={applyingIds.has(scenario.id)}
                applied={appliedIds.has(scenario.id)}
                applyError={applyErrors[scenario.id] ?? ''}
                costBreakdown={quote?.cost_breakdown?.length ? quote.cost_breakdown : DEFAULT_COST_BREAKDOWN}
                btwPercentage={quote?.btw_percentage ?? 21}
                eurolineRates={eRates}
              />
            ))}
            <Button variant="outline" size="sm" onClick={createScenario}>
              Extra kostenoverzicht toevoegen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
