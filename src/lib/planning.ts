import { differenceInCalendarDays } from 'date-fns'
import { MilestoneAssignee, MilestoneKey, MilestoneStatus, ProjectMilestone } from './types'

// Vaste toewijs-opties — team is klein genoeg om dit hard te coderen i.p.v.
// een aparte gebruikerslijst op te tuigen.
export const ASSIGNEE_OPTIONS: MilestoneAssignee[] = ['Kieke', 'Merel', 'Leverancier', 'FINKA']

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

// Vaste mijlpalen hebben een standaardlabel, maar zijn per project alsnog
// hernoembaar via het losse `label`-veld (bv. "Meting" -> "Inmeten keuken").
// 'custom'-items dragen sowieso hun eigen, vrij getypte label mee.
export function milestoneLabel(m: Pick<ProjectMilestone, 'milestone_key' | 'label'>): string {
  if (m.milestone_key === 'custom') return m.label?.trim() || 'Aangepast item'
  return m.label?.trim() || MILESTONE_LABELS[m.milestone_key]
}

// Vaste volgorde voor dropdowns — vroegste naar laatste stadium.
export const MILESTONE_STATUS_ORDER: MilestoneStatus[] = ['nog_doen', 'bezig', 'gepland', 'bevestigd', 'klaar']

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  nog_doen: 'Nog doen',
  gepland: 'Pending',
  bevestigd: 'Bevestigd',
  bezig: 'Ermee bezig',
  klaar: 'Klaar',
}

// Volle, verzadigde kleuren (geen pastels) zodat de statustekst even goed
// leesbaar is als gewone tekst — een lichte tint zoals voorheen bij "Nog
// doen" oogde op wit al snel doorzichtig/onleesbaar.
export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  nog_doen: '#6B6560',
  gepland: '#D97706',
  bevestigd: '#22C55E',
  bezig: '#2563EB',
  klaar: '#166534',
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
