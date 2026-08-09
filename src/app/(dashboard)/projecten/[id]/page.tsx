export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import EditProjectForm from './EditProjectForm'
import TabBar from './TabBar'
import ComingSoonTab from './ComingSoonTab'
import HistoryTab from './HistoryTab'
import QuoteEditor from './offerte/QuoteEditor'
import PlanningTab from './PlanningTab'
import NotesPanel from './NotesPanel'
import ProjectNotesButton from './ProjectNotesButton'
import { Appliance, EurolineRates, Project, ProjectMilestone, ProjectStatus, Quote, QuoteItem, WerkbladRates } from '@/lib/types'

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab = 'offerte' } = await searchParams
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('finka_projects')
    .select('*, customer:finka_customers(id, first_name, last_name), status:finka_project_statuses(id, label, color)')
    .eq('id', id)
    .single() as { data: Project | null }

  if (!project) notFound()

  const { data: statuses } = await supabase
    .from('finka_project_statuses')
    .select('*')
    .order('sort_order') as { data: ProjectStatus[] | null }

  const { data: customers } = await supabase
    .from('finka_customers')
    .select('id, first_name, last_name')
    .order('first_name')

  let historyEntries: Array<{ id: string; field_name: string | null; old_value: string | null; new_value: string | null; action: string; changed_by: string | null; changed_at: string }> = []
  if (tab === 'historie') {
    const { data } = await supabase
      .from('finka_audit_log')
      .select('*')
      .eq('table_name', 'finka_projects')
      .eq('record_id', id)
      .order('changed_at', { ascending: false })
    historyEntries = data ?? []
  }

  let milestones: ProjectMilestone[] = []
  if (tab === 'planning') {
    const { data } = await supabase
      .from('finka_project_milestones')
      .select('*')
      .eq('project_id', id)
      .order('sort_order')
    milestones = (data ?? []) as ProjectMilestone[]
  }

  let quote: Quote | null = null
  let quoteItems: QuoteItem[] = []
  let appliances: Appliance[] = []
  let eurolineRates: EurolineRates | null = null
  let werkbladRates: WerkbladRates | null = null
  if (tab === 'offerte') {
    const [{ data: quoteData }, { data: applianceData }, { data: ratesData }, { data: werkbladRatesData }] = await Promise.all([
      supabase
        .from('finka_quotes')
        .select('*')
        .eq('project_id', id)
        .is('archived_at', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('finka_appliances').select('*').is('archived_at', null).order('brand'),
      supabase.from('finka_euroline_rates').select('*').limit(1).maybeSingle(),
      supabase.from('finka_werkblad_rates').select('*').limit(1).maybeSingle(),
    ])
    quote = quoteData as Quote | null
    appliances = (applianceData ?? []) as Appliance[]
    eurolineRates = ratesData as EurolineRates | null
    werkbladRates = werkbladRatesData as WerkbladRates | null

    if (quote) {
      const { data: itemsData } = await supabase
        .from('finka_quote_items')
        .select('*')
        .eq('quote_id', quote.id)
        .order('sort_order')
      quoteItems = (itemsData ?? []) as QuoteItem[]
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/projecten" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar projecten
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-[#1C1B19]">{project.title}</h1>
          {project.status && (
            <span
              className="text-xs px-2 py-0.5 rounded-full border"
              style={{ borderColor: project.status.color, color: project.status.color }}
            >
              {project.status.label}
            </span>
          )}
        </div>
        <p className="text-sm font-mono text-[#6B6560]">{project.reference_number}</p>
        {project.customer && (
          <Link href={`/klanten/${project.customer.id}`} className="text-sm text-[#C9A96E] hover:underline">
            {project.customer.first_name} {project.customer.last_name} →
          </Link>
        )}
      </div>

      <div className="mb-6">
        <EditProjectForm project={project} statuses={statuses ?? []} customers={customers ?? []} />
      </div>

      <TabBar activeTab={tab} />

      {tab === 'historie' ? (
        <HistoryTab entries={historyEntries} />
      ) : tab === 'offerte' ? (
        <QuoteEditor projectId={id} quote={quote} items={quoteItems} appliances={appliances} eurolineRates={eurolineRates} werkbladRates={werkbladRates} />
      ) : tab === 'planning' ? (
        <PlanningTab projectId={id} milestones={milestones} />
      ) : tab === 'notities' ? (
        <NotesPanel projectId={id} />
      ) : (
        <ComingSoonTab
          moduleName={
            { klantkeuzes: 'Klantkeuzes (moodboard)', facturen: 'Facturen', documenten: 'Documenten' }[tab] ?? 'Deze module'
          }
        />
      )}

      {tab !== 'notities' && <ProjectNotesButton projectId={id} />}
    </div>
  )
}
