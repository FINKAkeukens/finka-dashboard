'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberInput } from '@/components/ui/number-input'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WerkbladCutout,
  WerkbladExtra,
  WerkbladMaterial,
  WerkbladRates,
  WerkbladServiceKey,
  WerkbladServiceSetting,
  WerkbladThickness,
} from '@/lib/types'
import { uid, WERKBLAD_SERVICE_FIELDS, werkbladCutouts } from '@/lib/werkblad-calc'

type Tab = 'materialen' | 'uitsparingen' | 'diktes' | 'diensten' | 'extras'

const TABS: { key: Tab; label: string; note: string; second: string; price: string }[] = [
  { key: 'materialen', label: 'Materialen', note: 'Prijs per m², ex btw', second: 'Leverancier', price: 'Prijs per m²' },
  { key: 'uitsparingen', label: 'Uitsparingen', note: 'Vaste toeslag per stuk, per werkbladdeel aan te vinken', second: 'Eenheid', price: 'Prijs' },
  { key: 'diktes', label: 'Diktetoeslag', note: 'Per m², bovenop de materiaalprijs', second: 'Eenheid', price: 'Toeslag per m²' },
  { key: 'diensten', label: 'Koppeling & diensten', note: 'Tellen in elke berekening mee (hoekverbinding per extra deel)', second: 'Eenheid', price: 'Prijs' },
  { key: 'extras', label: 'Extra onderdelen', note: 'Per werkblad-optie aan te vinken in de Configurator', second: 'Eenheid', price: 'Prijs' },
]

const selectClass = 'h-9 px-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'
const nameInputClass = 'w-full h-8 px-1 bg-transparent border-b border-[#DDD8D2] focus:border-[#1C1B19] focus:outline-none'

// Oudere materialen hebben de leverancier in de naam ("Keramiek – CEBIN"):
// eenmalig splitsen bij het laden, bewaard bij de volgende keer Opslaan.
function splitSupplier(m: WerkbladMaterial): WerkbladMaterial {
  if (m.supplier !== undefined) return m
  const i = m.name.lastIndexOf(' – ')
  if (i < 0) return { ...m, supplier: '' }
  return { ...m, name: m.name.slice(0, i).trim(), supplier: m.name.slice(i + 3).trim() }
}

// Zelfde schakelaar als bij de Euroline-tarieven.
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

function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <button
      type="button"
      onClick={() => { if (confirm(`${label} verwijderen?`)) onConfirm() }}
      aria-label={`${label} verwijderen`}
      className="p-1 text-[#9A948D] hover:text-red-600"
    >
      <Trash2 size={14} />
    </button>
  )
}

