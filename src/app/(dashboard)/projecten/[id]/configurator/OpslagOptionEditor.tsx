'use client'

import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { NumberInput } from '@/components/ui/number-input'
import EurolineInfoButton from '@/components/EurolineInfoButton'
import { formatPrice } from '@/lib/appliance-utils'
import {
  computeEurolineTotals,
  DEFAULT_EUROLINE_INPUTS,
  effectiveEurolineRates,
  EUROLINE_CUSTOM_RATE_CATEGORIES,
  EUROLINE_OWN_COST_KEYS,
  eurolineRateLabel,
  eurolineTotaalExclBtw,
  isEurolineRateVariable,
} from '@/lib/euroline-calc'
import { ConfiguratorOption, EurolineCustomRate, EurolineCustomRateCategory, EurolineInputs, EurolineRateKey, EurolineRates, OpslagOptionData } from '@/lib/types'

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
// Namen komen uit de instellingen (eurolineRateLabel); een tarief dat daar
// "per project aanpasbaar" staat krijgt hier een bedragveld, bewaard in
// euroline_inputs.rate_overrides.
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
  // Tarieven zoals ze in dit project gelden (met per project aangepaste bedragen).
  const eff = effectiveEurolineRates(rates, inputs)
  const selectedCustom = new Set(inputs.custom_rate_ids ?? [])
  const label = (key: EurolineRateKey) => eurolineRateLabel(rates, key)
  const eur = (n: number) => `€${(Number(n) || 0).toFixed(2)}`

  function updateInput(patch: Partial<EurolineInputs>) {
    const nextInputs = { ...inputs, ...patch }
    const nextTotals = computeEurolineTotals(nextInputs, rates)
    onChange({ data: { euroline_inputs: nextInputs }, cost_total: eurolineTotaalExclBtw(nextTotals) })
  }

  function setOverride(id: string, value: number) {
    updateInput({ rate_overrides: { ...(inputs.rate_overrides ?? {}), [id]: value } })
  }

  // Bedrag van een vast tarief: bij "per project aanpasbaar" een invulveld
  // (voorstel uit de instellingen), anders de vaste prijs als tekst.
  function rateAmount(key: EurolineRateKey, prefix = '+') {
    if (!isEurolineRateVariable(rates, key)) return <span>({prefix}{eur(eff[key])})</span>
    return (
      <NumberInput
        value={eff[key]}
        onChange={(v) => setOverride(key, v)}
        aria-label={`${label(key)} — bedrag voor dit project`}
        className="h-7 w-24 text-xs border-[#C9A96E]"
      />
    )
  }

  // Variabele basis-/eenheidstarieven (geen vinkje): eigen regel met invulveld.
  function variableRateRows(keys: EurolineRateKey[]) {
    return keys
      .filter((key) => isEurolineRateVariable(rates, key))
      .map((key) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
          {label(key)}
          {rateAmount(key)}
        </div>
      ))
  }

  function toggle(key: EurolineRateKey, checked: boolean, onToggle: (v: boolean) => void) {
    return (
      <div key={key} className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
        <label className="flex items-center gap-1.5">
          <Checkbox checked={checked} onCheckedChange={(v) => onToggle(v === true)} />
          {label(key)}
        </label>
        {rateAmount(key)}
      </div>
    )
  }

  function customRateToggle(r: EurolineCustomRate, showCategory = false) {
    const amount = eff.custom_rates?.find((x) => x.id === r.id)?.amount ?? r.amount
    return (
      <div key={r.id} className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={selectedCustom.has(r.id)}
            onCheckedChange={(v) => {
              const ids = (inputs.custom_rate_ids ?? []).filter((id) => id !== r.id)
              updateInput({ custom_rate_ids: v === true ? [...ids, r.id] : ids })
            }}
          />
          {r.name || 'Naamloos tarief'}
        </label>
        {r.variable ? (
          <NumberInput
            value={Number(amount) || 0}
            onChange={(v) => setOverride(r.id, v)}
            aria-label={`${r.name || 'Eigen tarief'} — bedrag voor dit project`}
            className="h-7 w-24 text-xs border-[#C9A96E]"
          />
        ) : (
          <span>(+{eur(amount)})</span>
        )}
        {showCategory && <span className="text-[#9A948D]">· {EUROLINE_CUSTOM_RATE_CATEGORIES[r.category]}</span>}
      </div>
    )
  }

  // Eigen tarieven als vinkjes in het onderdeel van hun kostenrij.
  function customRateCheckboxes(category: EurolineCustomRateCategory) {
    return (rates.custom_rates ?? []).filter((r) => r.category === category).map((r) => customRateToggle(r))
  }

  // Eigen tarieven in kostenrijen die deze optie zelf niet vult (Maatwerk) —
  // eigen blok onderaan.
  const otherCustomRates = (rates.custom_rates ?? []).filter((r) => !EUROLINE_OWN_COST_KEYS.includes(r.category))
  const otherCustomTotal = Object.values(totals.extra).reduce((sum, n) => sum + (n ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Montage — aantal meter (m1)</Label>
            <EurolineInfoButton category="installatie" />
          </div>
          <div className="flex items-center gap-2">
            <NumberInput
              value={inputs.montage_meters}
              onChange={(montage_meters) => updateInput({ montage_meters })}
              className="h-8"
            />
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.installatie)}</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
            <Checkbox
              checked={inputs.installatie_buitengebied}
              onCheckedChange={(v) => updateInput({ installatie_buitengebied: v === true })}
            />
            {label('installatie_buitengebied_per_m1')} ({eur(eff.installatie_buitengebied_per_m1)}/m1 i.p.v. {eur(eff.installatie_per_m1)}/m1)
          </label>
          {variableRateRows(['installatie_per_m1', 'installatie_buitengebied_per_m1'])}
          {customRateCheckboxes('installatie')}
          <p className="text-[10px] text-[#9A948D]">
            {eur(inputs.installatie_buitengebied ? eff.installatie_buitengebied_per_m1 : eff.installatie_per_m1)} per m1
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Opslag — extra weken (na 3 weken inbegrepen)</Label>
            <EurolineInfoButton category="opslag" />
          </div>
          <div className="flex items-center gap-2">
            <NumberInput
              value={inputs.opslag_extra_weken}
              onChange={(opslag_extra_weken) => updateInput({ opslag_extra_weken })}
              className="h-8"
            />
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.opslag)}</span>
          </div>
          {variableRateRows(['opslag_base', 'opslag_per_week_extra'])}
          {customRateCheckboxes('opslag')}
          <p className="text-[10px] text-[#9A948D]">{label('opslag_base')} {eur(eff.opslag_base)}, +{eur(eff.opslag_per_week_extra)}/week</p>
        </div>

        <div className="space-y-1.5 col-span-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">Levering</Label>
            <EurolineInfoButton category="levering" />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {toggle('levering_groter_toeslag', inputs.levering_groter, (v) => updateInput({ levering_groter: v }))}
            {toggle('levering_niet_begane_grond', inputs.levering_niet_begane_grond, (v) => updateInput({ levering_niet_begane_grond: v }))}
            {toggle('levering_verhuislift', inputs.levering_verhuislift, (v) => updateInput({ levering_verhuislift: v }))}
            {toggle('levering_buiten_werkgebied', inputs.levering_buiten_werkgebied, (v) => updateInput({ levering_buiten_werkgebied: v }))}
            <div className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              {label('levering_extra_lostijd_per_halfuur')} (halve uren)
              <NumberInput
                value={inputs.levering_extra_lostijd_halfuren}
                onChange={(levering_extra_lostijd_halfuren) => updateInput({ levering_extra_lostijd_halfuren })}
                className="h-7 w-16"
              />
              {isEurolineRateVariable(rates, 'levering_extra_lostijd_per_halfuur') && <>× {rateAmount('levering_extra_lostijd_per_halfuur', '')}</>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              Werkblad-levering
              <select
                value={inputs.werkblad_levering}
                onChange={(e) => updateInput({ werkblad_levering: e.target.value as EurolineInputs['werkblad_levering'] })}
                className="h-7 text-xs bg-white border border-[#DDD8D2] rounded px-1.5 focus:outline-none focus:border-[#1C1B19]"
              >
                <option value="geen">Geen</option>
                <option value="multiplex">{label('werkblad_multiplex')} (+{eur(eff.werkblad_multiplex)})</option>
                <option value="composiet">{label('werkblad_composiet')} (+{eur(eff.werkblad_composiet)})</option>
              </select>
            </div>
            {toggle('werkblad_extra_verpakking', inputs.werkblad_extra_verpakt, (v) => updateInput({ werkblad_extra_verpakt: v }))}
            {customRateCheckboxes('levering')}
            {/* Zonder brandstoftoeslag — die staat onderaan als los blok, ook
               al telt hij in de kostprijs-opbouw mee bij Levering. */}
            <span className="text-xs text-[#9A948D] whitespace-nowrap ml-auto">→ {formatPrice(totals.levering - totals.brandstoftoeslag)}</span>
          </div>
          {variableRateRows(['levering_base', 'werkblad_multiplex', 'werkblad_composiet'])}
          <p className="text-[10px] text-[#9A948D]">{label('levering_base')}: {eur(eff.levering_base)}</p>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Service — aantal uur nacalculatie</Label>
          <div className="flex items-center gap-2">
            <NumberInput
              value={inputs.service_uren}
              onChange={(service_uren) => updateInput({ service_uren })}
              className="h-8 max-w-[120px]"
            />
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.service)}</span>
          </div>
          {variableRateRows(['service_tarief_per_uur', 'service_minimum'])}
          {customRateCheckboxes('service')}
          <p className="text-[10px] text-[#9A948D]">{eur(eff.service_tarief_per_uur)}/uur, minimum {eur(eff.service_minimum)} zodra er service is</p>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Inmeten</Label>
          <div className="flex items-center gap-2">
            {toggle('inmeten_tarief', inputs.inmeten, (v) => updateInput({ inmeten: v }))}
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.inmeten)}</span>
          </div>
          {customRateCheckboxes('inmeten')}
          <p className="text-[10px] text-[#9A948D]">Vult de kostenrij &quot;Inmeten&quot; in de offerte — uitgevinkt blijft die op €0.</p>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Brandstoftoeslag Euroline</Label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
              <Checkbox
                checked={inputs.brandstoftoeslag}
                onCheckedChange={(v) => updateInput({ brandstoftoeslag: v === true })}
              />
              Brandstoftoeslag meerekenen ({rates.brandstoftoeslag_percentage}%)
            </label>
            <span className="text-xs text-[#9A948D] whitespace-nowrap">→ {formatPrice(totals.brandstoftoeslag)}</span>
          </div>
          {inputs.brandstoftoeslag && (
            <p className="text-[10px] text-[#9A948D]">
              {rates.brandstoftoeslag_percentage}% over {formatPrice(totals.brandstoftoeslag_grondslag)}: levering
              {' '}{formatPrice(totals.brandstoftoeslag_grondslag - eff.opslag_base - (rates.brandstoftoeslag_over_installatie ? totals.montage : 0))}
              {' '}+ basisopslag {formatPrice(eff.opslag_base)}
              {rates.brandstoftoeslag_over_installatie && ` + montage ${formatPrice(totals.montage)}`}
              {' '}(zonder extra lostijd, extra opslag en extra verpakking). Telt in de offerte mee bij de kostenrij Levering.
            </p>
          )}
        </div>
      </div>

      {otherCustomRates.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Eigen tarieven in andere kostenrijen</Label>
          <div className="flex items-center gap-4 flex-wrap">
            {otherCustomRates.map((r) => customRateToggle(r, true))}
            <span className="text-xs text-[#9A948D] whitespace-nowrap ml-auto">→ {formatPrice(otherCustomTotal)}</span>
          </div>
          <p className="text-[10px] text-[#9A948D]">Telt bij toepassen op de offerte op bij de genoemde kostenrij.</p>
        </div>
      )}

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
