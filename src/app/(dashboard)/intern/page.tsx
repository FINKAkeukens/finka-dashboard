export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Assignee, InternalInspiration, InternalNote, ProjectMilestone } from '@/lib/types'
import InternView from './InternView'

// FINKA intern: alles wat over het bedrijf en het dashboard zelf gaat, los
// van projecten — to do's (de algemene taken, ook zichtbaar in een eigen vak
// op /planning), aantekeningen en inspiratie.
export default async function InternPage() {
  const supabase = await createClient()
  const [{ data: todos }, { data: notes }, { data: inspiration }, { data: assignees }] = await Promise.all([
    supabase.from('finka_project_milestones').select('*').is('project_id', null).order('sort_order'),
    supabase.from('finka_internal_notes').select('*').order('updated_at', { ascending: false }),
    supabase.from('finka_internal_inspiration').select('*').order('created_at', { ascending: false }),
    supabase.from('finka_assignees').select('*').order('sort_order'),
  ])

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">FINKA intern</h1>
        <p className="text-sm text-[#6B6560] mt-1">To do&apos;s, aantekeningen en inspiratie voor het bedrijf zelf.</p>
      </div>
      <InternView
        initialTodos={(todos ?? []) as ProjectMilestone[]}
        initialNotes={(notes ?? []) as InternalNote[]}
        initialInspiration={(inspiration ?? []) as InternalInspiration[]}
        assignees={(assignees ?? []) as Assignee[]}
      />
    </div>
  )
}
