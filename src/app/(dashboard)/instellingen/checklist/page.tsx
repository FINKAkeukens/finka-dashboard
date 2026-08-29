export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ChecklistCategoryItem, ChecklistTemplateItem } from '@/lib/types'
import ChecklistTemplateForm from './ChecklistTemplateForm'

export default async function ChecklistInstellingenPage() {
  const supabase = await createClient()
  const [{ data: categories }, { data: templates }] = await Promise.all([
    supabase.from('finka_checklist_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_checklist_templates').select('*').order('sort_order', { ascending: true }),
  ])

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Checklist-items</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Dit is het standaardlijstje voor de Checklist-tab bij projecten. Zowel de kopjes als de items erbinnen zijn
          aan te passen. Een wijziging hier geldt alleen voor checklists die vanaf nu worden aangemaakt — al
          aangemaakte project-checklists veranderen niet mee.
        </p>
      </div>
      <ChecklistTemplateForm
        initialCategories={(categories ?? []) as ChecklistCategoryItem[]}
        initialItems={(templates ?? []) as ChecklistTemplateItem[]}
      />
    </div>
  )
}
