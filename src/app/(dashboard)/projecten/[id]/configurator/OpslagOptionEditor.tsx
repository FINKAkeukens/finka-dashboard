'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import EurolineInfoButton from '@/components/EurolineInfoButton'
import { formatPrice } from '@/lib/appliance-utils'
import { computeEurolineTotals, DEFAULT_EUROLINE_INPUTS, eurolineTotaalExclBtw } from '@/lib/euroline-calc'
import { ConfiguratorOption, EurolineInputs, EurolineRates, OpslagOptionData } from '@/lib/types'

function readData(data: ConfiguratorOption['data']): OpslagOptionData {
  const d = data as unknown as Partial<OpslagOptionData> | undefined
  return {
    euroline_inputs: d?.euroline_inputs && Object.keys(d.euroline_inputs).length
      ? { ...DEFAULT_EUROLINE_INPUTS, ...d.euroline_inputs }
      : DEFAULT_EUROLINE_INPUTS,
  }
}

// Opslag/levering/installatie/service-optie — dezelfde Euroline-rekentool
// als voorheen in QuoteEditor, nu per optie. cost_total is de som van de 4
// categorieën, altijd live herberekend uit euroline_inputs + de actuele
// tarieven (zelfde filosofie als in Offerte: nooit een bevroren bedrag).
export default function OpslagOptionEditor({
  rates,
  option,
  onChange,
}: {
  rates: EurolineRates
  option: ConfiguratorOption
  onChange: (patch: { data?: OpslagOptionData; cost_total?: number }) => void
}) {
  const inputs = readData(option.data).euroline_inputs
  const totals = computeEurolineTotals(inputs, rates)

  function updateInput(patch: Partial<EurolineInputs>) {
    const nextInputs = { ...inputs, ...patch }
    const nextTotals = computeEurolineTotals(nextInputs, rates)
    onChange({ data: { euroline_inputs: nextInputs }, cost_total: eurolineTotaalExclBtw(nextTotals) })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Montage — aantal meter (m1)</Label>
            <EurolineInfoButton category="installatie" />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              value={inputs.montage_meters}
              onChange={(e) => updateInput({ montage_meters: Number(e.target.value) })}
              className="h-8"
            />
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.installatie)}</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
            <Checkbox
              checked={inputs.installatie_buitengebied}
              onCheckedChange={(v) => updateInput({ installatie_buitengebied: v === true })}
            />
            Installatie in buitengebied (€{rates.installatie_buitengebied_per_m1.toFixed(2)}/m1 i.p.v. €{rates.installatie_per_m1.toFixed(2)}/m1)
          </label>
          <p className="text-[10px] text-[#9A948D]">
            €{inputs.installatie_buitengebied ? rates.installatie_buitengebied_per_m1.toFixed(2) : rates.installatie_per_m1.toFixed(2)} per m1
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Opslag — extra weken (na 3 weken inbegrepen)</Label>
            <EurolineInfoButton category="opslag" />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="1"
              value={inputs.opslag_extra_weken}
              onChange={(e) => updateInput({ opslag_extra_weken: Number(e.target.value) })}
              className="h-8"
            />
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.opslag)}</span>
          </div>
          <p className="text-[10px] text-[#9A948D]">Basis €{rates.opslag_base.toFixed(2)}, +€{rates.opslag_per_week_extra.toFixed(2)}/week</p>
        </div>

        <div className="space-y-1.5 col-span-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Levering</Label>
            <EurolineInfoButton category="levering" />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              <Checkbox
                checked={inputs.levering_groter}
                onCheckedChange={(v) => updateInput({ levering_groter: v === true })}
              />
              Grotere levering (&gt;5 pallets, +€{rates.levering_groter_toeslag.toFixed(2)})
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              <Checkbox
                checked={inputs.levering_niet_begane_grond}
                onCheckedChange={(v) => updateInput({ levering_niet_begane_grond: v === true })}
              />
              Niet begane grond (+€{rates.levering_niet_begane_grond.toFixed(2)})
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              <Checkbox
                checked={inputs.levering_verhuislift}
                onCheckedChange={(v) => updateInput({ levering_verhuislift: v === true })}
              />
              Verhuislift (+€{rates.levering_verhuislift.toFixed(2)})
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              <Checkbox
                checked={inputs.levering_buiten_werkgebied}
                onCheckedChange={(v) => updateInput({ levering_buiten_werkgebied: v === true })}
              />
              Buiten werkgebied Euroline (+€{rates.levering_buiten_werkgebied.toFixed(2)})
            </label>
            <div className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              Extra lostijd (halve uren)
              <Input
                type="number"
                step="1"
                value={inputs.levering_extra_lostijd_halfuren}
                onChange={(e) => updateInput({ levering_extra_lostijd_halfuren: Number(e.target.value) })}
                className="h-7 w-16"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              Werkblad-levering
              <select
                value={inputs.werkblad_levering}
                onChange={(e) => updateInput({ werkblad_levering: e.target.value as EurolineInputs['werkblad_levering'] })}
                className="h-7 text-xs bg-white border border-[#DDD8D2] rounded px-1.5 focus:outline-none focus:border-[#1C1B19]"
              >
                <option value="geen">Geen</option>
                <option value="multiplex">Multiplex/Greenpanel (+€{rates.werkblad_multiplex.toFixed(2)})</option>
                <option value="composiet">Composiet/keramiek/hardsteen (+€{rates.werkblad_composiet.toFixed(2)})</option>
              </select>
            </div>
            <span className="text-xs text-[#9A948D] whitespace-nowrap ml-auto">→ {formatPrice(totals.levering)}</span>
          </div>
          <p className="text-[10px] text-[#9A948D]">Basis €{rates.levering_base.toFixed(2)} (regulier, incl. 1 uur lostijd)</p>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Service — aantal uur nacalculatie</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.5"
              value={inputs.service_uren}
              onChange={(e) => updateInput({ service_uren: Number(e.target.value) })}
              className="h-8 max-w-[120px]"
            />
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.service)}</span>
          </div>
          <p className="text-[10px] text-[#9A948D]">€{rates.service_tarief_per_uur}/uur, minimum €{rates.service_minimum} zodra er service is</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#DDD8D2] pt-3">
        <a href="/instellingen/euroline" target="_blank" rel="noreferrer" className="text-xs text-[#C9A96E] hover:underline">
          Tarieven beheren →
        </a>
        <span className="text-sm font-medium text-[#1C1B19]">
          Totaal: {formatPrice(eurolineTotaalExclBtw(totals))}
        </span>
      </div>
    </div>
  )
}
