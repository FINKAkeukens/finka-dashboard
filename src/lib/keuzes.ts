import { KEUZE_WEET_NIET, KeuzeOption, ProjectKeuze } from './types'

export function formatEuro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n)
}

// Meer- of minderprijs met teken: "+ € 250" of "− € 150".
export function formatExtra(n: number) {
  return `${n < 0 ? '−' : '+'} ${formatEuro(Math.abs(n))}`
}

// "Meerprijs" of "Minderprijs" voor een totaal.
export function extraLabel(n: number) {
  return n < 0 ? 'Minderprijs' : 'Meerprijs'
}

// De gekozen optie-id's. Bij een vraag met meerdere antwoorden staan ze
// komma-gescheiden in choice (id's zijn uuid's, zonder komma).
export function selectedIds(k: Pick<ProjectKeuze, 'choice'>): string[] {
  return k.choice ? k.choice.split(',').filter(Boolean) : []
}

export function chosenOptions(k: Pick<ProjectKeuze, 'options' | 'choice'>): KeuzeOption[] {
  const ids = selectedIds(k)
  return k.options.filter((o) => ids.includes(o.id))
}

export function choiceText(k: Pick<ProjectKeuze, 'options' | 'choice'>): string | null {
  if (!k.choice) return null
  if (k.choice === KEUZE_WEET_NIET) return 'Weet ik nog niet'
  const labels = chosenOptions(k).map((o) => o.label)
  return labels.length ? labels.join(', ') : null
}

// Optelling van de meer-/minderprijzen van de gekozen opties.
export function totalExtra(keuzes: Pick<ProjectKeuze, 'options' | 'choice'>[]): number {
  return keuzes.reduce((sum, k) => sum + chosenOptions(k).reduce((s, o) => s + (o.price ?? 0), 0), 0)
}

export function hasPrices(keuzes: Pick<ProjectKeuze, 'options'>[]): boolean {
  return keuzes.some((k) => k.options.some((o) => o.price != null))
}

// Open vraag (bv. "Zijn we nog iets vergeten?"): geen opties, de klant
// typt zelf een antwoord (in comment). Niet verplicht voor versturen.
export const OPEN_VRAAG_TITLE = 'Zijn we nog iets vergeten?'

export function isOpenVraag(k: Pick<ProjectKeuze, 'options'>): boolean {
  return k.options.length === 0
}

export function isAnswered(k: Pick<ProjectKeuze, 'options' | 'choice' | 'comment'>): boolean {
  return isOpenVraag(k) ? !!k.comment?.trim() : !!k.choice
}
