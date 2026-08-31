'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, FileText } from 'lucide-react'
import type { QuoteDownload } from '@/lib/types'

// Eén rij per keer dat een offerte-PDF is gedownload (elke versie van het
// project), met de datum waarop 'm hier is "toegevoegd". Later kunnen hier
// ook andere documentsoorten bij komen — vooralsnog alleen offerte-downloads
// (zie /api/offerte/[projectId]/pdf/route.ts). Het oogje bepaalt of deze
// download ook in het klantenportaal te zien is — standaard verborgen, zie
// visible_to_customer op finka_quote_downloads (migratie-sectie 56).
export default function DocumentenTab({ downloads: initialDownloads }: { downloads: QuoteDownload[] }) {
  const supabase = createClient()
  const [downloads, setDownloads] = useState<QuoteDownload[]>(initialDownloads)
  const [error, setError] = useState('')

  async function toggleVisible(d: QuoteDownload) {
    const visible_to_customer = !d.visible_to_customer
    setDownloads((prev) => prev.map((x) => (x.id === d.id ? { ...x, visible_to_customer } : x)))
    const { error: updError } = await supabase
      .from('finka_quote_downloads')
      .update({ visible_to_customer })
      .eq('id', d.id)
    if (updError) setError(updError.message)
  }

  if (!downloads.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">Nog geen gedownloade offertes voor dit project.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
        {downloads.map((d) => {
          // filename is null bij downloads van vóór deze functionaliteit.
          const label = d.filename ?? 'Offerte'
          return (
            <div key={d.id} className="px-5 py-3.5 text-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={16} className="text-[#6B6560] shrink-0" />
                {d.pdf_url ? (
                  <a
                    href={d.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#1C1B19] hover:underline truncate"
                  >
                    {label}.pdf
                  </a>
                ) : (
                  <span className="font-medium text-[#9A948D] truncate">{label}.pdf (niet meer beschikbaar)</span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xs text-[#1C1B19]">
                    {new Date(d.downloaded_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-[#9A948D]">{d.downloaded_by ?? 'Onbekend'}</p>
                </div>
                <button
                  onClick={() => toggleVisible(d)}
                  disabled={!d.pdf_url}
                  title={
                    !d.pdf_url
                      ? 'PDF niet meer beschikbaar — kan niet zichtbaar gemaakt worden'
                      : d.visible_to_customer
                        ? 'Zichtbaar in klantenportaal — klik om te verbergen'
                        : 'Verborgen voor klant — klik om te tonen in klantenportaal'
                  }
                  className="disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {d.visible_to_customer ? (
                    <Eye size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
                  ) : (
                    <EyeOff size={14} className="text-[#C9A96E]" />
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
