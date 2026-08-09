'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2 } from 'lucide-react'
import { WerkbladCalcInputs, WerkbladPart, WerkbladRates } from '@/lib/types'
import { computeWerkbladTotals, formatEUR, newWerkbladPart, WerkbladCalcTotals } from '@/lib/werkblad-calc'

const CUTOUT_LABELS: Record<'kookplaat' | 'spoelbak' | 'kraan', string> = {
  kookplaat: 'Kookplaat',
  spoelbak: 'Spoelbak',
  kraan: 'Kraan (boring)',
}

export default function WerkbladCalculator({
  rates,
  value,
  onChange,
  onApply,
  applyLabel = 'Toepassen in offerte',
}: {
  rates: WerkbladRates
  value: WerkbladCalcInputs
  onChange: (v: WerkbladCalcInputs) => void
  onApply?: (totals: WerkbladCalcTotals) => void
  applyLabel?: string
}) {
  const totals = computeWerkbladTotals(value, rates)

  function updatePart(id: string, patch: Partial<WerkbladPart>) {
    onChange({ ...value, parts: value.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  function toggleCutout(id: string, key: keyof WerkbladPart['cutouts']) {
    onChange({
      ...value,
      parts: value.parts.map((p) => (p.id === id ? { ...p, cutouts: { ...p.cutouts, [key]: !p.cutouts[key] } } : p)),
    })
  }

  function addPart() {
    onChange({ ...value, parts: [...value.parts, newWerkbladPart(rates)] })
  }

  function removePart(id: string) {
    if (value.parts.length <= 1) return
    onChange({ ...value, parts: value.parts.filter((p) => p.id !== id) })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
      <div className="space-y-3">
        {totals.parts.map(({ part, calc }, i) => (
          <div key={part.id} className="bg-[#F7F5F2] rounded-lg border border-[#DDD8D2] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#1C1B19]">Deel {i + 1}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#8A6A2E]">{formatEUR(calc.total)}</span>
                {value.parts.length > 1 && (
                  <button onClick={() => removePart(part.id)} title="Deel verwijderen">
                    <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Materiaal</Label>
                <select
                  value={part.material_id}
                  onChange={(e) => updatePart(part.id, { material_id: e.target.value })}
                  className="w-full h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                >
                  {rates.materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lengte (mm)</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={part.length}
                  onChange={(e) => updatePart(part.id, { length: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Diepte (mm)</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={part.depth}
                  onChange={(e) => updatePart(part.id, { depth: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <div className="space-y-1">
                <Label className="text-xs">Dikte (mm)</Label>
                <select
                  value={part.thickness}
                  onChange={(e) => updatePart(part.id, { thickness: Number(e.target.value) })}
                  className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                >
                  {rates.thicknesses.map((t) => (
                    <option key={t.mm} value={t.mm}>{t.mm} mm</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-4 pb-2">
                {(['kookplaat', 'spoelbak', 'kraan'] as const).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-[#6B6560] cursor-pointer">
                    <Checkbox checked={part.cutouts[c]} onCheckedChange={() => toggleCutout(part.id, c)} />
                    {CUTOUT_LABELS[c]} <span className="text-[#9A948D]">+{formatEUR(rates.cutouts[c])}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="text-xs text-[#9A948D] flex flex-wrap gap-3">
              <span>Oppervlak: {calc.area.toFixed(3)} m²</span>
              <span>Band: {calc.band}</span>
              <span>Prijs/m²: {formatEUR(calc.perM2)}</span>
              {calc.cutoutCost > 0 && <span>Uitsparingen: {formatEUR(calc.cutoutCost)}</span>}
            </div>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addPart}>
          <Plus size={13} className="mr-1.5" />
          Deel toevoegen
        </Button>

        <div className="flex flex-wrap items-end gap-4 pt-3 border-t border-[#DDD8D2]">
          <div className="space-y-1 w-28">
            <Label className="text-xs">Marge (%)</Label>
            <Input
              className="h-9"
              type="number"
              value={value.marge_percentage}
              onChange={(e) => onChange({ ...value, marge_percentage: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1 w-28">
            <Label className="text-xs">BTW (%)</Label>
            <Input
              className="h-9"
              type="number"
              value={value.btw_percentage}
              onChange={(e) => onChange({ ...value, btw_percentage: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[#1C1B19] pb-2 cursor-pointer">
            <Checkbox
              checked={value.btw_enabled}
              onCheckedChange={(checked) => onChange({ ...value, btw_enabled: Boolean(checked) })}
            />
            BTW meerekenen
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#DDD8D2] p-4 space-y-1 lg:sticky lg:top-4">
        <div className="text-sm font-medium text-[#1C1B19] mb-2">Samenvatting</div>
        <Row label="Totaal oppervlak" value={`${totals.totalArea.toFixed(3)} m²`} />
        {totals.koppelingKosten > 0 && <Row label="Hoekverbinding" value={formatEUR(totals.koppelingKosten)} />}
        {totals.inmeten > 0 && <Row label="Inmeten" value={formatEUR(totals.inmeten)} />}
        {totals.montage > 0 && <Row label="Montage" value={formatEUR(totals.montage)} />}
        {totals.transport > 0 && <Row label="Transporttoeslag" value={formatEUR(totals.transport)} />}
        <Row label="Kostprijs (ex btw)" value={formatEUR(totals.kostprijs)} />
        {value.marge_percentage > 0 && (
          <Row label={`Marge (${value.marge_percentage}%)`} value={formatEUR(totals.verkoop - totals.kostprijs)} />
        )}
        <Row label="Subtotaal excl. btw" value={formatEUR(totals.verkoop)} />
        {value.btw_enabled && <Row label={`BTW (${value.btw_percentage}%)`} value={formatEUR(totals.btwBedrag)} />}

        <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t-2 border-[#1C1B19]">
          <span className="text-sm font-medium text-[#1C1B19]">Totaal{value.btw_enabled ? ' incl. btw' : ''}</span>
          <span className="text-lg font-semibold text-[#8A6A2E] tabular-nums">{formatEUR(totals.totaal)}</span>
        </div>

        {onApply && (
          <Button className="w-full mt-3" onClick={() => onApply(totals)}>
            {applyLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-dotted border-[#E6DAC6] last:border-none">
      <span className="text-[#6B6560]">{label}</span>
      <span className="text-[#1C1B19] tabular-nums">{value}</span>
    </div>
  )
}
