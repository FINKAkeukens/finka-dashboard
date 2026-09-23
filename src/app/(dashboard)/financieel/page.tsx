export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import PnlView, { ProjectFigures, Totals, YearData } from './PnlView'
import { isCancelled } from '@/lib/project-dates'

// Eén geaccordeerde offerte, met net genoeg projectgegevens om 'm in de
// tabel te tonen — geen volledig Quote-type nodig voor deze pagina.
interface AkkoordQuoteRow {
  id: string
  project_id: string
  akkoord_at: string | null
  created_at: string
  total_price: number
  customer_price: number | null
  subtotal: number
  btw_percentage: number
  project: {
    id: string
    reference_number: string
    title: string
    customer_id: string
    // Handmatige akkoorddatum uit de projecttijdlijn; die heeft voorrang op
    // het akkoord-tijdstip van de offerte, zodat dit overzicht het project in
    // dezelfde maand zet als de tijdlijn op de projectpagina.
    akkoord_date: string | null
    status: { label: string } | null
    customer: { id: string; first_name: string; last_name: string } | null
  } | null
}

// Testprojecten (titel "Test" of klant "Test Test") tellen niet mee in het
// financieel overzicht projecten — die zijn alleen om het systeem uit te proberen.
function isTestProject(project: NonNullable<AkkoordQuoteRow['project']>) {
  const isTest = (s: string | null | undefined) => (s ?? '').trim().toLowerCase() === 'test'
  return isTest(project.title) || (isTest(project.customer?.first_name) && isTest(project.customer?.last_name))
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function emptyTotals(): Totals {
  return { omzetInclBtw: 0, omzetExclBtw: 0, kostprijs: 0, margeExclBtw: 0, werkelijkeKosten: 0, margeWerkelijk: 0, aantal: 0 }
}

function addToTotals(t: Totals, p: ProjectFigures): Totals {
  return {
    omzetInclBtw: t.omzetInclBtw + p.omzetInclBtw,
    omzetExclBtw: t.omzetExclBtw + p.omzetExclBtw,
    kostprijs: t.kostprijs + p.kostprijs,
    margeExclBtw: t.margeExclBtw + p.margeExclBtw,
    werkelijkeKosten: t.werkelijkeKosten + p.werkelijkeKosten,
    margeWerkelijk: t.margeWerkelijk + p.margeWerkelijk,
    aantal: t.aantal + 1,
  }
}

export default async function FinancieelPage() {
  const supabase = await createClient()

  const [{ data }, { data: expensesData }, { data: settingsData }, { data: financialsData }] = await Promise.all([
    supabase
      .from('finka_quotes')
      .select(
        'id, project_id, akkoord_at, created_at, total_price, customer_price, subtotal, btw_percentage, project:finka_projects(id, reference_number, title, customer_id, akkoord_date, status:finka_project_statuses(label), customer:finka_customers(id, first_name, last_name))'
      )
      .eq('status', 'akkoord')
      .is('archived_at', null),
    supabase.from('finka_operating_expenses').select('expense_date, bedrag'),
    supabase.from('finka_financial_settings').select('*').limit(1).maybeSingle(),
    supabase.from('finka_project_financials').select('project_id, begroot_bedrag, werkelijk_bedrag'),
  ])

  // Geannuleerde projecten tellen niet mee in de omzet/marge — de offerte
  // stond wel op akkoord, maar het werk gaat niet door.
  const rows = ((data ?? []) as unknown as AkkoordQuoteRow[]).filter(
    (r) => !!r.project && !isTestProject(r.project) && !isCancelled(r.project)
  )
  const belastingPercentage = (settingsData as { belasting_percentage: number } | null)?.belasting_percentage ?? 21

  // Werkelijke kosten per project — zelfde bron en terugval als het
  // Financieel-tabblad van een project: zolang er niets is ingevuld geldt het
  // begrote bedrag. Een project zonder rijen (bv. geaccordeerd vóór dat
  // tabblad bestond) valt verderop terug op de kostprijs uit de offerte.
  const werkelijkByProject = new Map<string, number>()
  for (const f of (financialsData ?? []) as { project_id: string; begroot_bedrag: number; werkelijk_bedrag: number | null }[]) {
    const bedrag = Number(f.werkelijk_bedrag ?? f.begroot_bedrag ?? 0)
    werkelijkByProject.set(f.project_id, round2((werkelijkByProject.get(f.project_id) ?? 0) + bedrag))
  }

  const projects: ProjectFigures[] = rows
    .map((r) => {
      const omzetInclBtw = r.customer_price ?? r.total_price ?? 0
      const kostprijs = r.subtotal ?? 0
      const omzetExclBtw = omzetInclBtw / (1 + (r.btw_percentage ?? 21) / 100)
      const werkelijkeKosten = werkelijkByProject.get(r.project_id) ?? kostprijs
      // Zelfde volgorde als projectDates() in src/lib/project-dates.ts:
      // handmatige projectdatum vóór het akkoord-tijdstip van de offerte. Zo
      // staat een project hier in dezelfde maand als op zijn eigen tijdlijn.
      const date = new Date(r.project?.akkoord_date ?? r.akkoord_at ?? r.created_at)
      return {
        quoteId: r.id,
        projectId: r.project_id,
        reference: r.project?.reference_number ?? '—',
        title: r.project?.title ?? 'Onbekend project',
        customerName: r.project?.customer ? `${r.project.customer.first_name} ${r.project.customer.last_name}` : '—',
        dateLabel: format(date, 'd MMM yyyy', { locale: nl }),
        year: date.getFullYear(),
        monthKey: format(date, 'yyyy-MM'),
        monthLabel: format(date, 'MMMM', { locale: nl }),
        omzetInclBtw,
        omzetExclBtw,
        kostprijs,
        margeExclBtw: omzetExclBtw - kostprijs,
        werkelijkeKosten,
        margeWerkelijk: omzetExclBtw - werkelijkeKosten,
      }
    })
    .sort((a, b) => (a.dateLabel < b.dateLabel ? 1 : -1))

  // Groeperen: jaar → maand → projecten. Alleen jaren/maanden met
  // daadwerkelijk geaccordeerde offertes verschijnen.
  const years = new Map<number, { total: Totals; months: Map<string, { key: string; label: string; total: Totals; projects: ProjectFigures[] }> }>()

  for (const p of projects) {
    if (!years.has(p.year)) years.set(p.year, { total: emptyTotals(), months: new Map() })
    const yearEntry = years.get(p.year)!
    yearEntry.total = addToTotals(yearEntry.total, p)

    if (!yearEntry.months.has(p.monthKey)) {
      yearEntry.months.set(p.monthKey, { key: p.monthKey, label: p.monthLabel, total: emptyTotals(), projects: [] })
    }
    const monthEntry = yearEntry.months.get(p.monthKey)!
    monthEntry.total = addToTotals(monthEntry.total, p)
    monthEntry.projects.push(p)
  }

  // Bedrijfskosten-som per jaar — alleen het totaal nodig hier, de losse
  // regels/CRUD leven op /financieel/kosten.
  const expensesByYear = new Map<number, number>()
  for (const e of (expensesData ?? []) as { expense_date: string; bedrag: number }[]) {
    const y = new Date(e.expense_date).getFullYear()
    expensesByYear.set(y, round2((expensesByYear.get(y) ?? 0) + e.bedrag))
    if (!years.has(y)) years.set(y, { total: emptyTotals(), months: new Map() })
  }

  const yearData: YearData[] = [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, entry]) => ({
      year,
      total: entry.total,
      months: [...entry.months.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
      bedrijfskosten: expensesByYear.get(year) ?? 0,
    }))

  const grandTotal = projects.reduce((t, p) => addToTotals(t, p), emptyTotals())

  return (
    <PnlView
      years={yearData}
      grandTotal={grandTotal}
      initialBelastingPercentage={belastingPercentage}
    />
  )
}
