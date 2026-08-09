import { differenceInCalendarDays } from 'date-fns'
import { MilestoneKey, MilestoneStatus, ProjectMilestone } from './types'

// Vaste volgorde van de 5 standaardmijlpalen — 'custom'-items staan hier
// bewust niet in, die worden los toegevoegd/verwijderd per project.
export const MILESTONE_ORDER: Exclude<MilestoneKey, 'custom'>[] = [
  'kennismaking', 'meting', 'bespreken_eerste_offerte', 'bespreken_finale_offerte',
  'bestelling', 'levering', 'montage_start', 'oplevering',
]

export const MILESTONE_LABELS: Record<Exclude<MilestoneKey, 'custom'>, string> = {
  kennismaking: 'Kennismaking',
  meting: 'Meting',
  bespreken_eerste_offerte: 'Bespreken eerste offerte',
  bespreken_finale_offerte: 'Bespreken finale offerte',
  bestelling: 'Bestelling geplaatst',
  levering: 'Verwachte levering',
  montage_start: 'Montage start',
  oplevering: 'Oplevering',
}

// Vaste mijlpalen hebben een vast label; 'custom'-items dragen hun eigen,
// vrij getypte label mee.
export function milestoneLabel(m: Pick<ProjectMilestone, 'milestone_key' | 'label'>): string {
  if (m.milestone_key === 'custom') return m.label?.trim() || 'Aangepast item'
  return MILESTONE_LABELS[m.milestone_key]
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  gepland: 'Gepland',
  bevestigd: 'Bevestigd',
  klaar: 'Klaar',
}

// Zelfde kleurtaal als de bestaande project-statussen (finka_project_statuses:
// Lead #9CA3AF, Gepland #3B82F6, Akkoord #22C55E) — geen nieuwe kleurcode
// erbij verzinnen voor hetzelfde soort "voortgang"-signaal.
export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  gepland: '#9CA3AF',
  bevestigd: '#3B82F6',
  klaar: '#22C55E',
}

// Gedeelde urgentie-kleur: verlopen = rood, binnen een week = goud, verder
// weg = neutraal. Gebruikt door zowel de projectenlijst als de Planning-tab,
// zodat "wat is dringend" er overal hetzelfde uitziet.
export function urgencyClass(dateStr: string): string {
  const days = differenceInCalendarDays(new Date(dateStr), new Date())
  if (days < 0) return 'text-red-600 font-medium'
  if (days <= 7) return 'text-[#8A6A2E] font-medium'
  return 'text-[#6B6560]'
}
