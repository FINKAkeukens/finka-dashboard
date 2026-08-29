'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfiguratorOption, KastenOptionData, OfferAttachment } from '@/lib/types'
import { selectOnFocus } from '@/lib/utils'
import { FileText, Upload, X } from 'lucide-react'

function readData(data: ConfiguratorOption['data']): KastenOptionData {
  const d = data as unknown as Partial<KastenOptionData> | undefined
  return {
    attachments: d?.attachments ?? [],
    summary_lines: d?.summary_lines ?? [],
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
  const data = readData(option.data)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('quoteId', quoteId)

      const res = await fetch('/api/quotes/parse-winnerflex', { method: 'POST', body: formData })
      const body = await parseUploadResponse(res)

      if (!res.ok) {
        setUploadError(`Verwerken mislukt: ${body.error ?? res.statusText}`)
      } else {
        // Vervangt (niet toevoegt): een nieuwe/gecorrigeerde uitdraai moet de
        // vorige bijlage + samenvatting van déze optie overschrijven.
        const patch: { data: KastenOptionData; cost_total?: number } = {
          data: {
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
    onChange({ data: { attachments: data.attachments.filter((a) => a.url !== url), summary_lines: [] }, cost_total: 0 })
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
          <input
            type="number"
            step="0.01"
            value={option.cost_total}
            onChange={(e) => onChange({ cost_total: Number(e.target.value) || 0 })}
            onFocus={selectOnFocus}
            className="w-40 px-3 py-1.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={handleUpload} />
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
