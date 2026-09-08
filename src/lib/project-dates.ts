import { Project, ProjectMilestone } from './types'

// De tijdlijn van een project: eerste contact → akkoord → montage →
// afronding. Alleen first_contact_date is puur handmatig; de andere drie
// komen automatisch uit de offerte/Planning, tenzij staff er per project
// een eigen datum invult (zie de *_date-kolommen, migratie-sectie 61).
//
// Deze samenvoeging staat bewust op één plek, zodat de projectpagina, de
// projectenlijst en toekomstige rapportages nooit uit elkaar kunnen lopen.
export type ProjectDateSource = 'handmatig' | 'automatisch'

export interface ProjectDate {
  date: string | null
  source: ProjectDateSource
}

export interface ProjectDates {
  eersteContact: ProjectDate
  akkoord: ProjectDate
  montage: ProjectDate
  afronding: ProjectDate
}

// Een timestamp (akkoord_at) terugbrengen tot een kale datum, zodat 'm
// naast de DATE-kolommen hetzelfde oogt en rekent.
function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

function pick(manual: string | null, automatic: string | null): ProjectDate {
  if (manual) return { date: manual, source: 'handmatig' }
  return { date: toDateOnly(automatic), source: 'automatisch' }
}

export function projectDates(
  project: Project,
  {
    quoteAkkoordAt,
    milestones,
  }: {
    quoteAkkoordAt?: string | null
    milestones?: Pick<ProjectMilestone, 'milestone_key' | 'date'>[]
  } = {}
): ProjectDates {
  const milestoneDate = (key: string) =>
    milestones?.find((m) => m.milestone_key === key)?.date ?? null

  return {
    eersteContact: { date: project.first_contact_date, source: 'handmatig' },
    akkoord: pick(project.akkoord_date, quoteAkkoordAt ?? null),
    montage: pick(project.montage_date, milestoneDate('montage_start')),
    afronding: pick(project.afronding_date, milestoneDate('oplevering')),
  }
}

export function formatProjectDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// De status waarop een project als "stilliggend" geldt. Statussen zijn data
// (finka_project_statuses), dus we herkennen 'm op label — hier op één plek,
// zodat een hernoeming maar op één plek hoeft te worden nagelopen.
export const ON_HOLD_STATUS_LABEL = 'On hold'

export function isOnHold(project: Pick<Project, 'status'>): boolean {
  return project.status?.label === ON_HOLD_STATUS_LABEL
}

// Aantal dagen dat een project al stilligt (tot vandaag). Null zolang de
// begindatum niet bekend is.
export function onHoldDays(onHoldSince: string | null): number | null {
  if (!onHoldSince) return null
  return daysBetween(onHoldSince, new Date().toISOString().slice(0, 10))
}

export interface ProjectPhaseRow {
  label: string
  date: string | null
  // Dagen sinds de vorige ingevulde fase — null bij de eerste rij, of zolang
  // er nog geen datum bekend is.
  daysSincePrevious: number | null
}

// De tijdlijn als rijen, met per fase de doorlooptijd sinds de vórige fase.
// Ontbreekt een tussenliggende datum (bv. akkoord nog leeg terwijl montage
// al gepland is), dan rekent de volgende fase door vanaf de laatste datum
// die wél bekend is — zo blijft de optelsom kloppen.
export function projectPhaseRows(dates: ProjectDates): ProjectPhaseRow[] {
  const phases: { label: string; date: string | null }[] = [
    { label: 'Eerste contact', date: dates.eersteContact.date },
    { label: 'Akkoord offerte', date: dates.akkoord.date },
    { label: 'Montage', date: dates.montage.date },
    { label: 'Afronding', date: dates.afronding.date },
  ]

  let previous: string | null = null
  return phases.map(({ label, date }) => {
    const daysSincePrevious = date && previous ? daysBetween(previous, date) : null
    if (date) previous = date
    return { label, date, daysSincePrevious }
  })
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

// Gemiddelde doorlooptijd van één traject (bv. eerste contact → akkoord)
// over alle projecten waar béide datums bekend zijn. Projecten waar dat nog
// niet zo is tellen niet mee — anders zou een halfafgerond project het
// gemiddelde kunstmatig omlaag trekken.
export interface AverageSegment {
  days: number | null
  projectCount: number
}

export function averageDays(
  allDates: ProjectDates[],
  from: keyof ProjectDates,
  to: keyof ProjectDates
): AverageSegment {
  const spans = allDates
    .map((d) => {
      const start = d[from].date
      const end = d[to].date
      return start && end ? daysBetween(start, end) : null
    })
    .filter((v): v is number => v !== null)

  if (spans.length === 0) return { days: null, projectCount: 0 }
  return {
    days: Math.round(spans.reduce((sum, v) => sum + v, 0) / spans.length),
    projectCount: spans.length,
  }
}