// Instellingen → Werkbladprijzen, in dezelfde opzet als de Euroline-tarieven:
// links de onderdelen, rechts één tabel met vaste kolombreedtes. Namen en
// prijzen zijn overal te bewerken, elk tarief is vast of per project aan te
// passen (bedragveld in de werkblad-rekentool).
export default function WerkbladRatesForm({ rates }: { rates: WerkbladRates | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [materials, setMaterials] = useState<WerkbladMaterial[]>(() => (rates?.materials ?? []).map(splitSupplier))
  const [cutouts, setCutouts] = useState<WerkbladCutout[]>(() => (rates ? werkbladCutouts(rates) : []))
  const [thicknesses, setThicknesses] = useState<WerkbladThickness[]>(rates?.thicknesses ?? [])
  const [services, setServices] = useState<Record<WerkbladServiceKey, number>>({
    hoekverbinding: rates?.hoekverbinding ?? 0,
    inmeten: rates?.inmeten ?? 0,
    montage: rates?.montage ?? 0,
    transport: rates?.transport ?? 0,
  })
  const [serviceSettings, setServiceSettings] = useState<Partial<Record<WerkbladServiceKey, WerkbladServiceSetting>>>(rates?.service_settings ?? {})
  const [extras, setExtras] = useState<WerkbladExtra[]>(rates?.extras ?? [])
  const [tab, setTab] = useState<Tab>('materialen')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [newRow, setNewRow] = useState({ name: '', second: '', amount: 0, variable: false })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!rates) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-6">
        Nog geen tarievenrij gevonden — draai de laatste migratie (finka_werkblad_rates) in Supabase en herlaad deze pagina.
      </p>
    )
  }

  const suppliers = Array.from(new Set(materials.map((m) => m.supplier?.trim()).filter((s): s is string => !!s))).sort((a, b) => a.localeCompare(b, 'nl'))
  const tabInfo = TABS.find((t) => t.key === tab)!
  const counts: Record<Tab, number> = {
    materialen: materials.length,
    uitsparingen: cutouts.length,
    diktes: thicknesses.length,
    diensten: WERKBLAD_SERVICE_FIELDS.length,
    extras: extras.length,
  }

  function selectTab(next: Tab) {
    setTab(next)
    setNewRow({ name: '', second: '', amount: 0, variable: false })
  }

  function addRow() {
    const name = newRow.name.trim()
    if (tab === 'materialen') {
      if (!name) return
      setMaterials((prev) => [...prev, { id: uid(), name, supplier: newRow.second.trim(), price_per_m2: newRow.amount, variable: newRow.variable }])
    } else if (tab === 'uitsparingen') {
      if (!name) return
      setCutouts((prev) => [...prev, { id: uid(), name, amount: newRow.amount, variable: newRow.variable }])
    } else if (tab === 'diktes') {
      const mm = Number(newRow.name.replace(',', '.'))
      if (!mm || thicknesses.some((t) => Number(t.mm) === mm)) return
      setThicknesses((prev) => [...prev, { mm, surcharge: newRow.amount, variable: newRow.variable }].sort((a, b) => a.mm - b.mm))
    } else if (tab === 'extras') {
      if (!name) return
      setExtras((prev) => [...prev, { id: uid(), name, amount: newRow.amount, variable: newRow.variable }])
    }
    setNewRow({ name: '', second: '', amount: 0, variable: false })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const cleanServiceSettings: Partial<Record<WerkbladServiceKey, WerkbladServiceSetting>> = {}
    for (const { key, label } of WERKBLAD_SERVICE_FIELDS) {
      const s = serviceSettings[key]
      const entry: WerkbladServiceSetting = {}
      const name = s?.name?.trim()
      if (name && name !== label) entry.name = name
      if (s?.variable) entry.variable = true
      if (Object.keys(entry).length) cleanServiceSettings[key] = entry
    }
    const cleanCutouts = cutouts.map((c) => ({ ...c, name: c.name.trim() }))
    const amountOf = (id: string) => cleanCutouts.find((c) => c.id === id)?.amount ?? 0
    const { error } = await supabase
      .from('finka_werkblad_rates')
      .update({
        materials: materials.map((m) => ({ ...m, name: m.name.trim(), supplier: m.supplier?.trim() ?? '' })),
        cutout_list: cleanCutouts,
        // Oude vaste trio bijgewerkt houden voor code die cutout_list nog niet kent.
        cutouts: { kookplaat: amountOf('kookplaat'), spoelbak: amountOf('spoelbak'), kraan: amountOf('kraan') },
        thicknesses,
        ...services,
        service_settings: cleanServiceSettings,
        extras: extras.map((e) => ({ ...e, name: e.name.trim() })),
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

  const priceInput = (value: number, onChange: (v: number) => void, variable: boolean | undefined) => (
    <NumberInput value={Number(value) || 0} onChange={onChange} className={cn('h-8 w-28 ml-auto text-right', variable && 'border-[#C9A96E]')} />
  )

  const visibleMaterials = supplierFilter ? materials.filter((m) => (m.supplier ?? '') === supplierFilter) : materials

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-5 items-start">
        <nav aria-label="Onderdelen" className="w-full sm:w-56 shrink-0 bg-white border border-[#DDD8D2] rounded-xl p-2 flex flex-col gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm text-left',
                tab === t.key ? 'bg-[#1C1B19] text-white font-medium' : 'text-[#1C1B19] hover:bg-[#F7F5F2]'
              )}
            >
              {t.label}
              <span className={cn('text-xs', tab === t.key ? 'text-[#DDD8D2]' : 'text-[#6B6560]')}>{counts[t.key]}</span>
            </button>
          ))}
        </nav>

        <section className="flex-1 min-w-0 basis-[560px] min-h-[560px] flex flex-col bg-white border border-[#DDD8D2] rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[#DDD8D2]">
            <div>
              <h2 className="text-base font-semibold text-[#1C1B19]">{tabInfo.label}</h2>
              <p className="text-xs text-[#6B6560] mt-0.5">{tabInfo.note}</p>
            </div>
            {tab === 'materialen' && suppliers.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter op leverancier">
                {['', ...suppliers].map((s) => (
                  <button
                    key={s || 'alle'}
                    type="button"
                    onClick={() => setSupplierFilter(s)}
                    aria-pressed={supplierFilter === s}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border',
                      supplierFilter === s ? 'bg-[#1C1B19] text-white border-[#1C1B19]' : 'border-[#DDD8D2] text-[#1C1B19] hover:border-[#1C1B19]'
                    )}
                  >
                    {s || 'Alle'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            {/* Vaste kolombreedtes: elk tabblad dezelfde opzet, niets verspringt. */}
            <table className="w-full table-fixed text-sm min-w-[820px]">
              <colgroup>
                <col />
                <col className="w-[160px]" />
                <col className="w-[136px]" />
                <col className="w-[200px]" />
                <col className="w-[56px]" />
              </colgroup>
              <thead>
                <tr className="bg-[#FAF9F7] text-[11px] uppercase tracking-wide text-[#6B6560]">
                  <th className="text-left font-medium px-5 py-2.5">{tab === 'diktes' ? 'Dikte' : 'Naam'}</th>
                  <th className="text-left font-medium px-2 py-2.5">{tabInfo.second}</th>
                  <th className="text-right font-medium px-2 py-2.5">{tabInfo.price}</th>
                  <th className="text-left font-medium px-2 py-2.5">Per project aanpasbaar</th>
                  <th className="px-5 py-2.5"><span className="sr-only">Acties</span></th>
                </tr>
              </thead>
              <tbody>
                {tab === 'materialen' && visibleMaterials.map((m) => (
                  <tr key={m.id} className={cn('border-t border-[#EFEBE6]', m.variable && 'bg-[#FBF7EF]')}>
                    <td className="pl-5 pr-2 py-2">
                      <input value={m.name} aria-label="Naam" className={nameInputClass}
                        onChange={(e) => setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} />
                    </td>
                    <td className="px-2 py-2">
                      <input value={m.supplier ?? ''} aria-label="Leverancier" list="werkblad-suppliers"
                        className="w-full h-8 px-2 text-xs bg-white border border-[#DDD8D2] rounded focus:outline-none focus:border-[#1C1B19]"
                        onChange={(e) => setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, supplier: e.target.value } : x)))} />
                    </td>
                    <td className="px-2 py-2">{priceInput(m.price_per_m2, (v) => setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, price_per_m2: v } : x))), m.variable)}</td>
                    <td className="px-2 py-2">
                      <VariableSwitch checked={!!m.variable} label={`${m.name} per project aanpasbaar`}
                        onChange={(v) => setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, variable: v } : x)))} />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <DeleteButton label={`Materiaal "${m.name || 'naamloos'}"`} onConfirm={() => setMaterials((prev) => prev.filter((x) => x.id !== m.id))} />
                    </td>
                  </tr>
                ))}

                {tab === 'uitsparingen' && cutouts.map((c) => (
                  <tr key={c.id} className={cn('border-t border-[#EFEBE6]', c.variable && 'bg-[#FBF7EF]')}>
                    <td className="pl-5 pr-2 py-2">
                      <input value={c.name} aria-label="Naam" className={nameInputClass}
                        onChange={(e) => setCutouts((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
                    </td>
                    <td className="px-2 py-2 text-xs text-[#6B6560]">per stuk</td>
                    <td className="px-2 py-2">{priceInput(c.amount, (v) => setCutouts((prev) => prev.map((x) => (x.id === c.id ? { ...x, amount: v } : x))), c.variable)}</td>
                    <td className="px-2 py-2">
                      <VariableSwitch checked={!!c.variable} label={`${c.name} per project aanpasbaar`}
                        onChange={(v) => setCutouts((prev) => prev.map((x) => (x.id === c.id ? { ...x, variable: v } : x)))} />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <DeleteButton label={`Uitsparing "${c.name || 'naamloos'}"`} onConfirm={() => setCutouts((prev) => prev.filter((x) => x.id !== c.id))} />
                    </td>
                  </tr>
                ))}

                {tab === 'diktes' && thicknesses.map((t) => (
                  <tr key={t.mm} className={cn('border-t border-[#EFEBE6]', t.variable && 'bg-[#FBF7EF]')}>
                    <td className="pl-5 pr-2 py-2 text-[#1C1B19]">{t.mm} mm</td>
                    <td className="px-2 py-2 text-xs text-[#6B6560]">per m²</td>
                    <td className="px-2 py-2">{priceInput(t.surcharge, (v) => setThicknesses((prev) => prev.map((x) => (x.mm === t.mm ? { ...x, surcharge: v } : x))), t.variable)}</td>
                    <td className="px-2 py-2">
                      <VariableSwitch checked={!!t.variable} label={`${t.mm} mm per project aanpasbaar`}
                        onChange={(v) => setThicknesses((prev) => prev.map((x) => (x.mm === t.mm ? { ...x, variable: v } : x)))} />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <DeleteButton label={`Dikte ${t.mm} mm`} onConfirm={() => setThicknesses((prev) => prev.filter((x) => x.mm !== t.mm))} />
                    </td>
                  </tr>
                ))}

                {tab === 'diensten' && WERKBLAD_SERVICE_FIELDS.map(({ key, label, unit }) => {
                  const variable = !!serviceSettings[key]?.variable
                  return (
                    <tr key={key} className={cn('border-t border-[#EFEBE6]', variable && 'bg-[#FBF7EF]')}>
                      <td className="pl-5 pr-2 py-2">
                        <input value={serviceSettings[key]?.name ?? label} aria-label={`Naam van ${label}`} className={nameInputClass}
                          onChange={(e) => setServiceSettings((prev) => ({ ...prev, [key]: { ...prev[key], name: e.target.value } }))} />
                      </td>
                      <td className="px-2 py-2 text-xs text-[#6B6560]">{unit}</td>
                      <td className="px-2 py-2">{priceInput(services[key], (v) => setServices((prev) => ({ ...prev, [key]: v })), variable)}</td>
                      <td className="px-2 py-2">
                        <VariableSwitch checked={variable} label={`${label} per project aanpasbaar`}
                          onChange={(v) => setServiceSettings((prev) => ({ ...prev, [key]: { ...prev[key], variable: v } }))} />
                      </td>
                      <td className="px-5 py-2" />
                    </tr>
                  )
                })}

                {tab === 'extras' && extras.map((x) => (
                  <tr key={x.id} className={cn('border-t border-[#EFEBE6]', x.variable && 'bg-[#FBF7EF]')}>
                    <td className="pl-5 pr-2 py-2">
                      <input value={x.name} aria-label="Naam" className={nameInputClass}
                        onChange={(e) => setExtras((prev) => prev.map((p) => (p.id === x.id ? { ...p, name: e.target.value } : p)))} />
                    </td>
                    <td className="px-2 py-2 text-xs text-[#6B6560]">vinkje per optie</td>
                    <td className="px-2 py-2">{priceInput(x.amount, (v) => setExtras((prev) => prev.map((p) => (p.id === x.id ? { ...p, amount: v } : p))), x.variable)}</td>
                    <td className="px-2 py-2">
                      <VariableSwitch checked={!!x.variable} label={`${x.name} per project aanpasbaar`}
                        onChange={(v) => setExtras((prev) => prev.map((p) => (p.id === x.id ? { ...p, variable: v } : p)))} />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <DeleteButton label={`Onderdeel "${x.name || 'naamloos'}"`} onConfirm={() => setExtras((prev) => prev.filter((p) => p.id !== x.id))} />
                    </td>
                  </tr>
                ))}

                {counts[tab] === 0 && (
                  <tr className="border-t border-[#EFEBE6]">
                    <td colSpan={5} className="px-5 py-6 text-sm text-[#6B6560]">Nog niets toegevoegd. Gebruik de regel hieronder.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <datalist id="werkblad-suppliers">
              {suppliers.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          {tab !== 'diensten' && (
            <div className="mt-auto px-5 py-4 border-t border-[#DDD8D2] bg-[#FAF9F7] grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_9rem_8rem_11rem_auto] gap-2.5 items-end">
              <div className="space-y-1">
                <Label htmlFor="new-row-name" className="text-xs text-[#6B6560]">
                  {tab === 'materialen' ? 'Nieuw materiaal' : tab === 'uitsparingen' ? 'Nieuwe uitsparing' : tab === 'diktes' ? 'Nieuwe dikte (mm)' : 'Nieuw onderdeel'}
                </Label>
                <Input
                  id="new-row-name"
                  value={newRow.name}
                  inputMode={tab === 'diktes' ? 'decimal' : undefined}
                  onChange={(e) => setNewRow((prev) => ({ ...prev, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
                  placeholder={tab === 'diktes' ? 'Bijv. 12' : 'Naam'}
                  className="h-9 bg-white"
                />
              </div>
              <div className="space-y-1">
                {tab === 'materialen' ? (
                  <>
                    <Label htmlFor="new-row-supplier" className="text-xs text-[#6B6560]">Leverancier</Label>
                    <Input id="new-row-supplier" list="werkblad-suppliers" value={newRow.second} placeholder="Bijv. CEBIN" className="h-9 bg-white"
                      onChange={(e) => setNewRow((prev) => ({ ...prev, second: e.target.value }))} />
                  </>
                ) : <span aria-hidden="true" />}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#6B6560]">{tabInfo.price}</Label>
                <NumberInput value={newRow.amount} onChange={(amount) => setNewRow((prev) => ({ ...prev, amount }))} className="h-9 bg-white text-right" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-row-kind" className="text-xs text-[#6B6560]">Soort</Label>
                <select id="new-row-kind" value={newRow.variable ? 'variabel' : 'vast'} className={cn(selectClass, 'w-full')}
                  onChange={(e) => setNewRow((prev) => ({ ...prev, variable: e.target.value === 'variabel' }))}>
                  <option value="vast">Vast tarief</option>
                  <option value="variabel">Per project aanpasbaar</option>
                </select>
              </div>
              <Button type="button" onClick={addRow} disabled={!newRow.name.trim()} className="h-9">Toevoegen</Button>
            </div>
          )}
        </section>
      </div>

      <p className="text-xs text-[#6B6560]">
        Vast = dezelfde prijs in elke berekening. Per project aanpasbaar = de prijs hier is het voorstel; in de werkblad-rekentool staat er een bedragveld bij.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
