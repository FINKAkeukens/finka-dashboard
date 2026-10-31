'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/ui/number-input'
import { ConfiguratorOption, MaatwerkOptionData, OfferAttachment } from '@/lib/types'
import { FileText, Upload, X } from 'lucide-react'

function readData(data: ConfiguratorOption['data']): MaatwerkOptionData {
  const d = data as unknown as Partial<MaatwerkOptionData> | undefined
  return {
    attachments: d?.attachments ?? [],
    summary_lines: d?.summary_lines ?? [],
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

// Maatwerk-optie: upload een offerte (PDF, bv. van de timmerman) óf vul zelf
// kostprijs en samenvatting in — zelfde opzet als WerkbladOptionEditor, zonder
// rekentool.
export default function MaatwerkOptionEditor({
  quoteId,
  option,
  onChange,
}: {
  quoteId: string
  option: ConfiguratorOption
  onChange: (patch: { data?: MaatwerkOptionData; cost_total?: number }) => void
}) {
  const data = readData(option.data)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleUpload(file: File) {
    setUploadError('')
    setUploading(true)
    try {
      // Eerst rechtstreeks naar Storage — Vercel Functions laten een
      // requestbody nooit groter dan ~4,5MB door (hard, niet instelbaar).
      // De route haalt het bestand daarna zelf op uit Storage om naar
      // Claude te sturen.
      // Pad is altijd al uniek — geen upsert nodig (en de staff-only
      // Storage-policy staat alleen een kale insert toe, geen upsert).
      const path = `${quoteId}/maatwerk-${Date.now()}-${file.name}`
      const { error: storageError } = await supabase.storage
        .from('offer-images')
        .upload(path, file, { contentType: file.type || 'application/pdf' })
      if (storageError) throw new Error(storageError.message)

      const res = await fetch('/api/quotes/parse-maatwerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, path, filename: file.name, size: file.size }),
      })
      const body = await parseUploadResponse(res)

      if (!res.ok) {
        setUploadError(`Verwerken mislukt: ${body.error ?? res.statusText}`)
      } else {
        const patch: { data: MaatwerkOptionData; cost_total?: number } = {
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
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function removeAttachment(url: string) {
    onChange({ data: { ...data, attachments: data.attachments.filter((a) => a.url !== url), summary_lines: [] }, cost_total: 0 })
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
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <label className="text-xs text-[#6B6560]">Kostprijs (excl. btw)</label>
          <NumberInput
            value={option.cost_total}
            onChange={(cost_total) => onChange({ cost_total })}
            className="w-40 px-3 py-1.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          />
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
