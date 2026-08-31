'use client'

import { useState } from 'react'
import { Check, FileText, Image as ImageIcon, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuestionnaireCategoryItem, QuestionnaireTemplateQuestion } from '@/lib/types'
import {
  MULTI_SELECT_OTHER_OPTION,
  parseFileAnswer,
  parseMultiSelectAnswer,
  QUESTIONNAIRE_FILE_ACCEPT,
  QUESTIONNAIRE_FILE_MAX_BYTES,
  QuestionnaireFile,
  serializeFileAnswer,
  serializeMultiSelectAnswer,
} from '@/lib/questionnaire'

// Tekstvelden slaan op bij verlaten (onBlur), checkboxen/bestanden meteen
// bij klikken/uploaden — zelfde gevoel als de rest van het dashboard.
// Schrijft via /api/portaal/antwoord (en, voor bestanden, /api/portaal/
// upload), nooit rechtstreeks naar Supabase vanuit de klant-browser.
export default function PortalQuestionnaireForm({
  projectId,
  categories,
  questions,
  initialAnswers,
}: {
  projectId: string
  categories: QuestionnaireCategoryItem[]
  questions: QuestionnaireTemplateQuestion[]
  initialAnswers: Record<string, string>
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save(questionId: string, answer: string): Promise<boolean> {
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/portaal/antwoord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, questionId, answer }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Opslaan mislukt')
        return false
      }
      return true
    } catch {
      setError('Opslaan mislukt')
      return false
    }
  }

  // De knop hieronder is vooral bedoeld als geruststelling (elk veld slaat
  // al zelfstandig op bij verlaten/aanklikken) — schrijft voor de zekerheid
  // alsnog alles in één keer weg, ook een veld waar de klant nog in aan het
  // typen was zonder er al uit geklikt te hebben.
  async function saveAll() {
    setSaving(true)
    setSaved(false)
    const results = await Promise.all(questions.map((q) => save(q.id, answers[q.id] ?? '')))
    setSaving(false)
    if (results.every(Boolean)) setSaved(true)
  }

  function updateLocal(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function toggleOption(questionId: string, option: string) {
    const current = parseMultiSelectAnswer(answers[questionId] ?? '')
    const isSelected = current.selected.includes(option)
    const nextSelected = isSelected ? current.selected.filter((v) => v !== option) : [...current.selected, option]
    // Vinkje "Anders, namelijk..." uit? Dan ook het eigen antwoord wissen —
    // anders blijft er een tekst hangen die niet meer bij een aangevinkt
    // hokje hoort.
    const nextOther = option === MULTI_SELECT_OTHER_OPTION && isSelected ? '' : current.other
    const serialized = serializeMultiSelectAnswer({ selected: nextSelected, other: nextOther })
    updateLocal(questionId, serialized)
    save(questionId, serialized)
  }

  function updateOtherText(questionId: string, other: string) {
    const current = parseMultiSelectAnswer(answers[questionId] ?? '')
    updateLocal(questionId, serializeMultiSelectAnswer({ ...current, other }))
  }

  function saveOtherText(questionId: string) {
    save(questionId, answers[questionId] ?? '')
  }

  async function uploadFile(questionId: string, file: File) {
    setError('')
    if (file.size > QUESTIONNAIRE_FILE_MAX_BYTES) {
      setError('Bestand is groter dan 20MB.')
      return
    }
    setUploading(questionId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)
      formData.append('questionId', questionId)
      const res = await fetch('/api/portaal/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Uploaden mislukt')
        return
      }
      const current = parseFileAnswer(answers[questionId] ?? '')
      const next: QuestionnaireFile[] = [...current, { url: data.url, name: data.name }]
      const serialized = serializeFileAnswer(next)
      updateLocal(questionId, serialized)
      save(questionId, serialized)
    } finally {
      setUploading(null)
    }
  }

  function removeFile(questionId: string, index: number) {
    const current = parseFileAnswer(answers[questionId] ?? '')
    const serialized = serializeFileAnswer(current.filter((_, i) => i !== index))
    updateLocal(questionId, serialized)
    save(questionId, serialized)
  }

  if (questions.length === 0) return null

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-4">
      {orderedCategories.map((category) => {
        const catQuestions = questions
          .filter((q) => q.category_id === category.id)
          .sort((a, b) => a.sort_order - b.sort_order)
        if (catQuestions.length === 0) return null
        return (
          <div key={category.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <h2 className="text-sm font-medium text-[#1C1B19]">{category.label}</h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              {catQuestions.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-[#1C1B19] mb-1.5">{q.question}</label>
                  {q.type === 'multi_select' ? (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {[...q.options, MULTI_SELECT_OTHER_OPTION].map((option) => {
                          const checked = parseMultiSelectAnswer(answers[q.id] ?? '').selected.includes(option)
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => toggleOption(q.id, option)}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                checked
                                  ? 'bg-[#1C1B19] border-[#1C1B19] text-white'
                                  : 'bg-white border-[#DDD8D2] text-[#1C1B19] hover:border-[#C9A96E]'
                              }`}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                      {parseMultiSelectAnswer(answers[q.id] ?? '').selected.includes(MULTI_SELECT_OTHER_OPTION) && (
                        <input
                          autoFocus
                          value={parseMultiSelectAnswer(answers[q.id] ?? '').other}
                          onChange={(e) => updateOtherText(q.id, e.target.value)}
                          onBlur={() => saveOtherText(q.id)}
                          placeholder="Vul hier je antwoord in..."
                          className="mt-2 w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                        />
                      )}
                    </div>
                  ) : q.type === 'lange_tekst' ? (
                    <textarea
                      value={answers[q.id] ?? ''}
                      onChange={(e) => updateLocal(q.id, e.target.value)}
                      onBlur={() => save(q.id, answers[q.id] ?? '')}
                      rows={4}
                      className="w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
                    />
                  ) : q.type === 'bestand' ? (
                    <div className="space-y-2">
                      {parseFileAnswer(answers[q.id] ?? '').map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-[#F7F5F2] border border-[#DDD8D2] rounded-lg px-3 py-2">
                          {f.name.toLowerCase().endsWith('.pdf') ? (
                            <FileText size={14} className="text-[#6B6560] shrink-0" />
                          ) : (
                            <ImageIcon size={14} className="text-[#6B6560] shrink-0" />
                          )}
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-[#1C1B19] hover:underline">
                            {f.name}
                          </a>
                          <button onClick={() => removeFile(q.id, i)} title="Verwijderen">
                            <X size={14} className="text-[#9A948D] hover:text-red-600" />
                          </button>
                        </div>
                      ))}
                      <label className="flex items-center gap-1.5 text-xs text-[#6B6560] hover:text-[#1C1B19] cursor-pointer w-fit">
                        <Upload size={13} />
                        {uploading === q.id ? 'Bezig met uploaden...' : 'Bestand toevoegen (jpg, png of pdf)'}
                        <input
                          type="file"
                          accept={QUESTIONNAIRE_FILE_ACCEPT}
                          className="hidden"
                          disabled={uploading === q.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) uploadFile(q.id, file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <input
                      value={answers[q.id] ?? ''}
                      onChange={(e) => updateLocal(q.id, e.target.value)}
                      onBlur={() => save(q.id, answers[q.id] ?? '')}
                      className="w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-3">
        <Button onClick={saveAll} disabled={saving}>
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-700">
            <Check size={14} />
            Opgeslagen
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
