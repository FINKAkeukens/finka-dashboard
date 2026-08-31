'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/appliance-utils'
import { Appliance, ApparatuurOptionData, ApparatuurOptionItem, ConfiguratorOption, OfferAttachment } from '@/lib/types'
import { selectOnFocus } from '@/lib/utils'
import { FileText, Plus, Trash2, Upload, X, Zap } from 'lucide-react'
import AppliancePickerModal from '../offerte/AppliancePickerModal'

function readData(data: ConfiguratorOption['data']): ApparatuurOptionData {
  const d = data as unknown as Partial<ApparatuurOptionData> | undefined
  return {
    items: d?.items ?? [],
    attachments: d?.attachments ?? [],
    summary_lines: d?.summary_lines ?? [],
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function itemsTotal(items: ApparatuurOptionItem[]) {
  return round2(items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0))
}

function newItem(overrides: Partial<ApparatuurOptionItem> = {}): ApparatuurOptionItem {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    appliance_id: null,
    description: '',
    brand: null,
    model: null,
    unit_price: 0,
    quantity: 1,
    include_in_customer_view: true,
    ...overrides,
  }
}

async function parseUploadResponse(res: Response) {
  try {
    return await res.json()
  } catch {
    throw new Error(
      res.ok ? 'Onverwachte reactie van de server' : `Serverfout (${res.status}) — mogelijk is het bestand te groot`
    )
  }
}

