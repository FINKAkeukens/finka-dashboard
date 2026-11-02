'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { NumberInput } from '@/components/ui/number-input'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EurolineCustomRate, EurolineCustomRateCategory, EurolineRateKey, EurolineRates, EurolineRateSetting } from '@/lib/types'
import { EUROLINE_CUSTOM_RATE_CATEGORIES, EUROLINE_RATE_FIELDS } from '@/lib/euroline-calc'

type Tab = EurolineCustomRateCategory | 'brandstoftoeslag'

// Volgorde van de tabbladen links.
const TABS: EurolineCustomRateCategory[] = ['opslag', 'levering', 'installatie', 'inmeten', 'service', 'maatwerk']

const TAB_NOTES: Record<EurolineCustomRateCategory, string> = {
  opslag: 'Kostenrij Opslag in de offerte',
  levering: 'Kostenrij Levering in de offerte · de brandstoftoeslag telt hier ook bij',
  installatie: 'Kostenrij Installatie in de offerte',
  inmeten: 'Kostenrij Inmeten in de offerte',
  service: 'Kostenrij Service in de offerte',
  maatwerk: 'Telt bij toepassen op bij de kostenrij Maatwerk',
}

const selectClass = 'h-9 px-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

// Schakelaar "Per project aanpasbaar" — een echte checkbox (toegankelijk),
// als schuifje getekend.
function VariableSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#1C1B19]',
          checked ? 'bg-[#8A6A2E]' : 'bg-[#DDD8D2]'
        )}
      >
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span className={cn('text-xs whitespace-nowrap', checked ? 'text-[#6E5322] font-medium' : 'text-[#6B6560]')}>
        {checked ? 'Per project · voorstel' : 'Vast'}
      </span>
    </label>
  )
}

