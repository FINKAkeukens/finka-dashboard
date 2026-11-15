'use client'

import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { KEUZE_WEET_NIET, ProjectKeuze } from '@/lib/types'
import { choiceText, extraLabel, formatExtra, formatEuro, hasPrices, isAnswered, isOpenVraag, totalExtra } from '@/lib/keuzes'

type PortalKeuze = Pick<ProjectKeuze, 'id' | 'title' | 'description' | 'options' | 'choice' | 'comment'>

// Tabblad Keuzes in het portaal (zoals keuzes.finkakeukens.nl): per vraag
// een foto-optie aanklikken of "Weet ik nog niet", met een opmerking. Elke
// keuze wordt meteen opgeslagen via /api/portaal/keuzes en staat dan direct
// bij FINKA in het project. Na "Definitief versturen" is alles alleen-lezen.
export default function PortalKeuzes({
  projectId,
  keuzes: initialKeuzes,
  submittedAt: initialSubmittedAt,
  readOnly,
}: {
  projectId: string
  keuzes: PortalKeuze[]
  submittedAt: string | null
  readOnly?: boolean
}) {
  const [keuzes, setKeuzes] = useState(initialKeuzes)
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const locked = !!submittedAt || !!readOnly
  // Open vragen zijn niet verplicht om te kunnen versturen.
  const required = keuzes.filter((k) => !isOpenVraag(k))
  const answered = required.filter(isAnswered).length
  const remaining = required.length - answered
  const showPrices = hasPrices(keuzes)

  async function save(k: PortalKeuze, values: Partial<PortalKeuze>) {
    if (locked) return
    const next = { ...k, ...values }
    setKeuzes((prev) => prev.map((x) => (x.id === k.id ? next : x)))
    setSavingId(k.id)
    setError('')
    const res = await fetch('/api/portaal/keuzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keuzeId: k.id, choice: next.choice, comment: next.comment }),
    }).catch(() => null)
    setSavingId(null)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'Opslaan is niet gelukt. Probeer het nog eens.')
    }
  }

  async function submit() {
    if (!confirm('Je keuzes definitief versturen? Daarna kun je ze niet meer zelf wijzigen.')) return
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/portaal/keuzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submitProjectId: projectId }),
    }).catch(() => null)
    setSubmitting(false)
    const body = await res?.json().catch(() => null)
    if (!res?.ok) return setError(body?.error ?? 'Versturen is niet gelukt. Probeer het nog eens.')
    setSubmittedAt(body.submitted_at)
  }

  if (keuzes.length === 0) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 text-center">
        Er staan nog geen keuzes voor je klaar.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 sm:p-5 space-y-1.5">
        <p className="text-sm text-[#1C1B19]">
          We helpen jullie graag met het maken van de belangrijke keuzes voor jullie keuken. Klik op de foto&apos;s en geef aan
          wat jullie voorkeur heeft.
        </p>
        <p className="text-xs text-[#6B6560]">
          Vragen of opmerkingen kun je kwijt in het opmerkingenveld dat verschijnt als je een keuze hebt gemaakt. Even appen of
          bellen mag natuurlijk ook altijd.
        </p>
      </div>

      {keuzes.map((k, i) => (
        <div key={k.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2] flex items-baseline gap-2">
            <span className="text-xs text-[#9A948D] shrink-0">{i + 1}/{keuzes.length}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium text-[#1C1B19]">{k.title}</h2>
              {k.description && <p className="text-xs text-[#6B6560] mt-0.5 whitespace-pre-line">{k.description}</p>}
            </div>
            {isAnswered(k) && <Check size={15} className="text-[#C9A96E] shrink-0 self-center" />}
          </div>

          {isOpenVraag(k) ? (
            <div className="p-4 sm:p-5 space-y-2">
              <CommentField
                value={k.comment ?? ''}
                disabled={locked}
                rows={4}
                placeholder="Typ hier alles wat je nog kwijt wilt…"
                onSave={(comment) => {
                  if (comment !== (k.comment ?? '')) save(k, { comment })
                }}
              />
              {savingId === k.id && <p className="text-xs text-[#9A948D]">Opslaan…</p>}
            </div>
          ) : (
          <div className="p-4 sm:p-5 space-y-3">
            <div className={`grid gap-3 ${k.options.length > 2 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
              {k.options.map((o) => {
                const chosen = k.choice === o.id
                const dimmed = !!k.choice && !chosen
                return (
                  <div key={o.id} className="flex flex-col">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => save(k, { choice: chosen ? null : o.id })}
                      aria-pressed={chosen}
                      className={`flex-1 flex flex-col text-left rounded-xl border overflow-hidden transition-all ${
                        chosen ? 'border-[#1C1B19] ring-2 ring-[#1C1B19]' : 'border-[#DDD8D2]'
                      } ${!locked ? 'hover:border-[#C9A96E] active:scale-[0.98]' : ''} ${dimmed ? 'opacity-50' : ''}`}
                    >
                      {o.photo_url && (
                        <span className="relative block w-full aspect-[4/3] bg-[#F5F3EF]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={o.photo_url} alt={o.label} className="absolute inset-0 w-full h-full object-cover" />
                          {chosen && (
                            <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#1C1B19] flex items-center justify-center">
                              <Check size={14} className="text-white" strokeWidth={3} />
                            </span>
                          )}
                        </span>
                      )}
                      <span className="flex-1 flex items-start gap-1.5 px-3 py-2.5 text-sm text-[#1C1B19]">
                        {!o.photo_url && (
                          <span className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${chosen ? 'bg-[#1C1B19] border-[#1C1B19]' : 'border-[#B9B2A9]'}`}>
                            {chosen && <Check size={10} className="text-white" strokeWidth={3} />}
                          </span>
                        )}
                        <span className="flex-1">
                          {o.label}
                          {o.price != null && <span className={`block text-xs mt-0.5 ${o.price < 0 ? 'text-green-700' : 'text-[#8A6A2E]'}`}>{formatExtra(o.price)}</span>}
                        </span>
                      </span>
                    </button>
                    {o.link && (
                      <a href={o.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#8A6A2E] hover:underline">
                        <ExternalLink size={11} /> Meer informatie
                      </a>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              disabled={locked}
              onClick={() => save(k, { choice: k.choice === KEUZE_WEET_NIET ? null : KEUZE_WEET_NIET })}
              aria-pressed={k.choice === KEUZE_WEET_NIET}
              className={`w-full py-3 text-sm tracking-wide rounded-xl border transition-all ${
                k.choice === KEUZE_WEET_NIET
                  ? 'bg-[#1C1B19] border-[#1C1B19] text-white'
                  : `bg-white border-[#DDD8D2] text-[#1C1B19] enabled:hover:border-[#C9A96E] ${k.choice ? 'opacity-50' : ''}`
              }`}
            >
              Weet ik nog niet
            </button>

            {(k.choice || k.comment) && (
              <CommentField
                value={k.comment ?? ''}
                disabled={locked}
                onSave={(comment) => {
                  if (comment !== (k.comment ?? '')) save(k, { comment })
                }}
              />
            )}
            {savingId === k.id && <p className="text-xs text-[#9A948D]">Opslaan…</p>}
          </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Jouw keuzes</h2>
        <ul className="space-y-1.5 text-sm">
          {keuzes.map((k) => (
            <li key={k.id} className="flex flex-wrap gap-x-2">
              <span className="text-[#6B6560]">{k.title}</span>
              {isOpenVraag(k) ? (
                <span className={k.comment ? 'text-[#1C1B19] font-medium whitespace-pre-line' : 'text-[#9A948D] italic'}>{k.comment || 'Niet ingevuld'}</span>
              ) : (
                <span className={k.choice ? 'text-[#1C1B19] font-medium' : 'text-[#9A948D] italic'}>{choiceText(k) ?? 'Niet beantwoord'}</span>
              )}
            </li>
          ))}
        </ul>
        {showPrices && (
          <p className="text-sm text-[#1C1B19] border-t border-[#EFEBE6] pt-3">
            {extraLabel(totalExtra(keuzes))} van je keuzes: <span className="font-semibold">{formatEuro(Math.abs(totalExtra(keuzes)))}</span>
          </p>
        )}
        {submittedAt ? (
          <p className="text-sm text-green-700">
            Verstuurd op {new Date(submittedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}. Bedankt!
            Wil je nog iets wijzigen? Neem dan contact met ons op.
          </p>
        ) : (
          !readOnly && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={submit}
                disabled={submitting || remaining > 0}
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#1C1B19] text-white text-sm hover:bg-[#3d3a37] disabled:opacity-40 transition-colors"
              >
                {submitting ? 'Bezig…' : 'Definitief versturen'}
              </button>
              {remaining > 0 && (
                <p className="text-xs text-[#6B6560]">
                  Nog {remaining} {remaining === 1 ? 'vraag' : 'vragen'} te beantwoorden. Je keuzes worden
                  tussendoor al bewaard.
                </p>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function CommentField({
  value,
  disabled,
  onSave,
  rows = 2,
  placeholder = 'Opmerking (optioneel)',
}: {
  value: string
  disabled: boolean
  onSave: (value: string) => void
  rows?: number
  placeholder?: string
}) {
  const [text, setText] = useState(value)
  return (
    <textarea
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text.trim())}
      rows={rows}
      placeholder={placeholder}
      className="w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] disabled:bg-[#FAF9F7]"
    />
  )
}