// Apparatuur-optie: kies apparaten uit de bibliotheek (zoals voorheen in
// Offerte) óf upload een leveranciersofferte voor apparatuur die niet uit de
// bibliotheek komt — beide vullen dezelfde regel-lijst/kostprijs van déze
// ene optie. De items hier zijn een eigen lijstje per optie, losstaand van
// de "Interne regels" in Offerte (die blijven voor product/dienst/maatwerk).
export default function ApparatuurOptionEditor({
  quoteId,
  appliances,
  option,
  onChange,
}: {
  quoteId: string
  appliances: Appliance[]
  option: ConfiguratorOption
  onChange: (patch: { data?: ApparatuurOptionData; cost_total?: number }) => void
}) {
  const data = readData(option.data)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // De picker toont de al gekozen apparaten meteen aangevinkt (zie
  // libraryApplianceIds hieronder) en geeft bij bevestigen de vólledige
  // gewenste selectie terug — niet alleen de nieuw aangevinkte. Dit
  // reconcilieert die selectie met de huidige lijst in één keer:
  // - niet meer aangevinkte apparaten verdwijnen (verwijderen kan dus ook)
  // - nieuw aangevinkte apparaten worden toegevoegd
  // - nog steeds aangevinkte apparaten blijven ongemoeid, incl. een eventueel
  //   handmatig aangepast aantal/prijs
  // Losse (niet-bibliotheek) regels raakt dit nooit aan.
  function applyApplianceSelection(selectedAppliances: Appliance[]) {
    const selectedIds = new Set(selectedAppliances.map((a) => a.id))
    const currentApplianceIds = new Set(data.items.filter((i) => i.appliance_id).map((i) => i.appliance_id))
    const kept = data.items.filter((i) => !i.appliance_id || selectedIds.has(i.appliance_id))
    const added = selectedAppliances
      .filter((a) => !currentApplianceIds.has(a.id))
      .map((a) =>
        newItem({
          appliance_id: a.id,
          description: `${a.brand} ${a.model}`,
          brand: a.brand,
          model: a.model,
          unit_price: a.price ?? 0,
        })
      )
    const nextItems = [...kept, ...added]
    onChange({ data: { ...data, items: nextItems }, cost_total: itemsTotal(nextItems) })
  }

  const libraryApplianceIds = data.items.filter((i) => i.appliance_id).map((i) => i.appliance_id as string)

  function addManualItem() {
    onChange({ data: { ...data, items: [...data.items, newItem({})] } })
  }

  function updateItem(id: string, patch: Partial<ApparatuurOptionItem>) {
    const nextItems = data.items.map((i) => (i.id === id ? { ...i, ...patch } : i))
    onChange({ data: { ...data, items: nextItems }, cost_total: itemsTotal(nextItems) })
  }

  function removeItemRow(id: string) {
    const nextItems = data.items.filter((i) => i.id !== id)
    onChange({ data: { ...data, items: nextItems }, cost_total: itemsTotal(nextItems) })
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('quoteId', quoteId)

      const res = await fetch('/api/quotes/parse-apparatuur', { method: 'POST', body: formData })
      const body = await parseUploadResponse(res)

      if (!res.ok) {
        setUploadError(`Verwerken mislukt: ${body.error ?? res.statusText}`)
      } else {
        const patch: { data: ApparatuurOptionData; cost_total?: number } = {
          data: {
            ...data,
            attachments: [body.attachment as OfferAttachment],
            summary_lines: body.summary?.length ? (body.summary as string[]) : data.summary_lines,
          },
        }
        if (typeof body.totaalExclBtw === 'number') patch.cost_total = body.totaalExclBtw
        onChange(patch)
        if (body.summaryError) {
          setUploadError(`Bijlage geüpload, maar AI-verwerking mislukte: ${body.summaryError}`)
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Uploaden mislukt')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeAttachment(url: string) {
    onChange({ data: { ...data, attachments: data.attachments.filter((a) => a.url !== url), summary_lines: [] }, cost_total: itemsTotal(data.items) })
  }

  function updateSummaryLine(index: number, value: string) {
    onChange({ data: { ...data, summary_lines: data.summary_lines.map((l, i) => (i === index ? value : l)) } })
  }

  function removeSummaryLine(index: number) {
    onChange({ data: { ...data, summary_lines: data.summary_lines.filter((_, i) => i !== index) } })
  }

  function addSummaryLine() {
    onChange({ data: { ...data, summary_lines: [...data.summary_lines, ''] } })
  }

  return (
    <div className="space-y-4">
      <AppliancePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        appliances={appliances}
        onSelect={applyApplianceSelection}
        initialSelectedIds={libraryApplianceIds}
      />

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-[#6B6560]">Omschrijving</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-20">Aantal</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-32">Prijs p.st.</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-32">Totaal</th>
              <th className="text-center px-2 py-2.5 text-xs font-medium text-[#6B6560] w-20">Klantversie</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDD8D2]">
            {data.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-2">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    placeholder="Omschrijving..."
                    className="w-full text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                    onFocus={selectOnFocus}
                    className="w-full text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(item.id, { unit_price: round2(Number(e.target.value)) })}
                    onFocus={selectOnFocus}
                    className="w-full text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
                <td className="px-4 py-2 text-right text-sm font-medium text-[#1C1B19]">
                  {formatPrice(round2(item.quantity * item.unit_price))}
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => updateItem(item.id, { include_in_customer_view: !item.include_in_customer_view })}
                    title="Meenemen in klantversie zodra deze optie wordt toegepast"
                    className={item.include_in_customer_view ? 'text-green-600' : 'text-[#9A948D] hover:text-[#1C1B19]'}
                  >
                    ✓
                  </button>
                </td>
                <td className="px-2 py-2">
                  <button onClick={() => removeItemRow(item.id)} title="Regel verwijderen">
                    <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-[#DDD8D2] bg-[#F7F5F2]">
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Zap size={13} className="mr-1.5" />
            Apparaat uit bibliotheek
          </Button>
          <Button variant="outline" size="sm" onClick={addManualItem}>
            <Plus size={13} className="mr-1.5" />
            Losse regel
          </Button>
          <div className="flex-1" />
          <span className="text-sm font-medium text-[#1C1B19]">Totaal: {formatPrice(option.cost_total)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#6B6560]">Apparatuur die niet uit de bibliotheek komt: upload de leveranciersofferte.</p>
        <div className="flex items-center gap-2 shrink-0">
          <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={handleUpload} />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload size={13} className="mr-1.5" />
            {uploading ? 'Verwerken...' : 'Offerte uploaden'}
          </Button>
        </div>
      </div>

      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

      {data.attachments.length > 0 && (
        <div className="space-y-1.5">
          {data.attachments.map((att) => (
            <div key={att.url} className="flex items-center justify-between gap-2 bg-[#F7F5F2] rounded-lg px-3 py-2">
              <a href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-[#1C1B19] hover:underline min-w-0">
                <FileText size={14} className="shrink-0 text-[#6B6560]" />
                <span className="truncate">{att.name}</span>
              </a>
              <button onClick={() => removeAttachment(att.url)} title="Bijlage verwijderen">
                <X size={13} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-[#6B6560]">Samenvatting (voor de klantversie)</label>
        {data.summary_lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={line}
              onChange={(e) => updateSummaryLine(i, e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            />
            <button onClick={() => removeSummaryLine(i)} title="Regel verwijderen">
              <X size={13} className="text-[#9A948D] hover:text-red-600" />
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addSummaryLine}>+ Regel</Button>
      </div>
    </div>
  )
}
