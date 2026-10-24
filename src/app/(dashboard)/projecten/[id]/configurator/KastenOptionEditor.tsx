'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NumberInput } from '@/components/ui/number-input'
import { ConfiguratorOption, KastenOptionData, OfferAttachment } from '@/lib/types'
import { formatPrice } from '@/lib/appliance-utils'
import { computeKastenNetCostTotal, KASTEN_DISCOUNTS } from '@/lib/configurator'
import { renderPlattegrondPng } from '@/lib/winner-plattegrond'
import { FileText, Upload, X } from 'lucide-react'

// gross_cost_total valt terug op option.cost_total (niet 0) zodat een optie
// die al vóór deze kortingen-feature was aangemaakt gewoon zijn bestaande
// kostprijs als vertrekpunt houdt i.p.v. plotseling op €0 te staan.
function readData(option: ConfiguratorOption): KastenOptionData {
  const d = option.data as unknown as Partial<KastenOptionData> | undefined
  return {
    attachments: d?.attachments ?? [],
    summary_lines: d?.summary_lines ?? [],
    gross_cost_total: d?.gross_cost_total ?? option.cost_total,
    discount_keys: d?.discount_keys ?? [],
    plattegrond_url: d?.plattegrond_url ?? null,
    plattegrond_pagina: d?.plattegrond_pagina ?? null,
    plattegrond_toont_posities: d?.plattegrond_toont_posities ?? false,
    pdf_page_count: d?.pdf_page_count ?? null,
  }
}

// Leest de JSON-body van een upload-response — gooit een leesbare fout
// i.p.v. een kale SyntaxError als de server geen geldige JSON teruggaf
// (bv. een 413/HTML-foutpagina omdat het bestand te groot is). Zelfde
// helper als in QuoteEditor.tsx.
async function parseUploadResponse(res: Response) {
  try {
    return await res.json()
  } catch {
    throw new Error(
      res.ok ? 'Onverwachte reactie van de server' : `Serverfout (${res.status}) — mogelijk is het bestand te groot`
    )
  }
}

