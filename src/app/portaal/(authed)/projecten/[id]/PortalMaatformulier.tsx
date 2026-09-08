'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import type { MaatformulierItem, MaatformulierSignoff } from '@/lib/types'
import {
  answerOptions,
  categoriesInOrder,
  isItemVisible,
  itemsInTreeOrder,
  MAATFORMULIER_OTHER_OPTION,
  parseKeuzeAnswer,
  serializeKeuzeAnswer,
} from '@/lib/maatformulier'

// Het formulier "Voorbereiding ruimte gereed" zoals de klant het invult. Antwoorden slaan per
// veld op (keuzeknoppen meteen, tekstvelden bij verlaten), net als de
// vragenlijst — en onderaan tekent de klant voor het geheel.
export default function PortalMaatformulier({
  projectId,
  items,
  signoff: initialSignoff,
}: {
  projectId: string
  items: MaatformulierItem[]
  signoff: MaatformulierSignoff | null
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.answer ?? '']))
  )
  const itemsById = new Map(items.map((i) => [i.id, i]))
  const [signoff, setSignoff] = useState<MaatformulierSignoff | null>(initialSignoff)
  const [signing, setSigning] = useState(false)
  // Ondertekenen kan pas als de klant het akkoordvinkje heeft gezet — de
  // knop blijft tot die tijd uitgeschakeld.
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')

  async function save(itemId: string, answer: string) {
    setError('')
    try {
      const res = await fetch('/api/portaal/maatformulier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, answer }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Opslaan mislukt')
      }
    } catch {
      setError('Opslaan mislukt')
    }
  }

  function updateLocal(itemId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [itemId]: value }))
  }

  function choose(item: MaatformulierItem, option: string) {
    const current = parseKeuzeAnswer(answers[item.id] ?? '')
    // Nogmaals op dezelfde knop klikken maakt de keuze weer ongedaan.
    const nextOption = current.option === option ? '' : option
    // Bij een andere keuze vervalt een eerder ingetypt eigen antwoord.
    const nextOther = nextOption === MAATFORMULIER_OTHER_OPTION ? current.other : ''
    const next = serializeKeuzeAnswer({ option: nextOption, other: nextOther })

    // Sub-vragen die door dit antwoord verdwijnen, ook leegmaken — anders
    // blijft er een antwoord staan bij een vraag die niet meer gesteld wordt,
    // en dat zou staff als geldig gegeven te zien krijgen.
    const nextAnswers = { ...answers, [item.id]: next }
    const clearedIds = items
      .filter(
        (i) =>
          i.parent_id &&
          (nextAnswers[i.id] ?? '') !== '' &&
          !isItemVisible(i, itemsById, (id) => nextAnswers[id] ?? '')
      )
      .map((i) => i.id)

    setAnswers({ ...nextAnswers, ...Object.fromEntries(clearedIds.map((id) => [id, ''])) })
    save(item.id, next)
    clearedIds.forEach((id) => save(id, ''))
  }

  function updateOtherText(itemId: string, other: string) {
    updateLocal(itemId, serializeKeuzeAnswer({ option: MAATFORMULIER_OTHER_OPTION, other }))
  }

  async function sign() {
    if (!agreed) return
    setSigning(true)
    setError('')
    try {
      const res = await fetch('/api/portaal/maatformulier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signProjectId: projectId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Ondertekenen mislukt')
        return
      }
      setSignoff({ project_id: projectId, signed_at: data.signed_at, signed_by: data.signed_by })
    } catch {
      setError('Ondertekenen mislukt')
    } finally {
      setSigning(false)
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 text-center">
        Er staat nog geen formulier klaar voor dit project.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {categoriesInOrder(items).map((category) => {
        // Sub-vragen verschijnen pas zodra de vraag erboven het bijbehorende
        // antwoord heeft (zie migratie-sectie 67) — een kopje dat daardoor
        // helemaal leeg is, laten we ook weg.
        const catItems = itemsInTreeOrder(
          items.filter((i) => i.category === category)
        )
          .filter(({ item }) => isItemVisible(item, itemsById, (id) => answers[id] ?? ''))
        if (!catItems.length) return null
        return (
          <div key={category} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <h2 className="text-sm font-medium text-[#1C1B19]">{category}</h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              {catItems.map(({ item, depth }) => {
                const options = answerOptions(item)
                return (
                  <div
                    key={item.id}
                    // Sub-vragen springen in en krijgen een lijntje, zodat
                    // zichtbaar is dat ze bij de vraag erboven horen.
                    style={depth ? { marginLeft: depth * 16, paddingLeft: 12, borderLeft: '2px solid #E6E2D9' } : undefined}
                  >
                    {item.type === 'afspraak' ? (
                      <p className="text-sm text-[#1C1B19]">· {item.label}</p>
                    ) : (
                      <>
                        <label className="block text-sm font-medium text-[#1C1B19] mb-1.5">{item.label}</label>
                        {options.length > 0 ? (
                          <div>
                            <div className="flex flex-wrap gap-2">
                              {options.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={!!signoff}
                                  onClick={() => choose(item, option)}
                                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
                                    parseKeuzeAnswer(answers[item.id] ?? '').option === option
                                      ? 'bg-[#1C1B19] border-[#1C1B19] text-white'
                                      : 'bg-white border-[#DDD8D2] text-[#1C1B19] hover:border-[#C9A96E]'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                            {parseKeuzeAnswer(answers[item.id] ?? '').option === MAATFORMULIER_OTHER_OPTION && (
                              <input
                                autoFocus
                                value={parseKeuzeAnswer(answers[item.id] ?? '').other}
                                disabled={!!signoff}
                                onChange={(e) => updateOtherText(item.id, e.target.value)}
                                onBlur={() => save(item.id, answers[item.id] ?? '')}
                                placeholder="Vul hier je antwoord in..."
                                className="mt-2 w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] disabled:bg-[#F7F5F2]"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type={item.type === 'getal' ? 'number' : 'text'}
                              value={answers[item.id] ?? ''}
                              disabled={!!signoff}
                              onChange={(e) => updateLocal(item.id, e.target.value)}
                              onBlur={() => save(item.id, answers[item.id] ?? '')}
                              className="w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] disabled:bg-[#F7F5F2]"
                            />
                            {item.unit && <span className="text-sm text-[#6B6560] shrink-0">{item.unit}</span>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {signoff ? (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-900">
          <CheckCircle2 size={15} />
          Ondertekend door {signoff.signed_by} op{' '}
          {new Date(signoff.signed_at).toLocaleString('nl-NL', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[#DDD8D2] bg-white px-5 py-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[#1C1B19]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#DDD8D2] accent-[#1C1B19]"
            />
            Met ondertekening van dit document gaat u akkoord met bovenstaande gegevens en afspraken.
          </label>
          <Button onClick={sign} disabled={signing || !agreed}>
            {signing ? 'Bezig...' : 'Onderteken'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
