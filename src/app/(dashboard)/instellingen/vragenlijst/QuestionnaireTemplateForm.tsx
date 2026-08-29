'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { QuestionnaireCategoryItem, QuestionnaireQuestionType, QuestionnaireTemplateQuestion } from '@/lib/types'
import { MULTI_SELECT_OTHER_OPTION, QUESTIONNAIRE_TYPE_LABELS } from '@/lib/questionnaire'

// Zelfde aanpak als ChecklistTemplateForm: elke wijziging slaat direct op,
// kopjes (categorieën) en de vragen erbinnen zijn allebei aan te passen.
export default function QuestionnaireTemplateForm({
  initialCategories,
  initialQuestions,
}: {
  initialCategories: QuestionnaireCategoryItem[]
  initialQuestions: QuestionnaireTemplateQuestion[]
}) {
  const supabase = createClient()
  const [categories, setCategories] = useState<QuestionnaireCategoryItem[]>(initialCategories)
  const [questions, setQuestions] = useState<QuestionnaireTemplateQuestion[]>(initialQuestions)
  const [addingQuestionFor, setAddingQuestionFor] = useState<string | null>(null)
  const [newQuestion, setNewQuestion] = useState('')
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null)
  const [newOption, setNewOption] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [error, setError] = useState('')

  const orderedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  function questionsFor(categoryId: string) {
    return questions.filter((q) => q.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  }

  // --- Vragen binnen een kopje ---------------------------------------------

  function updateLocal(id: string, question: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, question } : q)))
  }

  async function saveQuestion(item: QuestionnaireTemplateQuestion) {
    if (!item.question.trim()) {
      setError('Een vraag mag niet leeg zijn.')
      return
    }
    const { error: updError } = await supabase
      .from('finka_questionnaire_templates')
      .update({ question: item.question.trim(), updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updError) setError(updError.message)
  }

  async function updateType(id: string, type: QuestionnaireQuestionType) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, type } : q)))
    const { error: updError } = await supabase
      .from('finka_questionnaire_templates')
      .update({ type, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function addQuestion(categoryId: string) {
    if (!newQuestion.trim()) {
      setAddingQuestionFor(null)
      return
    }
    const maxOrder = questionsFor(categoryId).reduce((max, q) => Math.max(max, q.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_questionnaire_templates')
      .insert({ category_id: categoryId, question: newQuestion.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setQuestions((prev) => [...prev, data as QuestionnaireTemplateQuestion])
    setNewQuestion('')
    setAddingQuestionFor(null)
  }

  async function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
    const { error: delError } = await supabase.from('finka_questionnaire_templates').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  async function moveQuestion(categoryId: string, id: string, direction: -1 | 1) {
    const ordered = questionsFor(categoryId)
    const index = ordered.findIndex((q) => q.id === id)
    const swapWith = ordered[index + direction]
    if (!swapWith) return
    const current = ordered[index]
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id === current.id) return { ...q, sort_order: swapWith.sort_order }
        if (q.id === swapWith.id) return { ...q, sort_order: current.sort_order }
        return q
      })
    )
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from('finka_questionnaire_templates').update({ sort_order: swapWith.sort_order }).eq('id', current.id),
      supabase.from('finka_questionnaire_templates').update({ sort_order: current.sort_order }).eq('id', swapWith.id),
    ])
    if (err1 || err2) setError((err1 ?? err2)!.message)
  }

  // --- Opties van een multi_select-vraag -----------------------------------

  async function saveOptions(questionId: string, options: string[]) {
    setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, options } : q)))
    const { error: updError } = await supabase
      .from('finka_questionnaire_templates')
      .update({ options, updated_at: new Date().toISOString() })
      .eq('id', questionId)
    if (updError) setError(updError.message)
  }

  function addOption(questionId: string) {
    if (!newOption.trim()) {
      setAddingOptionFor(null)
      return
    }
    if (newOption.trim().toLowerCase().startsWith('anders')) {
      setError(`"${MULTI_SELECT_OTHER_OPTION}" wordt al automatisch bij elke vraag toegevoegd — geen aparte optie nodig.`)
      return
    }
    const q = questions.find((q) => q.id === questionId)
    if (q) saveOptions(questionId, [...q.options, newOption.trim()])
    setNewOption('')
    setAddingOptionFor(null)
  }

  function removeOption(questionId: string, index: number) {
    const q = questions.find((q) => q.id === questionId)
    if (q) saveOptions(questionId, q.options.filter((_, i) => i !== index))
  }

  // --- Kopjes (categorieën) zelf --------------------------------------------

  function updateLocalCategoryLabel(id: string, label: string) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }

  async function saveCategoryLabel(category: QuestionnaireCategoryItem) {
    if (!category.label.trim()) {
      setError('Een kopje mag niet leeg zijn.')
      return
    }
    const { error: updError } = await supabase
      .from('finka_questionnaire_categories')
      .update({ label: category.label.trim(), updated_at: new Date().toISOString() })
      .eq('id', category.id)
    if (updError) setError(updError.message)
  }

  async function addCategory() {
    if (!newCategoryLabel.trim()) {
      setAddingCategory(false)
      return
    }
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    const { data, error: insError } = await supabase
      .from('finka_questionnaire_categories')
      .insert({ label: newCategoryLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setCategories((prev) => [...prev, data as QuestionnaireCategoryItem])
    setNewCategoryLabel('')
    setAddingCategory(false)
  }

  async function removeCategory(category: QuestionnaireCategoryItem) {
    const count = questionsFor(category.id).length
    const warning = count > 0
      ? `Kopje "${category.label}" verwijderen? De ${count} vra(a)g(en) erbinnen worden dan ook verwijderd.`
      : `Kopje "${category.label}" verwijderen?`
    if (!confirm(warning)) return
    setCategories((prev) => prev.filter((c) => c.id !== category.id))
    setQuestions((prev) => prev.filter((q) => q.category_id !== category.id))
    const { error: delError } = await supabase.from('finka_questionnaire_categories').delete().eq('id', category.id)
    if (delError) setError(delError.message)
  }

  async function moveCategory(id: string, direction: -1 | 1) {
    const index = orderedCategories.findIndex((c) => c.id === id)
    const swapWith = orderedCategories[index + direction]
    if (!swapWith) return
    const current = orderedCategories[index]
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === current.id) return { ...c, sort_order: swapWith.sort_order }
        if (c.id === swapWith.id) return { ...c, sort_order: current.sort_order }
        return c
      })
    )
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from('finka_questionnaire_categories').update({ sort_order: swapWith.sort_order }).eq('id', current.id),
      supabase.from('finka_questionnaire_categories').update({ sort_order: current.sort_order }).eq('id', swapWith.id),
    ])
    if (err1 || err2) setError((err1 ?? err2)!.message)
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {orderedCategories.map((category, catIndex) => {
        const catQuestions = questionsFor(category.id)
        return (
          <div key={category.id} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
              <div className="flex flex-col -space-y-1 shrink-0">
                <button type="button" onClick={() => moveCategory(category.id, -1)} disabled={catIndex === 0} className="disabled:opacity-20" title="Kopje omhoog">
                  <ChevronUp size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
                <button type="button" onClick={() => moveCategory(category.id, 1)} disabled={catIndex === orderedCategories.length - 1} className="disabled:opacity-20" title="Kopje omlaag">
                  <ChevronDown size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                </button>
              </div>
              <input
                value={category.label}
                onChange={(e) => updateLocalCategoryLabel(category.id, e.target.value)}
                onBlur={() => saveCategoryLabel(category)}
                className="flex-1 text-sm font-medium bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] text-[#1C1B19]"
              />
              <button onClick={() => removeCategory(category)} title="Kopje verwijderen">
                <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>
            <div className="divide-y divide-[#DDD8D2]">
              {catQuestions.map((q, index) => (
                <div key={q.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col -space-y-1 shrink-0">
                      <button type="button" onClick={() => moveQuestion(category.id, q.id, -1)} disabled={index === 0} className="disabled:opacity-20" title="Omhoog">
                        <ChevronUp size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                      </button>
                      <button type="button" onClick={() => moveQuestion(category.id, q.id, 1)} disabled={index === catQuestions.length - 1} className="disabled:opacity-20" title="Omlaag">
                        <ChevronDown size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                      </button>
                    </div>
                    <input
                      value={q.question}
                      onChange={(e) => updateLocal(q.id, e.target.value)}
                      onBlur={() => saveQuestion(q)}
                      className="flex-1 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] text-[#1C1B19]"
                    />
                    <select
                      value={q.type}
                      onChange={(e) => updateType(q.id, e.target.value as QuestionnaireQuestionType)}
                      className="text-xs px-2 py-1.5 bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] shrink-0"
                    >
                      {(Object.keys(QUESTIONNAIRE_TYPE_LABELS) as QuestionnaireQuestionType[]).map((type) => (
                        <option key={type} value={type}>{QUESTIONNAIRE_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                    <button onClick={() => removeQuestion(q.id)} title="Vraag verwijderen">
                      <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  </div>

                  {q.type === 'multi_select' && (
                    <div className="mt-2 ml-7 flex flex-wrap items-center gap-1.5">
                      {q.options.map((opt, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-[#F7F5F2] border border-[#DDD8D2] rounded-full pl-2.5 pr-1.5 py-1 text-[#1C1B19]">
                          {opt}
                          <button onClick={() => removeOption(q.id, i)} title="Optie verwijderen">
                            <X size={11} className="text-[#9A948D] hover:text-red-600" />
                          </button>
                        </span>
                      ))}
                      {addingOptionFor === q.id ? (
                        <Input
                          autoFocus
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onBlur={() => addOption(q.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addOption(q.id)
                            if (e.key === 'Escape') { setAddingOptionFor(null); setNewOption('') }
                          }}
                          placeholder="Nieuwe optie..."
                          className="h-7 w-36 text-xs"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingOptionFor(q.id)}
                          className="text-xs text-[#6B6560] hover:text-[#1C1B19] flex items-center gap-1"
                        >
                          <Plus size={11} />
                          Optie
                        </button>
                      )}
                    </div>
                  )}
                  {q.type === 'multi_select' && (
                    <p className="mt-1.5 ml-7 text-xs text-[#9A948D]">
                      &quot;{MULTI_SELECT_OTHER_OPTION}&quot; wordt hier altijd automatisch bij getoond, met een invulveld voor de klant.
                    </p>
                  )}
                </div>
              ))}

              {addingQuestionFor === category.id ? (
                <div className="flex items-center gap-2 px-5 py-3">
                  <Input
                    autoFocus
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addQuestion(category.id)
                      if (e.key === 'Escape') { setAddingQuestionFor(null); setNewQuestion('') }
                    }}
                    placeholder="Nieuwe vraag..."
                    className="h-8 flex-1"
                  />
                  <Button size="sm" onClick={() => addQuestion(category.id)}>Toevoegen</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingQuestionFor(category.id)}
                  className="w-full flex items-center gap-1.5 px-5 py-3 text-xs text-[#6B6560] hover:text-[#1C1B19]"
                >
                  <Plus size={12} />
                  Vraag toevoegen
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] overflow-hidden">
        {addingCategory ? (
          <div className="flex items-center gap-2 px-5 py-3">
            <Input
              autoFocus
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCategory()
                if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryLabel('') }
              }}
              placeholder="Naam van nieuw kopje..."
              className="h-8 flex-1"
            />
            <Button size="sm" onClick={addCategory}>Toevoegen</Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="w-full flex items-center justify-center gap-1.5 px-5 py-3 text-sm text-[#6B6560] hover:text-[#1C1B19]"
          >
            <Plus size={14} />
            Kopje toevoegen
          </button>
        )}
      </div>
    </div>
  )
}