// Kasten-optie: Winner Flex/Compusoft-uitdraai uploaden + AI-samenvatting —
// hetzelfde endpoint (/api/quotes/parse-winnerflex) als voorheen in
// QuoteEditor, alleen landt het resultaat nu in de data/cost_total van deze
// ene optie i.p.v. rechtstreeks in de offerte.
export default function KastenOptionEditor({
  quoteId,
  option,
  onChange,
}: {
  quoteId: string
  option: ConfiguratorOption
  onChange: (patch: { data?: KastenOptionData; cost_total?: number }) => void
}) {
  const data = readData(option)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [renderingPage, setRenderingPage] = useState(false)
  const [plattegrondError, setPlattegrondError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Rendert de gekozen pagina van de uitdraai naar een PNG en zet die in
  // Storage, naast de PDF zelf. Nieuw path per keer (timestamp): de
  // staff-Storage-policy staat geen upsert toe, zie handleUpload.
  async function uploadPlattegrond(source: Blob | string, requestedPage: number | 'laatste') {
    const { blob, pageCount, pageNumber } = await renderPlattegrondPng(source, requestedPage)
    const path = `${quoteId}/winnerflex-plattegrond-${Date.now()}.png`
    const { error: storageError } = await supabase.storage
      .from('offer-images')
      .upload(path, blob, { contentType: 'image/png' })
    if (storageError) throw new Error(storageError.message)
    const { data: publicUrlData } = supabase.storage.from('offer-images').getPublicUrl(path)
    return { url: publicUrlData.publicUrl, pageCount, pageNumber }
  }

  async function handleUpload(file: File) {
    setUploadError('')
    setPlattegrondError('')
    setUploading(true)
    try {
      // Eerst rechtstreeks naar Storage (i.p.v. de bytes via de route zelf
      // te sturen) — Vercel Functions laten een requestbody nooit groter dan
      // ~4,5MB door (hard, niet instelbaar), waar een Winner Flex-uitdraai
      // met tekening overheen kan gaan. De route haalt het bestand daarna
      // zelf op uit Storage om naar Claude te sturen.
      // Pad is altijd al uniek (timestamp) — geen upsert nodig, en de
      // staff-only Storage-policy staat upsert (dat een update-permissie
      // nodig heeft) niet toe, alleen een kale insert.
      const path = `${quoteId}/winnerflex-${Date.now()}-${file.name}`
      const { error: storageError } = await supabase.storage
        .from('offer-images')
        .upload(path, file, { contentType: file.type || 'application/pdf' })
      if (storageError) throw new Error(storageError.message)

      const res = await fetch('/api/quotes/parse-winnerflex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, path, filename: file.name, size: file.size }),
      })
      const body = await parseUploadResponse(res)

      if (!res.ok) {
        setUploadError(`Verwerken mislukt: ${body.error ?? res.statusText}`)
      } else {
        // Vervangt (niet toevoegt): een nieuwe/gecorrigeerde uitdraai moet de
        // vorige bijlage + samenvatting van déze optie overschrijven. De
        // AI leest de kostprijs vóór korting — al aangevinkte kortingen
        // (discount_keys) blijven staan en worden opnieuw doorgerekend.
        const grossCostTotal = typeof body.totaalExclBtw === 'number' ? body.totaalExclBtw : data.gross_cost_total
        // Plattegrond vóór de onChange hieronder: alles moet in één patch,
        // anders overschrijft een tweede onChange (met de oude `data` uit
        // deze closure) de net binnengekomen samenvatting. Mislukt alleen
        // de plattegrond, dan gaat de rest gewoon door.
        let plattegrond: { url: string | null; pagina: number | null; pageCount: number | null } = { url: null, pagina: null, pageCount: null }
        if (typeof body.plattegrondPagina === 'number') {
          try {
            const { url, pageCount } = await uploadPlattegrond(file, body.plattegrondPagina)
            plattegrond = { url, pagina: body.plattegrondPagina, pageCount }
          } catch (err) {
            setPlattegrondError(`Plattegrond maken mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
          }
        } else {
          setPlattegrondError('Geen bovenaanzicht gevonden in deze uitdraai.')
        }
        const patch: { data: KastenOptionData; cost_total?: number } = {
          data: {
            attachments: [body.attachment as OfferAttachment],
            summary_lines: body.summary?.length ? (body.summary as string[]) : data.summary_lines,
            gross_cost_total: grossCostTotal,
            discount_keys: data.discount_keys,
            plattegrond_url: plattegrond.url,
            plattegrond_pagina: plattegrond.pagina,
            plattegrond_toont_posities: body.plattegrondToontPosities === true,
            pdf_page_count: plattegrond.pageCount,
          },
        }
        if (typeof body.totaalExclBtw === 'number') {
          patch.cost_total = computeKastenNetCostTotal(grossCostTotal, data.discount_keys)
        }
        onChange(patch)
        if (body.summaryError) {
          setUploadError(`Bijlage geüpload, maar AI-verwerking mislukte: ${body.summaryError}`)
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Uploaden mislukt')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removeAttachment(url: string) {
    onChange({
      data: { attachments: data.attachments.filter((a) => a.url !== url), summary_lines: [], gross_cost_total: 0, discount_keys: [], plattegrond_url: null, plattegrond_pagina: null, plattegrond_toont_posities: false, pdf_page_count: null },
      cost_total: 0,
    })
  }

  // Handmatig een andere pagina kiezen, voor als de AI de verkeerde
  // aanwees — haalt de PDF opnieuw op uit Storage. Of positienummers op die
  // pagina staan weten we dan niet meer, dus die waarschuwing vervalt.
  async function choosePlattegrondPage(requestedPage: number | 'laatste') {
    const pdfUrl = data.attachments[0]?.url
    if (!pdfUrl) return
    setPlattegrondError('')
    setRenderingPage(true)
    try {
      const { url, pageCount, pageNumber } = await uploadPlattegrond(pdfUrl, requestedPage)
      onChange({ data: { ...data, plattegrond_url: url, plattegrond_pagina: pageNumber, plattegrond_toont_posities: true, pdf_page_count: pageCount } })
    } catch (err) {
      setPlattegrondError(`Plattegrond maken mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
    } finally {
      setRenderingPage(false)
    }
  }

  function removePlattegrond() {
    onChange({ data: { ...data, plattegrond_url: null, plattegrond_pagina: null, plattegrond_toont_posities: false } })
  }

  function updateGrossCostTotal(gross: number) {
    onChange({ data: { ...data, gross_cost_total: gross }, cost_total: computeKastenNetCostTotal(gross, data.discount_keys) })
  }

  function toggleDiscount(key: string) {
    const nextKeys = data.discount_keys.includes(key)
      ? data.discount_keys.filter((k) => k !== key)
      : [...data.discount_keys, key]
    onChange({ data: { ...data, discount_keys: nextKeys }, cost_total: computeKastenNetCostTotal(data.gross_cost_total, nextKeys) })
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
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-[#6B6560]">Kostprijs vóór korting (excl. btw)</label>
            <NumberInput
              value={data.gross_cost_total}
              onChange={updateGrossCostTotal}
              className="w-40 px-3 py-1.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            />
          </div>
          <div className="space-y-1">
            <span className="block text-xs text-[#6B6560]">Standaardkortingen</span>
            <div className="flex flex-wrap gap-4">
              {KASTEN_DISCOUNTS.map((discount) => (
                <label key={discount.key} className="flex items-center gap-1.5 text-sm text-[#1C1B19] cursor-pointer">
                  <Checkbox
                    checked={data.discount_keys.includes(discount.key)}
                    onCheckedChange={() => toggleDiscount(discount.key)}
                  />
                  {discount.label} — {discount.percentages.map((p) => `-${p}%`).join(' / ')}
                </label>
              ))}
            </div>
          </div>
          {data.discount_keys.length > 0 && (
            <p className="text-xs text-[#6B6560]">
              Kostprijs ná korting (excl. btw): <span className="font-medium text-[#1C1B19]">{formatPrice(option.cost_total)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
            }}
          />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload size={13} className="mr-1.5" />
            {uploading ? 'Verwerken...' : 'Uitdraai uploaden'}
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

      {data.attachments.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-[#6B6560]">Plattegrond (eigen pagina na de kastenlijst)</label>
            <div className="flex items-center gap-2">
              {data.pdf_page_count ? (
                <select
                  value={data.plattegrond_pagina ?? ''}
                  onChange={(e) => choosePlattegrondPage(Number(e.target.value))}
                  disabled={renderingPage || uploading}
                  className="px-2 py-1 text-xs bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                >
                  <option value="" disabled>Kies pagina</option>
                  {Array.from({ length: data.pdf_page_count }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>Pagina {n}</option>
                  ))}
                </select>
              ) : (
                <Button variant="outline" size="sm" onClick={() => choosePlattegrondPage('laatste')} disabled={renderingPage || uploading}>
                  Plattegrond toevoegen
                </Button>
              )}
              {data.plattegrond_url && (
                <button onClick={removePlattegrond} title="Plattegrond verwijderen">
                  <X size={13} className="text-[#9A948D] hover:text-red-600" />
                </button>
              )}
            </div>
          </div>
          {renderingPage && <p className="text-xs text-[#6B6560]">Plattegrond maken...</p>}
          {plattegrondError && <p className="text-xs text-red-600">{plattegrondError}</p>}
          {data.plattegrond_url && !data.plattegrond_toont_posities && (
            <p className="text-xs text-amber-700">
              Geen positienummers gevonden op deze plattegrond. Zet in Winner Flex de positienummers aan bij het afdrukken van het bovenaanzicht en upload de uitdraai opnieuw.
            </p>
          )}
          {data.plattegrond_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.plattegrond_url} alt="Plattegrond" className="max-h-72 w-auto rounded-lg border border-[#DDD8D2] bg-white" />
          )}
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
