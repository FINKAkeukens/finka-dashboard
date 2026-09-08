export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import EditProjectForm from './EditProjectForm'
import TabBar from './TabBar'
import ComingSoonTab from './ComingSoonTab'
import HistoryTab from './HistoryTab'
import DocumentenTab from './DocumentenTab'
import QuoteEditor from './offerte/QuoteEditor'
import ConfiguratorTab from './ConfiguratorTab'
import PlanningTab from './PlanningTab'
import ChecklistTab from './ChecklistTab'
import VragenlijstTab from './VragenlijstTab'
import FinancieelTab from './FinancieelTab'
import AansluitschemaTab from './AansluitschemaTab'
import NotesPanel from './NotesPanel'
import ProjectNotesButton from './ProjectNotesButton'
import PortalActivityPanel from './PortalActivityPanel'
import { Appliance, ChecklistItem, ConfiguratorOption, ConfiguratorScenario, ConnectionItem, ConnectionSchema, EurolineRates, Project, ProjectFinancialItem, ProjectMilestone, ProjectStatus, QuestionnaireCategoryItem, QuestionnaireResponse, QuestionnaireTemplateQuestion, Quote, QuoteDownload, QuoteItem, WerkbladRates, PortalActivity, ProjectDocument } from '@/lib/types'
import { leadTimeDays } from '@/lib/planning'
import { formatProjectDate, isOnHold, onHoldDays, projectDates, projectPhaseRows } from '@/lib/project-dates'

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

  // Bronnen voor de automatische mijlpaaldatums (akkoord/montage/afronding) —
  // zie projectDates() in src/lib/project-dates.ts. Altijd ophalen, want de
  // tijdlijn staat bovenaan bij elk tabblad.
  const [{ data: akkoordQuote }, { data: timelineMilestonesData }] = await Promise.all([
    supabase
      .from('finka_quotes')
      .select('akkoord_at')
      .eq('project_id', id)
      .not('akkoord_at', 'is', null)
      .order('akkoord_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('finka_project_milestones')
      .select('milestone_key, date')
      .eq('project_id', id)
      .in('milestone_key', ['montage_start', 'oplevering']),
  ])
  // Nog niet gezien door staff — voedt het meldingenblok bovenaan.
  const { data: portalActivityData } = await supabase
    .from('finka_portal_activity')
    .select('*')
    .eq('project_id', id)
    .is('seen_at', null)
    .order('created_at', { ascending: false })
  const portalActivity = (portalActivityData ?? []) as PortalActivity[]

  const dates = projectDates(project, {
    quoteAkkoordAt: (akkoordQuote as { akkoord_at: string | null } | null)?.akkoord_at,
    milestones: (timelineMilestonesData ?? []) as Pick<ProjectMilestone, 'milestone_key' | 'date'>[],
  })

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

  let checklistItems: ChecklistItem[] = []
  if (tab === 'checklist') {
    const { data } = await supabase
      .from('finka_checklist_items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order')
    checklistItems = (data ?? []) as ChecklistItem[]
  }

  let questionnaireCategories: QuestionnaireCategoryItem[] = []
  let questionnaireQuestions: QuestionnaireTemplateQuestion[] = []
  let questionnaireResponses: QuestionnaireResponse[] = []
  if (tab === 'vragenlijst') {
    const [{ data: categoriesData }, { data: questionsData }, { data: responsesData }] = await Promise.all([
      supabase.from('finka_questionnaire_categories').select('*').order('sort_order'),
      supabase.from('finka_questionnaire_templates').select('*').order('sort_order'),
      supabase.from('finka_questionnaire_responses').select('*').eq('project_id', id),
    ])
    questionnaireCategories = (categoriesData ?? []) as QuestionnaireCategoryItem[]
    questionnaireQuestions = (questionsData ?? []) as QuestionnaireTemplateQuestion[]
    questionnaireResponses = (responsesData ?? []) as QuestionnaireResponse[]
  }

  let financialItems: ProjectFinancialItem[] = []
  let financialBtwPercentage = 21
  if (tab === 'financieel') {
    const [{ data: financialsData }, { data: latestQuote }] = await Promise.all([
      supabase.from('finka_project_financials').select('*').eq('project_id', id),
      supabase
        .from('finka_quotes')
        .select('btw_percentage')
        .eq('project_id', id)
        .is('archived_at', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    financialItems = (financialsData ?? []) as ProjectFinancialItem[]
    financialBtwPercentage = (latestQuote as { btw_percentage: number } | null)?.btw_percentage ?? 21
  }

  let connectionItems: ConnectionItem[] = []
  let connectionSchema: ConnectionSchema | null = null
  let vooraanzichtUrls: string[] = []
  if (tab === 'aansluitschema') {
    const [{ data: itemsData }, { data: schemaData }, { data: latestQuote }] = await Promise.all([
      supabase.from('finka_connection_items').select('*').eq('project_id', id).order('sort_order'),
      supabase.from('finka_connection_schema').select('*').eq('project_id', id).maybeSingle(),
      supabase
        .from('finka_quotes')
        .select('vooraanzicht_urls')
        .eq('project_id', id)
        .is('archived_at', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    connectionItems = (itemsData ?? []) as ConnectionItem[]
    connectionSchema = schemaData as ConnectionSchema | null
    vooraanzichtUrls = (latestQuote as { vooraanzicht_urls: string[] | null } | null)?.vooraanzicht_urls ?? []
  }

  let documentDownloads: QuoteDownload[] = []
  let projectDocuments: ProjectDocument[] = []
  if (tab === 'documenten') {
    const [{ data: quotesForProject }, { data: documentsData }] = await Promise.all([
      supabase.from('finka_quotes').select('id').eq('project_id', id),
      supabase
        .from('finka_project_documents')
        .select('*')
        .eq('project_id', id)
        .order('uploaded_at', { ascending: false }),
    ])
    projectDocuments = (documentsData ?? []) as ProjectDocument[]
    const quoteIds = (quotesForProject ?? []).map((q) => q.id)
    if (quoteIds.length) {
      const { data } = await supabase
        .from('finka_quote_downloads')
        .select('*')
        .in('quote_id', quoteIds)
        .order('downloaded_at', { ascending: false })
      documentDownloads = (data ?? []) as QuoteDownload[]
    }
  }

  let quote: Quote | null = null
  let quoteItems: QuoteItem[] = []
  let quoteDownloads: QuoteDownload[] = []
  let appliances: Appliance[] = []
  let eurolineRates: EurolineRates | null = null
  let werkbladRates: WerkbladRates | null = null
  let configuratorOptions: ConfiguratorOption[] = []
  let configuratorScenarios: ConfiguratorScenario[] = []
  if (tab === 'offerte' || tab === 'configurator') {
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

    if (quote && tab === 'offerte') {
      const [{ data: itemsData }, { data: downloadsData }] = await Promise.all([
        supabase.from('finka_quote_items').select('*').eq('quote_id', quote.id).order('sort_order'),
        supabase.from('finka_quote_downloads').select('*').eq('quote_id', quote.id).order('downloaded_at', { ascending: false }),
      ])
      quoteItems = (itemsData ?? []) as QuoteItem[]
      quoteDownloads = (downloadsData ?? []) as QuoteDownload[]
    }

    if (quote && tab === 'configurator') {
      const [{ data: optionsData }, { data: scenariosData }] = await Promise.all([
        supabase.from('finka_configurator_options').select('*').eq('quote_id', quote.id).order('sort_order'),
        supabase.from('finka_configurator_scenarios').select('*').eq('quote_id', quote.id).order('sort_order'),
      ])
      configuratorOptions = (optionsData ?? []) as ConfiguratorOption[]
      configuratorScenarios = (scenariosData ?? []) as ConfiguratorScenario[]
    }
  }

  return (
    <div className="p-8 max-w-7xl">
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

        {/* Tijdlijn: eerste contact → akkoord → montage → afronding, met per
            fase de doorlooptijd sinds de vorige. De laatste drie datums komen
            automatisch uit offerte/Planning tenzij handmatig ingevuld — zie
            projectDates() in src/lib/project-dates.ts. */}
        <div className="mt-4 bg-white rounded-xl border border-[#DDD8D2] overflow-hidden max-w-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2] text-xs text-[#6B6560]">
                <th className="text-left px-5 py-2 font-medium">Fase</th>
                <th className="text-left px-5 py-2 font-medium">Datum</th>
                <th className="text-right px-5 py-2 font-medium">Doorlooptijd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE9]">
              {projectPhaseRows(dates).map((row) => (
                <tr key={row.label}>
                  <td className="px-5 py-2 text-[#6B6560]">{row.label}</td>
                  <td className={`px-5 py-2 ${row.date ? 'text-[#1C1B19]' : 'text-[#9A948D]'}`}>
                    {formatProjectDate(row.date)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-[#6B6560]">
                    {row.daysSincePrevious !== null ? `${row.daysSincePrevious} dagen` : '—'}
                  </td>
                </tr>
              ))}
              {/* Ligt het project stil, dan telt die tijd los mee — tot
                  vandaag, want er is geen einddatum zolang het on hold staat. */}
              {isOnHold(project) && (
                <tr>
                  <td className="px-5 py-2 text-[#C9A96E]">On hold sinds</td>
                  <td className={`px-5 py-2 ${project.on_hold_since ? 'text-[#1C1B19]' : 'text-[#9A948D]'}`}>
                    {formatProjectDate(project.on_hold_since)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-[#6B6560]">
                    {onHoldDays(project.on_hold_since) !== null ? `${onHoldDays(project.on_hold_since)} dagen` : '—'}
                  </td>
                </tr>
              )}
            </tbody>
            {project.first_contact_date && (
              <tfoot>
                <tr className="border-t border-[#DDD8D2] bg-[#F7F5F2]">
                  <td className="px-5 py-2 text-xs font-medium text-[#1C1B19]" colSpan={2}>
                    {dates.afronding.date ? 'Totale doorlooptijd' : 'Loopt nu'}
                  </td>
                  <td className="px-5 py-2 text-right text-xs font-medium tabular-nums text-[#1C1B19]">
                    {dates.afronding.date
                      ? `${leadTimeDays(project.first_contact_date) - leadTimeDays(dates.afronding.date)} dagen`
                      : `${leadTimeDays(project.first_contact_date)} dagen`}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <PortalActivityPanel activity={portalActivity} />

      <div className="mb-6">
        <EditProjectForm project={project} statuses={statuses ?? []} customers={customers ?? []} />
      </div>

      <TabBar activeTab={tab} />

      {tab === 'historie' ? (
        <HistoryTab entries={historyEntries} />
      ) : tab === 'configurator' ? (
        <ConfiguratorTab
          quote={quote}
          options={configuratorOptions}
          scenarios={configuratorScenarios}
          werkbladRates={werkbladRates}
          eurolineRates={eurolineRates}
          appliances={appliances}
        />
      ) : tab === 'offerte' ? (
        <QuoteEditor projectId={id} quote={quote} items={quoteItems} downloads={quoteDownloads} appliances={appliances} />
      ) : tab === 'financieel' ? (
        <FinancieelTab items={financialItems} btwPercentage={financialBtwPercentage} />
      ) : tab === 'planning' ? (
        <PlanningTab projectId={id} milestones={milestones} />
      ) : tab === 'checklist' ? (
        <ChecklistTab projectId={id} items={checklistItems} />
      ) : tab === 'vragenlijst' ? (
        <VragenlijstTab projectId={id} categories={questionnaireCategories} questions={questionnaireQuestions} responses={questionnaireResponses} />
      ) : tab === 'aansluitschema' ? (
        <AansluitschemaTab
          projectId={id}
          project={project}
          items={connectionItems}
          schema={connectionSchema}
          vooraanzichtUrls={vooraanzichtUrls}
        />
      ) : tab === 'notities' ? (
        <NotesPanel projectId={id} />
      ) : tab === 'documenten' ? (
        <DocumentenTab projectId={id} downloads={documentDownloads} documents={projectDocuments} />
      ) : (
        <ComingSoonTab
          moduleName={
            { klantkeuzes: 'Klantkeuzes (moodboard)', facturen: 'Facturen' }[tab] ?? 'Deze module'
          }
        />
      )}

      {tab !== 'notities' && <ProjectNotesButton projectId={id} />}
    </div>
  )
}