// Instellingen → Euroline-tarieven: links de onderdelen (= kostenrijen),
// rechts één tabel met de tarieven van dat onderdeel. Van elk tarief zijn
// naam en prijs te bewerken en is te kiezen of het vast is of per project
// aan te passen; eigen tarieven zijn ook te verwijderen. De rekenwijze van
// de vaste tarieven (per m1, per half uur, ...) blijft vast.
export default function EurolineRatesForm({ rates }: { rates: EurolineRates | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [values, setValues] = useState<Record<EurolineRateKey, number>>(() => {
    const initial = {} as Record<EurolineRateKey, number>
    for (const { key } of EUROLINE_RATE_FIELDS) initial[key] = rates ? Number(rates[key]) : 0
    return initial
  })
  const [settings, setSettings] = useState<Partial<Record<EurolineRateKey, EurolineRateSetting>>>(rates?.rate_settings ?? {})
  const [percentage, setPercentage] = useState(rates ? Number(rates.brandstoftoeslag_percentage) : 0)
  const [overInstallatie, setOverInstallatie] = useState(rates?.brandstoftoeslag_over_installatie ?? false)
  const [customRates, setCustomRates] = useState<EurolineCustomRate[]>(rates?.custom_rates ?? [])
  const [tab, setTab] = useState<Tab>('opslag')
  const [newRate, setNewRate] = useState<{ name: string; amount: number; category: EurolineCustomRateCategory; variable: boolean }>({
    name: '', amount: 0, category: 'opslag', variable: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!rates) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-6">
        Nog geen tarievenrij gevonden — draai de laatste migratie (finka_euroline_rates) in Supabase en herlaad deze pagina.
      </p>
    )
  }

  function updateSetting(key: EurolineRateKey, patch: EurolineRateSetting) {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function updateCustomRate(id: string, patch: Partial<EurolineCustomRate>) {
    setCustomRates((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function selectTab(next: Tab) {
    setTab(next)
    // Nieuw tarief komt standaard in het onderdeel waar je bent.
    if (next !== 'brandstoftoeslag') setNewRate((prev) => ({ ...prev, category: next }))
  }

  function addCustomRate() {
    if (!newRate.name.trim()) return
    setCustomRates((prev) => [...prev, { id: crypto.randomUUID(), ...newRate, name: newRate.name.trim() }])
    setNewRate((prev) => ({ ...prev, name: '', amount: 0, variable: false }))
    setTab(newRate.category)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    // Lege of ongewijzigde namen niet bewaren: dan geldt de standaardnaam.
    const cleanSettings: Partial<Record<EurolineRateKey, EurolineRateSetting>> = {}
    for (const { key, label } of EUROLINE_RATE_FIELDS) {
      const s = settings[key]
      const name = s?.name?.trim()
      const entry: EurolineRateSetting = {}
      if (name && name !== label) entry.name = name
      if (s?.variable) entry.variable = true
      if (Object.keys(entry).length) cleanSettings[key] = entry
    }
    const { error } = await supabase
      .from('finka_euroline_rates')
      .update({
        ...values,
        brandstoftoeslag_percentage: percentage,
        brandstoftoeslag_over_installatie: overInstallatie,
        custom_rates: customRates.map((r) => ({ ...r, name: r.name.trim() })),
        rate_settings: cleanSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rates!.id)

    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    }
    setSaving(false)
  }

  const countFor = (c: EurolineCustomRateCategory) =>
    EUROLINE_RATE_FIELDS.filter((f) => f.category === c).length + customRates.filter((r) => r.category === c).length

  const fields = tab === 'brandstoftoeslag' ? [] : EUROLINE_RATE_FIELDS.filter((f) => f.category === tab)
  const ownRates = tab === 'brandstoftoeslag' ? [] : customRates.filter((r) => r.category === tab)

  const navButton = (value: Tab, label: string, badge: string) => (
    <button
      key={value}
      type="button"
      onClick={() => selectTab(value)}
      aria-current={tab === value ? 'page' : undefined}
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm text-left',
        tab === value ? 'bg-[#1C1B19] text-white font-medium' : 'text-[#1C1B19] hover:bg-[#F7F5F2]'
      )}
    >
      {label}
      <span className={cn('text-xs', tab === value ? 'text-[#DDD8D2]' : 'text-[#6B6560]')}>{badge}</span>
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-5 items-start">
        <nav aria-label="Onderdelen" className="w-full sm:w-52 shrink-0 bg-white border border-[#DDD8D2] rounded-xl p-2 flex flex-col gap-0.5">
          {TABS.map((c) => navButton(c, EUROLINE_CUSTOM_RATE_CATEGORIES[c], String(countFor(c))))}
          <div className="h-px bg-[#EFEBE6] my-1.5 mx-1" />
          {navButton('brandstoftoeslag', 'Brandstoftoeslag', `${percentage}%`)}
        </nav>

        <section className="flex-1 min-w-0 basis-[560px] min-h-[560px] flex flex-col bg-white border border-[#DDD8D2] rounded-xl overflow-hidden">
          {tab === 'brandstoftoeslag' ? (
            <div className="p-5 space-y-3">
              <h2 className="text-base font-semibold text-[#1C1B19]">Brandstoftoeslag</h2>
              <p className="text-xs text-[#6B6560]">
                Tijdelijke toeslag van Euroline sinds 16-03-2026, gekoppeld aan de dieselprijs (TLN brandstofmonitor). Euroline berekent hem achteraf,
                dus vul hier het percentage van de laatste factuur in (staat op de regel &quot;Brandstoftoeslag&quot;). 0 = geen toeslag.
              </p>
              <div className="space-y-1.5 max-w-[160px]">
                <Label className="text-xs">Percentage (%)</Label>
                <NumberInput value={percentage} onChange={setPercentage} className="h-9" />
              </div>
              <p className="text-xs text-[#6B6560]">
                Gerekend over: basislevering + basisopslag, de leveringstoeslagen (groter, niet begane grond, lift, buiten werkgebied) en de werkblad-levering.
                Niet over extra lostijd, extra opslagweken, extra verpakking en eigen tarieven. Het bedrag telt mee bij Levering.
              </p>
              <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
                <Checkbox checked={overInstallatie} onCheckedChange={(v) => setOverInstallatie(v === true)} />
                Ook over montage/installatie rekenen
              </label>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4 border-b border-[#DDD8D2]">
                <h2 className="text-base font-semibold text-[#1C1B19]">{EUROLINE_CUSTOM_RATE_CATEGORIES[tab]}</h2>
                <span className="text-xs text-[#6B6560]">{TAB_NOTES[tab]}</span>
              </div>
              <div className="overflow-x-auto">
                {/* Vaste kolombreedtes (table-fixed + colgroup): elk tabblad heeft
                   dezelfde opzet, dus niets verspringt bij wisselen. */}
                <table className="w-full table-fixed text-sm min-w-[820px]">
                  <colgroup>
                    <col />
                    <col className="w-[150px]" />
                    <col className="w-[136px]" />
                    <col className="w-[200px]" />
                    <col className="w-[56px]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#FAF9F7] text-[11px] uppercase tracking-wide text-[#6B6560]">
                      <th className="text-left font-medium px-5 py-2.5">Naam</th>
                      <th className="text-left font-medium px-2 py-2.5">Eenheid</th>
                      <th className="text-right font-medium px-2 py-2.5">Prijs</th>
                      <th className="text-left font-medium px-2 py-2.5">Per project aanpasbaar</th>
                      <th className="px-5 py-2.5"><span className="sr-only">Acties</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map(({ key, label, unit }) => {
                      const variable = !!settings[key]?.variable
                      return (
                        <tr key={key} className={cn('border-t border-[#EFEBE6]', variable && 'bg-[#FBF7EF]')}>
                          <td className="pl-5 pr-2 py-2">
                            <input
                              value={settings[key]?.name ?? label}
                              onChange={(e) => updateSetting(key, { name: e.target.value })}
                              aria-label={`Naam van ${label}`}
                              className="w-full h-8 px-1 bg-transparent border-b border-[#DDD8D2] focus:border-[#1C1B19] focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-2 text-xs text-[#6B6560] truncate" title={unit}>{unit}</td>
                          <td className="px-2 py-2">
                            <NumberInput
                              value={values[key]}
                              onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
                              className={cn('h-8 w-28 ml-auto text-right', variable && 'border-[#C9A96E]')}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <VariableSwitch checked={variable} onChange={(v) => updateSetting(key, { variable: v })} label={`${label} per project aanpasbaar`} />
                          </td>
                          <td className="px-5 py-2" />
                        </tr>
                      )
                    })}
                    {ownRates.map((r) => (
                      <tr key={r.id} className={cn('border-t border-[#EFEBE6]', r.variable && 'bg-[#FBF7EF]')}>
                        <td className="pl-5 pr-2 py-2">
                          <span className="flex items-center gap-1.5">
                            <input
                              value={r.name}
                              onChange={(e) => updateCustomRate(r.id, { name: e.target.value })}
                              placeholder="Naam van het tarief"
                              aria-label="Naam van het eigen tarief"
                              className="flex-1 min-w-0 h-8 px-1 bg-transparent border-b border-[#DDD8D2] focus:border-[#1C1B19] focus:outline-none"
                            />
                            <span className="shrink-0 px-1.5 py-px rounded border border-[#DDD8D2] text-[11px] text-[#6B6560]">eigen</span>
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {/* Eigen tarief naar een ander onderdeel verplaatsen. */}
                          <select
                            value={r.category}
                            onChange={(e) => updateCustomRate(r.id, { category: e.target.value as EurolineCustomRateCategory })}
                            aria-label="Onderdeel"
                            className="w-full h-8 px-1.5 text-xs bg-white border border-[#DDD8D2] rounded focus:outline-none focus:border-[#1C1B19]"
                          >
                            {TABS.map((c) => <option key={c} value={c}>{EUROLINE_CUSTOM_RATE_CATEGORIES[c]}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <NumberInput
                            value={Number(r.amount) || 0}
                            onChange={(amount) => updateCustomRate(r.id, { amount })}
                            className={cn('h-8 w-28 ml-auto text-right', r.variable && 'border-[#C9A96E]')}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <VariableSwitch checked={!!r.variable} onChange={(v) => updateCustomRate(r.id, { variable: v })} label={`${r.name || 'Eigen tarief'} per project aanpasbaar`} />
                        </td>
                        <td className="px-5 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Tarief "${r.name || 'naamloos'}" verwijderen? In projecten waar het aangevinkt staat telt het dan niet meer mee.`)) {
                                setCustomRates((prev) => prev.filter((x) => x.id !== r.id))
                              }
                            }}
                            aria-label={`${r.name || 'Tarief'} verwijderen`}
                            className="p-1 text-[#9A948D] hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {fields.length === 0 && ownRates.length === 0 && (
                      <tr className="border-t border-[#EFEBE6]">
                        <td colSpan={5} className="px-5 py-6 text-sm text-[#6B6560]">Nog geen tarieven. Voeg hieronder een eigen tarief toe.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="mt-auto px-5 py-4 border-t border-[#DDD8D2] bg-[#FAF9F7] grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_7rem_9rem_11rem_auto] gap-2.5 items-end">
            <div className="space-y-1">
              <Label htmlFor="new-rate-name" className="text-xs text-[#6B6560]">Nieuw eigen tarief</Label>
              <Input
                id="new-rate-name"
                value={newRate.name}
                onChange={(e) => setNewRate((prev) => ({ ...prev, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRate() } }}
                placeholder="Naam"
                className="h-9 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[#6B6560]">Prijs</Label>
              <NumberInput value={newRate.amount} onChange={(amount) => setNewRate((prev) => ({ ...prev, amount }))} className="h-9 bg-white text-right" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-rate-category" className="text-xs text-[#6B6560]">Onderdeel</Label>
              <select
                id="new-rate-category"
                value={newRate.category}
                onChange={(e) => setNewRate((prev) => ({ ...prev, category: e.target.value as EurolineCustomRateCategory }))}
                className={cn(selectClass, 'w-full')}
              >
                {TABS.map((c) => <option key={c} value={c}>{EUROLINE_CUSTOM_RATE_CATEGORIES[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-rate-kind" className="text-xs text-[#6B6560]">Soort</Label>
              <select
                id="new-rate-kind"
                value={newRate.variable ? 'variabel' : 'vast'}
                onChange={(e) => setNewRate((prev) => ({ ...prev, variable: e.target.value === 'variabel' }))}
                className={cn(selectClass, 'w-full')}
              >
                <option value="vast">Vast tarief</option>
                <option value="variabel">Per project aanpasbaar</option>
              </select>
            </div>
            <Button type="button" onClick={addCustomRate} disabled={!newRate.name.trim()} className="h-9">Toevoegen</Button>
          </div>
        </section>
      </div>

      <p className="text-xs text-[#6B6560]">
        Vast = dezelfde prijs in elk project. Per project aanpasbaar = de prijs hier is het voorstel; in de rekentool van een project staat er een bedragveld bij.
        Een eigen tarief vink je per project aan.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
