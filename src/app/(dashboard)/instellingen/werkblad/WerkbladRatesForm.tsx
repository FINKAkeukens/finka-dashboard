'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { WerkbladMaterial, WerkbladRates, WerkbladThickness } from '@/lib/types'
import { uid } from '@/lib/werkblad-calc'

const CUTOUT_LABELS: Record<'kookplaat' | 'spoelbak' | 'kraan', string> = {
  kookplaat: 'Kookplaat',
  spoelbak: 'Spoelbak',
  kraan: 'Kraan (boring)',
}

export default function WerkbladRatesForm({ rates }: { rates: WerkbladRates | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [materials, setMaterials] = useState<WerkbladMaterial[]>(rates?.materials ?? [])
  const [cutouts, setCutouts] = useState(rates?.cutouts ?? { kookplaat: 0, spoelbak: 0, kraan: 0 })
  const [thicknesses, setThicknesses] = useState<WerkbladThickness[]>(rates?.thicknesses ?? [])
  const [hoekverbinding, setHoekverbinding] = useState(rates?.hoekverbinding ?? 0)
  const [inmeten, setInmeten] = useState(rates?.inmeten ?? 0)
  const [montage, setMontage] = useState(rates?.montage ?? 0)
  const [transport, setTransport] = useState(rates?.transport ?? 0)
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

  function updateMaterial(id: string, patch: Partial<WerkbladMaterial>) {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function addMaterial() {
    setMaterials((prev) => [...prev, { id: uid(), name: 'Nieuw materiaal', price_per_m2: 0 }])
  }

  function removeMaterial(id: string) {
    setMaterials((prev) => prev.filter((m) => m.id !== id))
  }

  function updateThickness(mm: number, surcharge: number) {
    setThicknesses((prev) => prev.map((t) => (t.mm === mm ? { ...t, surcharge } : t)))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('finka_werkblad_rates')
      .update({
        materials,
        cutouts,
        thicknesses,
        hoekverbinding,
        inmeten,
        montage,
        transport,
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

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Materialen (€ per m², ex btw)</h2>
        <div className="space-y-2">
          {materials.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <Input className="h-9 flex-1" value={m.name} onChange={(e) => updateMaterial(m.id, { name: e.target.value })} />
              <Input
                className="h-9 w-28"
                type="number"
                value={m.price_per_m2}
                onChange={(e) => updateMaterial(m.id, { price_per_m2: Number(e.target.value) })}
              />
              <button onClick={() => removeMaterial(m.id)} title="Materiaal verwijderen">
                <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addMaterial}>
          <Plus size={13} className="mr-1.5" />
          Materiaal
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Uitsparingen (vaste toeslag per stuk)</h2>
        <div className="grid grid-cols-3 gap-4">
          {(['kookplaat', 'spoelbak', 'kraan'] as const).map((c) => (
            <div key={c} className="space-y-1.5">
              <Label className="text-xs">{CUTOUT_LABELS[c]}</Label>
              <Input
                className="h-9"
                type="number"
                value={cutouts[c]}
                onChange={(e) => setCutouts((prev) => ({ ...prev, [c]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Diktetoeslag (€ per m², optioneel)</h2>
        <div className="grid grid-cols-6 gap-3">
          {thicknesses.map((t) => (
            <div key={t.mm} className="space-y-1.5">
              <Label className="text-xs">{t.mm} mm</Label>
              <Input className="h-9" type="number" value={t.surcharge} onChange={(e) => updateThickness(t.mm, Number(e.target.value))} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Koppeling & diensten</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Hoekverbinding (per koppeling)</Label>
            <Input className="h-9" type="number" value={hoekverbinding} onChange={(e) => setHoekverbinding(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Inmeten</Label>
            <Input className="h-9" type="number" value={inmeten} onChange={(e) => setInmeten(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Montage</Label>
            <Input className="h-9" type="number" value={montage} onChange={(e) => setMontage(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Transport</Label>
            <Input className="h-9" type="number" value={transport} onChange={(e) => setTransport(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>
    </div>
  )
}
