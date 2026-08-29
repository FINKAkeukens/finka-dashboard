export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { QuestionnaireCategoryItem, QuestionnaireTemplateQuestion } from '@/lib/types'
import QuestionnaireTemplateForm from './QuestionnaireTemplateForm'

export default async function VragenlijstInstellingenPage() {
  const supabase = await createClient()
  const [{ data: categories }, { data: questions }] = await Promise.all([
    supabase.from('finka_questionnaire_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_questionnaire_templates').select('*').order('sort_order', { ascending: true }),
  ])

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Vragenlijst</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Dit zijn de vragen die klanten te zien krijgen in het klantportaal. Een nieuwe vraag verschijnt direct bij
          alle projecten — dit is bewust geen momentopname zoals de checklist, want bij een vragenlijst wil je
          alsnog een antwoord ook als de vraag er later bij komt.
        </p>
      </div>
      <QuestionnaireTemplateForm
        initialCategories={(categories ?? []) as QuestionnaireCategoryItem[]}
        initialQuestions={(questions ?? []) as QuestionnaireTemplateQuestion[]}
      />
    </div>
  )
}
