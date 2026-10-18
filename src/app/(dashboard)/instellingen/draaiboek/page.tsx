export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Assignee, ChecklistCategoryItem, ChecklistTemplateItem, ProjectStatus } from '@/lib/types'
import DraaiboekForm from './DraaiboekForm'

export default async function DraaiboekInstellingenPage() {
  const supabase = await createClient()
  const [{ data: categories }, { data: templates }, { data: statuses }, { data: assignees }] = await Promise.all([
    supabase.from('finka_checklist_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_checklist_templates').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_project_statuses').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_assignees').select('*').order('sort_order', { ascending: true }),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Draaiboek</h1>
        <p className="text-sm text-[#6B6560] mt-1 max-w-3xl">
          Fases en standaardstappen: naam, volgorde, termijn en toewijzing. Wijzigingen slaan direct op en gelden voor
          nieuwe projecten en voor stappen die nog niet zijn vrijgegeven. Een nieuwe fasenaam geldt direct voor alle
          projecten.
        </p>
      </div>
      <DraaiboekForm
        initialCategories={(categories ?? []) as ChecklistCategoryItem[]}
        initialTemplates={(templates ?? []) as ChecklistTemplateItem[]}
        statuses={(statuses ?? []) as ProjectStatus[]}
        initialAssignees={(assignees ?? []) as Assignee[]}
      />
    </div>
  )
}
