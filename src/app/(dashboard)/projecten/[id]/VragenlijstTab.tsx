'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, FileText, Image as ImageIcon } from 'lucide-react'
import { QuestionnaireCategoryItem, QuestionnaireResponse, QuestionnaireTemplateQuestion } from '@/lib/types'
import { multiSelectDisplayValues, parseFileAnswer, parseMultiSelectAnswer } from '@/lib/questionnaire'

// Alleen-lezen wat de antwoorden betreft — de klant vult dit zelf in via
// het klantportaal (/portaal/projecten/[id]) — maar het oog-icoontje per
// vraag is hier wél interactief: dat bepaalt of de klant deze vraag bij dít
// project te zien krijgt. Vragen zijn bewust live/gedeeld over projecten
// (geen sjabloon-kopie zoals bij de checklist), dus "verborgen" staat op de
// project+vraag-koppeling (finka_questionnaire_responses.hidden) i.p.v. op
// de vraag zelf.
export default function VragenlijstTab({
  projectId,
  categories,
  questions,
  responses: initialResponses,
}: {
  projectId: string
  categories: QuestionnaireCategoryItem[]
  questions: QuestionnaireTemplateQuestion[]
  responses: QuestionnaireResponse[]
}) {
  const supabase = createClient()
  const [responses, setResponses] = useState<QuestionnaireResponse[]>(initialResponses)
  const [error, setError] = useState('')

  const responseFor = (questionId: string) => responses.find((r) => r.question_id === questionId) ?? null

  async function toggleHidden(questionId: string) {
    const current = responseFor(questionId)
    const hidden = !current?.hidden
    setResponses((prev) => {
      if (current) return prev.map((r) => (r.question_id === questionId ? { ...r, hidden } : r))
      return [...prev, { id: `temp-${questionId}`, project_id: projectId, question_id: questionId, answer: null, hidden, created_at: '', updated_at: '' }]
    })
    const { error: updError } = await supabase
      .from('finka_questionnaire_responses')
      .upsert(
        { project_id: projectId, question_id: questionId, hidden, updated_at: new Date().toISOString() },
        { onConflict: 'project_id,question_id' }
      )
    if (updError) setError(updError.message)
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-[#6B6560] bg-white rounded-xl border border-dashed border-[#DDD8D2] p-8 text-center">
        Er staan nog geen vragen in de vragenlijst — stel deze in via Instellingen &gt; Vragenlijst.
      </p>
    )
  }

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {orderedCategories.map((category) => {
        const catQuestions = questions
          .filter((q) => q.category_id === category.id)
          .sort((a, b) => a.sort_order - b.sort_order)
        if (catQuestions.length === 0) return null
        return (
          <div key={category.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <h3 className="text-sm font-medium text-[#1C1B19]">{category.label}</h3>
            </div>
            <div className="divide-y divide-[#DDD8D2]">
              {catQuestions.map((q) => {
                const response = responseFor(q.id)
                const answer = response?.answer ?? null
                const hidden = response?.hidden ?? false
                const selected = q.type === 'multi_select' ? multiSelectDisplayValues(parseMultiSelectAnswer(answer)) : []
                const files = q.type === 'bestand' ? parseFileAnswer(answer) : []
                return (
                  <div key={q.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[#1C1B19]">{q.question}</p>
                      <button
                        onClick={() => toggleHidden(q.id)}
                        title={hidden ? 'Verborgen voor klant — klik om te tonen' : 'Zichtbaar voor klant — klik om te verbergen'}
                        className="shrink-0 mt-0.5"
                      >
                        {hidden ? (
                          <EyeOff size={14} className="text-[#C9A96E]" />
                        ) : (
                          <Eye size={14} className="text-[#9A948D] hover:text-[#1C1B19]" />
                        )}
                      </button>
                    </div>
                    {q.type === 'multi_select' ? (
                      selected.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {selected.map((opt) => (
                            <span key={opt} className="text-xs bg-[#F7F5F2] border border-[#DDD8D2] rounded-full px-2.5 py-1 text-[#1C1B19]">
                              {opt}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm mt-1 text-[#9A948D] italic">Nog niet beantwoord</p>
                      )
                    ) : q.type === 'bestand' ? (
                      files.length > 0 ? (
                        <div className="space-y-1.5 mt-1.5">
                          {files.map((f, i) => (
                            <a
                              key={i}
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[#1C1B19] hover:underline w-fit"
                            >
                              {f.name.toLowerCase().endsWith('.pdf') ? (
                                <FileText size={14} className="text-[#6B6560] shrink-0" />
                              ) : (
                                <ImageIcon size={14} className="text-[#6B6560] shrink-0" />
                              )}
                              {f.name}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm mt-1 text-[#9A948D] italic">Nog niet beantwoord</p>
                      )
                    ) : (
                      <p className={`text-sm mt-1 ${answer ? 'text-[#6B6560] whitespace-pre-line' : 'text-[#9A948D] italic'}`}>
                        {answer || 'Nog niet beantwoord'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
