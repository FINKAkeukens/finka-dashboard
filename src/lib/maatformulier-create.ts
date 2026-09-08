import type { SupabaseClient } from '@supabase/supabase-js'
import type { MaatformulierCategoryItem, MaatformulierItem, MaatformulierTemplateItem } from './types'

// Projectstatus waarbij het formulier automatisch wordt klaargezet: zodra de
// klant akkoord is, moet de voorbereiding van de ruimte gaan lopen.
export const AKKOORD_STATUS_LABEL = 'Akkoord'

export type CreateFormResult =
  | { status: 'created'; items: MaatformulierItem[] }
  // Er stond al een formulier — nooit overschrijven, daar hangen antwoorden
  // van de klant aan.
  | { status: 'exists' }
  | { status: 'no-template' }
  | { status: 'error'; message: string }

// Kopieert het sjabloon uit Instellingen naar één project. Gedeeld door de
// handmatige knop op het projecttabblad en de automatische aanmaak bij de
// status "Akkoord" (zie EditProjectForm), zodat beide wegen exact hetzelfde
// formulier opleveren — inclusief de sub-vraag-koppelingen.
export async function createMaatformulierForProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<CreateFormResult> {
  const { data: existing, error: existingError } = await supabase
    .from('finka_maatformulier_items')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)
  if (existingError) return { status: 'error', message: existingError.message }
  if (existing?.length) return { status: 'exists' }

  const [{ data: categories, error: catError }, { data: template, error: tplError }] = await Promise.all([
    supabase.from('finka_maatformulier_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_maatformulier_templates').select('*').order('sort_order', { ascending: true }),
  ])
  if (catError || tplError) return { status: 'error', message: (catError ?? tplError)!.message }

  const categoryItems = (categories ?? []) as MaatformulierCategoryItem[]
  const templateItems = (template ?? []) as MaatformulierTemplateItem[]
  if (categoryItems.length === 0 || templateItems.length === 0) return { status: 'no-template' }

  const categoryOrder = new Map(categoryItems.map((c, index) => [c.id, index]))
  const categoryLabels = new Map(categoryItems.map((c) => [c.id, c.label]))
  const sorted = [...templateItems].sort((a, b) => {
    const catDiff = (categoryOrder.get(a.category_id) ?? 0) - (categoryOrder.get(b.category_id) ?? 0)
    return catDiff !== 0 ? catDiff : a.sort_order - b.sort_order
  })

  // Id's vooraf zelf genereren, zodat de ouder-kind-koppelingen van het
  // sjabloon (sub-vragen, zie migratie-sectie 67) in dezelfde insert kunnen
  // worden meegegeven — anders zouden we de nieuwe id's pas ná het
  // wegschrijven kennen en een tweede ronde updates nodig hebben.
  const newIdByTemplateId = new Map(sorted.map((t) => [t.id, crypto.randomUUID()]))
  const rows = sorted.map((t, index) => ({
    id: newIdByTemplateId.get(t.id)!,
    project_id: projectId,
    category: categoryLabels.get(t.category_id) ?? 'Overig',
    label: t.label,
    type: t.type,
    options: t.options,
    unit: t.unit,
    parent_id: t.parent_id ? newIdByTemplateId.get(t.parent_id) ?? null : null,
    show_when_answer: t.show_when_answer,
    sort_order: index,
  }))

  const { data, error: insError } = await supabase.from('finka_maatformulier_items').insert(rows).select()
  if (insError) return { status: 'error', message: insError.message }
  return { status: 'created', items: (data ?? []) as MaatformulierItem[] }
}
