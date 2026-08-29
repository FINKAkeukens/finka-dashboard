// Startlijst bedrijfskosten-categorieën voor de winst-en-verliesrekening
// (/financieel) — vrij uit te breiden, geen vaste database-constraint op
// deze waarden (zie migratie sectie 41).
export const EXPENSE_CATEGORIES = [
  'personeel',
  'huisvesting',
  'marketing',
  'vervoer',
  'verzekeringen',
  'overig',
] as const

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  personeel: 'Personeelskosten',
  huisvesting: 'Huisvesting/kantoor',
  marketing: 'Marketing/verkoop',
  vervoer: 'Vervoer/transport',
  verzekeringen: 'Verzekeringen',
  overig: 'Overige bedrijfskosten',
}

export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABELS[category] ?? category
}
