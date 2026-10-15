'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { EurolineRates } from '@/lib/types'

type RateKey = Exclude<keyof EurolineRates, 'id' | 'updated_at' | 'brandstoftoeslag_over_installatie'>

const FIELDS: { key: RateKey; label: string; hint: string }[] = [
  { key: 'opslag_base', label: 'Opslag — basis (3 weken, per keuken)', hint: '' },
  { key: 'opslag_per_week_extra', label: 'Opslag — per extra week (na 3 weken)', hint: '' },
  { key: 'levering_base', label: 'Levering — basis (regulier, max 5 pallets, incl. 1 uur lostijd)', hint: '' },
  { key: 'levering_groter_toeslag', label: 'Levering — toeslag grotere levering (>5 pallets)', hint: '' },
  { key: 'levering_niet_begane_grond', label: 'Levering — toeslag niet begane grond', hint: '' },
  { key: 'levering_verhuislift', label: 'Levering — toeslag verhuislift / buitenlift (verticaal transport)', hint: '' },
  { key: 'levering_extra_lostijd_per_halfuur', label: 'Levering — toeslag per extra half uur lostijd', hint: '' },
  { key: 'levering_buiten_werkgebied', label: 'Levering — toeslag buiten werkgebied Euroline Logistiek', hint: '' },
  { key: 'werkblad_multiplex', label: 'Levering werkblad — multiplex/Greenpanel/Greengridz', hint: '' },
  { key: 'werkblad_composiet', label: 'Levering werkblad — composiet/keramiek/hardsteen', hint: '' },
  { key: 'werkblad_extra_verpakking', label: 'Werkblad extra verpakt (incl. materiaal)', hint: '' },
  { key: 'installatie_per_m1', label: 'Installatie — per m1 (standaard)', hint: '' },
  { key: 'installatie_buitengebied_per_m1', label: 'Installatie — per m1 (buitengebied)', hint: '' },
  { key: 'service_tarief_per_uur', label: 'Service — tarief per uur (nacalculatie)', hint: '' },
  { key: 'service_minimum', label: 'Service — minimumbedrag zodra er service is', hint: '' },
  { key: 'inmeten_tarief', label: 'Inmeten — vast bedrag (aan/uit te vinken per project)', hint: '' },
]

export default function EurolineRatesForm({ rates }: { rates: EurolineRates | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [values, setValues] = useState<Record<RateKey, number>>(() => {
    const initial = {} as Record<RateKey, number>
    for (const { key } of FIELDS) initial[key] = rates ? Number(rates[key]) : 0
    // Geen euro's maar een percentage — staat daarom in een eigen blok
    // onder de tarieven i.p.v. in FIELDS.
    initial.brandstoftoeslag_percentage = rates ? Number(rates.brandstoftoeslag_percentage) : 0
    return initial
  })
  const [overInstallatie, setOverInstallatie] = useState(rates?.brandstoftoeslag_over_installatie ?? false)
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

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('finka_euroline_rates')
      .update({ ...values, brandstoftoeslag_over_installatie: overInstallatie, updated_at: new Date().toISOString() })
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

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <Input
              type="number"
              step="0.01"
              value={values[key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              className="h-9"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-4 border-t border-[#DDD8D2]">
        <h2 className="text-sm font-medium text-[#1C1B19]">Brandstoftoeslag</h2>
        <p className="text-xs text-[#6B6560]">
          Tijdelijke toeslag van Euroline sinds 16-03-2026, gekoppeld aan de dieselprijs (TLN brandstofmonitor). Euroline berekent hem achteraf,
          dus vul hier het percentage van de laatste factuur in (staat op de regel &quot;Brandstoftoeslag&quot;). 0 = geen toeslag.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Percentage (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={values.brandstoftoeslag_percentage}
              onChange={(e) => setValues((prev) => ({ ...prev, brandstoftoeslag_percentage: Number(e.target.value) }))}
              className="h-9"
            />
          </div>
        </div>
        <p className="text-xs text-[#6B6560]">
          Gerekend over: basislevering + basisopslag, de leveringstoeslagen (groter, niet begane grond, lift, buiten werkgebied) en de werkblad-levering.
          Niet over extra lostijd, extra opslagweken en extra verpakking. Het bedrag telt mee bij Levering.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-[#1C1B19]">
          <Checkbox checked={overInstallatie} onCheckedChange={(v) => setOverInstallatie(v === true)} />
          Ook over montage/installatie rekenen
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2 border-t border-[#DDD8D2]">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
