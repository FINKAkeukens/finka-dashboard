'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EurolineRates } from '@/lib/types'

type RateKey = Exclude<keyof EurolineRates, 'id' | 'updated_at'>

const FIELDS: { key: RateKey; label: string; hint: string }[] = [
  { key: 'opslag_base', label: 'Opslag — basis (3 weken, per keuken)', hint: '' },
  { key: 'opslag_per_week_extra', label: 'Opslag — per extra week (na 3 weken)', hint: '' },
  { key: 'levering_base', label: 'Levering — basis (regulier, max 5 pallets, incl. 1 uur lostijd)', hint: '' },
  { key: 'levering_groter_toeslag', label: 'Levering — toeslag grotere levering (>5 pallets)', hint: '' },
  { key: 'levering_niet_begane_grond', label: 'Levering — toeslag niet begane grond', hint: '' },
  { key: 'levering_verhuislift', label: 'Levering — toeslag verhuislift', hint: '' },
  { key: 'levering_extra_lostijd_per_halfuur', label: 'Levering — toeslag per extra half uur lostijd', hint: '' },
  { key: 'levering_buiten_werkgebied', label: 'Levering — toeslag buiten werkgebied Euroline Logistiek', hint: '' },
  { key: 'werkblad_multiplex', label: 'Levering werkblad — multiplex/Greenpanel/Greengridz', hint: '' },
  { key: 'werkblad_composiet', label: 'Levering werkblad — composiet/keramiek/hardsteen', hint: '' },
  { key: 'installatie_per_m1', label: 'Installatie — per m1 (standaard)', hint: '' },
  { key: 'installatie_buitengebied_per_m1', label: 'Installatie — per m1 (buitengebied)', hint: '' },
  { key: 'service_tarief_per_uur', label: 'Service — tarief per uur (nacalculatie)', hint: '' },
  { key: 'service_minimum', label: 'Service — minimumbedrag zodra er service is', hint: '' },
]

export default function EurolineRatesForm({ rates }: { rates: EurolineRates | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [values, setValues] = useState<Record<RateKey, number>>(() => {
    const initial = {} as Record<RateKey, number>
    for (const { key } of FIELDS) initial[key] = rates ? Number(rates[key]) : 0
    return initial
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

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('finka_euroline_rates')
      .update({ ...values, updated_at: new Date().toISOString() })
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2 border-t border-[#DDD8D2]">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
