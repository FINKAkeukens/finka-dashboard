'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, Sparkles, Trash2, X } from 'lucide-react'
import { ConnectionItem, ConnectionPin, ConnectionWand, PinType } from '@/lib/types'
import { PIN_TYPE_COLORS, PIN_TYPE_LABELS, buildItemNumbers, formatItemNumber } from '@/lib/aansluitschema'

function genId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyWand(): ConnectionWand {
  return {
    id: genId(),
    label: 'Nieuwe wand',
    bron_afbeelding_url: null,
    wand_hoogte_mm: 2700,
    plint_hoogte_mm: 150,
    cabinets: [],
    pins: [],
  }
}

export default function AansluitschemaTekening({
  projectId,
  wanden,
  onChange,
  items,
  imageOptions,
}: {
  projectId: string
  wanden: ConnectionWand[]
  onChange: (wanden: ConnectionWand[]) => void
  items: ConnectionItem[]
  imageOptions: string[]
}) {
  const [activeWandId, setActiveWandId] = useState<string | null>(wanden[0]?.id ?? null)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const itemNumbers = buildItemNumbers(items)
  const activeWand = wanden.find((w) => w.id === activeWandId) ?? null
  const selectedPin = activeWand?.pins.find((p) => p.id === selectedPinId) ?? null

  function updateWand(id: string, patch: Partial<ConnectionWand>) {
    onChange(wanden.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  }

  function addWand() {
    const wand = emptyWand()
    onChange([...wanden, wand])
    setActiveWandId(wand.id)
  }

  function removeWand(id: string) {
    if (!confirm('Deze wand-tekening verwijderen?')) return
    const next = wanden.filter((w) => w.id !== id)
    onChange(next)
    if (activeWandId === id) setActiveWandId(next[0]?.id ?? null)
  }

  function addPin(x: number, y: number) {
    if (!activeWand) return
    const pin: ConnectionPin = {
      id: genId(),
      connection_item_id: null,
      x,
      y,
      type: 'elektra',
      label: '',
      hoogte_cm: '',
    }
    updateWand(activeWand.id, { pins: [...activeWand.pins, pin] })
    setSelectedPinId(pin.id)
  }

  function updatePin(pinId: string, patch: Partial<ConnectionPin>) {
    if (!activeWand) return
    updateWand(activeWand.id, {
      pins: activeWand.pins.map((p) => (p.id === pinId ? { ...p, ...patch } : p)),
    })
  }

  function removePin(pinId: string) {
    if (!activeWand) return
    updateWand(activeWand.id, { pins: activeWand.pins.filter((p) => p.id !== pinId) })
    if (selectedPinId === pinId) setSelectedPinId(null)
  }

  function fractionFromEvent(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    return { x, y }
  }

  function handleImageClick(e: React.MouseEvent) {
    if (draggingPinId) return
    const fraction = fractionFromEvent(e)
    if (fraction) addPin(fraction.x, fraction.y)
  }

  function handlePinPointerDown(pinId: string, e: React.PointerEvent) {
    e.stopPropagation()
    setSelectedPinId(pinId)
    setDraggingPinId(pinId)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleContainerPointerMove(e: React.PointerEvent) {
    if (!draggingPinId) return
    const fraction = fractionFromEvent(e)
    if (fraction) updatePin(draggingPinId, fraction)
  }

  function handleContainerPointerUp() {
    setDraggingPinId(null)
  }

  async function handleUploadImage(file: File) {
    if (!activeWand) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', `${projectId}/wand-${Date.now()}-${file.name}`)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Upload mislukt')
      updateWand(activeWand.id, { bron_afbeelding_url: body.url })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
    }
  }

  async function handleAiVoorstel() {
    if (!activeWand?.bron_afbeelding_url) return
    setAiLoading(true)
    setAiError('')
    try {
      const catalogus = items.map((i) => ({ standard_key: i.standard_key, omschrijving: i.omschrijving }))
      const res = await fetch('/api/aansluitschema/ai-vul-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrijeTekst: '', plattegrondUrl: activeWand.bron_afbeelding_url, catalogus }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'AI-voorstel mislukt')

      type PinSuggestion = { standard_key?: string; type: PinType; label: string; hoogte_cm?: string; x?: number; y?: number }
      const suggesties: PinSuggestion[] = Array.isArray(body.pins_suggestie) ? body.pins_suggestie : []
      const nieuwePins: ConnectionPin[] = suggesties
        .filter((s) => typeof s.x === 'number' && typeof s.y === 'number')
        .map((s) => {
          const gekoppeldItem = s.standard_key ? items.find((i) => i.standard_key === s.standard_key) : null
          return {
            id: genId(),
            connection_item_id: gekoppeldItem?.id ?? null,
            x: s.x!,
            y: s.y!,
            type: s.type,
            label: s.label,
            hoogte_cm: s.hoogte_cm ?? '',
          }
        })
      if (!nieuwePins.length) {
        setAiError('Geen posities kunnen aflezen uit deze tekening')
        return
      }
      updateWand(activeWand.id, { pins: [...activeWand.pins, ...nieuwePins] })
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI-voorstel mislukt')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="bg-white border border-[#DDD8D2] rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {wanden.map((w) => (
          <button
            key={w.id}
            onClick={() => { setActiveWandId(w.id); setSelectedPinId(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
              w.id === activeWandId
                ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#C9A96E]'
            }`}
          >
            {w.label || 'Wand'}
            <X
              size={12}
              className="opacity-60 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); removeWand(w.id) }}
            />
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={addWand}>
          <Plus size={13} className="mr-1.5" /> Wand toevoegen
        </Button>
      </div>

      {!activeWand && (
        <p className="text-sm text-[#9A948D]">Nog geen wand-tekening — voeg er een toe om aansluitpunten op je eigen aanzicht te zetten.</p>
      )}

      {activeWand && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Naam wand</Label>
              <Input
                className="h-9"
                value={activeWand.label}
                onChange={(e) => updateWand(activeWand.id, { label: e.target.value })}
                placeholder="Bv. Kastenwand, Kookeiland"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tekening</Label>
              <select
                value={activeWand.bron_afbeelding_url ?? ''}
                onChange={(e) => updateWand(activeWand.id, { bron_afbeelding_url: e.target.value || null })}
                className="w-full h-9 px-3 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
              >
                <option value="">Kies een tekening...</option>
                {imageOptions.map((url, i) => (
                  <option key={url} value={url}>Afbeelding {i + 1}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="text-xs text-[#C9A96E] hover:underline cursor-pointer inline-block">
            {uploading ? 'Uploaden...' : 'Andere tekening uploaden'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUploadImage(file)
              }}
            />
          </label>

          {activeWand.bron_afbeelding_url ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#9A948D]">Klik op de tekening om een aansluitpunt te plaatsen; sleep een bestaand punt om te verplaatsen.</p>
                <Button size="sm" variant="outline" onClick={handleAiVoorstel} disabled={aiLoading}>
                  <Sparkles size={13} className="mr-1.5" /> {aiLoading ? 'Bezig...' : 'AI-voorstel'}
                </Button>
              </div>
              {aiError && <p className="text-sm text-red-600">{aiError}</p>}

              <div
                ref={containerRef}
                onClick={handleImageClick}
                onPointerMove={handleContainerPointerMove}
                onPointerUp={handleContainerPointerUp}
                className="relative border border-[#DDD8D2] rounded-lg overflow-hidden cursor-crosshair select-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeWand.bron_afbeelding_url}
                  alt={activeWand.label}
                  className="w-full h-auto block pointer-events-none"
                  draggable={false}
                />
                {activeWand.pins.map((pin) => {
                  const item = pin.connection_item_id ? items.find((i) => i.id === pin.connection_item_id) : null
                  const nummer = item ? itemNumbers.get(item.id) : undefined
                  return (
                    <div
                      key={pin.id}
                      onPointerDown={(e) => handlePinPointerDown(pin.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        left: `${pin.x * 100}%`,
                        top: `${pin.y * 100}%`,
                        borderColor: PIN_TYPE_COLORS[pin.type],
                        color: PIN_TYPE_COLORS[pin.type],
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-2 flex items-center justify-center text-[11px] font-bold cursor-grab active:cursor-grabbing ${
                        pin.id === selectedPinId ? 'ring-2 ring-offset-1 ring-[#1C1B19]' : ''
                      }`}
                    >
                      {nummer ? formatItemNumber(nummer) : '?'}
                    </div>
                  )
                })}
              </div>

              {selectedPin && (
                <div className="border border-[#DDD8D2] rounded-lg p-3 space-y-3 bg-[#FBFAF8]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[#9A948D] uppercase tracking-wider">Pin bewerken</h4>
                    <button onClick={() => removePin(selectedPin.id)} title="Pin verwijderen">
                      <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Gekoppelde regel</Label>
                      <select
                        value={selectedPin.connection_item_id ?? ''}
                        onChange={(e) => {
                          const item = items.find((i) => i.id === e.target.value)
                          updatePin(selectedPin.id, {
                            connection_item_id: e.target.value || null,
                            label: item ? '' : selectedPin.label,
                          })
                        }}
                        className="w-full h-9 px-3 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                      >
                        <option value="">Eigen label...</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {formatItemNumber(itemNumbers.get(i.id) ?? 0)} — {i.omschrijving}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Type (kleur)</Label>
                      <select
                        value={selectedPin.type}
                        onChange={(e) => updatePin(selectedPin.id, { type: e.target.value as PinType })}
                        className="w-full h-9 px-3 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                      >
                        {(Object.keys(PIN_TYPE_LABELS) as PinType[]).map((t) => (
                          <option key={t} value={t}>{PIN_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {!selectedPin.connection_item_id && (
                    <div className="space-y-1.5">
                      <Label>Eigen label</Label>
                      <Input
                        className="h-9"
                        value={selectedPin.label}
                        onChange={(e) => updatePin(selectedPin.id, { label: e.target.value })}
                        placeholder="Omschrijving van deze aansluiting"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Hoogte (cm)</Label>
                    <Input
                      className="h-9 w-32"
                      value={selectedPin.hoogte_cm}
                      onChange={(e) => updatePin(selectedPin.id, { hoogte_cm: e.target.value })}
                      placeholder="Bv. 60"
                    />
                  </div>
                </div>
              )}

              {activeWand.pins.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[#9A948D] uppercase tracking-wider mb-2">Legenda</h4>
                  <ul className="text-sm text-[#1C1B19] space-y-1">
                    {[...activeWand.pins]
                      .map((pin) => {
                        const item = pin.connection_item_id ? items.find((i) => i.id === pin.connection_item_id) : null
                        const nummer = item ? itemNumbers.get(item.id) ?? 0 : 0
                        const omschrijving = item?.omschrijving || pin.label || '—'
                        return { pin, nummer, omschrijving }
                      })
                      .sort((a, b) => (a.nummer || 999) - (b.nummer || 999))
                      .map(({ pin, nummer, omschrijving }) => (
                        <li key={pin.id} className="flex items-start gap-2">
                          <span
                            className="shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                            style={{ borderColor: PIN_TYPE_COLORS[pin.type], color: PIN_TYPE_COLORS[pin.type] }}
                          >
                            {nummer ? formatItemNumber(nummer) : '?'}
                          </span>
                          <span>{omschrijving}{pin.hoogte_cm ? `, ${pin.hoogte_cm} cm` : ''}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[#9A948D]">Kies hierboven een tekening (of upload er een) om aansluitpunten te kunnen plaatsen.</p>
          )}
        </div>
      )}
    </div>
  )
}
