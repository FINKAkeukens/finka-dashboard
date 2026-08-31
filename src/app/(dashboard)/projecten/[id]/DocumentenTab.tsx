'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Clock, Eye, EyeOff, FileSignature, FileText } from 'lucide-react'
import type { QuoteDownload } from '@/lib/types'

// Eén rij per keer dat een offerte-PDF is gedownload (elke versie van het
// project), met de datum waarop 'm hier is "toegevoegd". Later kunnen hier
// ook andere documentsoorten bij komen — vooralsnog alleen offerte-downloads
// (zie /api/offerte/[projectId]/pdf/route.ts). De twee oog-/handtekening-
// knopjes bepalen of een download in het klantenportaal te zien is, en of de
// klant 'm daar officieel moet accorderen — zie visible_to_customer en
// approval_required op finka_quote_downloads (migratie-secties 56 en 58).
export default function DocumentenTab({ downloads: initialDownloads }: { downloads: QuoteDownload[] }) {
  const supabase = createClient()
  const [downloads, setDownloads] = useState<QuoteDownload[]>(initialDownloads)
  const [error, setError] = useState('')

  async function update(d: QuoteDownload, patch: Partial<QuoteDownload>) {
    setDownloads((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...patch } : x)))
    const { error: updError } = await supabase.from('finka_quote_downloads').update(patch).eq('id', d.id)
    if (updError) setError(updError.message)
  }

  function toggleVisible(d: QuoteDownload) {
    update(d, { visible_to_customer: !d.visible_to_customer })
  }

  function toggleApprovalRequired(d: QuoteDownload) {
    const approval_required = !d.approval_required
    // Een document dat om akkoord vraagt moet de klant ook kunnen zíen —
    // anders zou het nooit geaccordeerd kunnen worden.
    update(d, approval_required && !d.visible_to_customer
      ? { approval_required, visible_to_customer: true }
      : { approval_required })
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
            <div key={d.id} className="px-5 py-3.5 text-sm space-y-2">
              <div className="flex items-center justify-between gap-4">
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
                  <button
                    onClick={() => toggleApprovalRequired(d)}
                    disabled={!d.pdf_url}
                    title={
                      !d.pdf_url
                        ? 'PDF niet meer beschikbaar'
                        : d.approval_required
                          ? 'Klant moet dit document accorderen — klik om dat niet meer te vereisen'
                          : 'Klik om te vereisen dat de klant dit document officieel accordeert in het portaal'
                    }
                    className="disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <FileSignature size={14} className={d.approval_required ? 'text-[#C9A96E]' : 'text-[#9A948D] hover:text-[#1C1B19]'} />
                  </button>
                </div>
              </div>

              {d.approval_required && (
                <div className="pl-[26px]">
                  {d.approved_at ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[#3F7D4F]">
                      <CheckCircle2 size={12} />
                      Akkoord gegeven door {d.approved_by ?? 'klant'} op{' '}
                      {new Date(d.approved_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-[#C9A96E]">
                      <Clock size={12} />
                      Wacht op akkoord van de klant
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
