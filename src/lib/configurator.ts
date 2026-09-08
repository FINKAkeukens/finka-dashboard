import { Appliance, CostBreakdownItem, CostCategoryKey, QuoteCustomerCategory, QuoteCustomerSection } from './types'
import { TYPE_LABELS as APPLIANCE_TYPE_LABELS, getSpecSummary } from './appliance-utils'

// Kostprijs-opbouw-startpunt voor een gloednieuwe offerte — zelfde array als
// de DEFAULT_COST_BREAKDOWN in QuoteEditor.tsx. Hier gedeeld zodat "Toepassen
// op Offerte" ook werkt op een offerte die nog nooit in het Offerte-tabblad
// bewaard is (dus nog geen cost_breakdown in de database heeft).
export const DEFAULT_COST_BREAKDOWN: CostBreakdownItem[] = [
  { key: 'keukenkastjes', label: 'Keukenkastjes', werkelijke_kosten: 0, werkelijke_kosten_source: 'auto', marge_percentage: 75, marge_percentage_source: 'def' },
  { key: 'apparatuur', label: 'Apparatuur', werkelijke_kosten: 0, werkelijke_kosten_source: 'auto', marge_percentage: 0, marge_percentage_source: 'def' },
  { key: 'werkblad', label: 'Aanrechtblad', werkelijke_kosten: 0, werkelijke_kosten_source: 'auto', marge_percentage: 25, marge_percentage_source: 'def' },
  { key: 'accessoires', label: 'Accessoires', werkelijke_kosten: 0, werkelijke_kosten_source: 'def', marge_percentage: 10, marge_percentage_source: 'def' },
  { key: 'inmeten', label: 'Inmeten', werkelijke_kosten: 250, werkelijke_kosten_source: 'def', marge_percentage: 0, marge_percentage_source: 'def' },
  { key: 'opslag', label: 'Opslag', werkelijke_kosten: 139.75, werkelijke_kosten_source: 'def', marge_percentage: 0, marge_percentage_source: 'def' },
  { key: 'levering', label: 'Levering', werkelijke_kosten: 360.25, werkelijke_kosten_source: 'def', marge_percentage: 0, marge_percentage_source: 'def' },
  { key: 'installatie', label: 'Installatie', werkelijke_kosten: 0, werkelijke_kosten_source: 'def', marge_percentage: 0, marge_percentage_source: 'def' },
  { key: 'service', label: 'Service', werkelijke_kosten: 250, werkelijke_kosten_source: 'def', marge_percentage: 0, marge_percentage_source: 'def' },
]

// Zelfde tekst-opbouw als voorheen in QuoteEditor's applianceCustomerText —
// alle relevante specs, nooit de prijs (die blijft uitsluitend intern).
export function applianceCustomerText(appliance: Appliance): string {
  const typeLabel = APPLIANCE_TYPE_LABELS[appliance.type] ?? appliance.type
  const specSummary = getSpecSummary(appliance)
  return `${typeLabel} — ${appliance.brand} ${appliance.model}${specSummary !== '—' ? ` (${specSummary})` : ''}`
}

export interface KastenDiscount {
  key: string
  label: string
  percentage: number
}

// Vaste, standaard inkoopkortingen op de Kasten-kostprijs — één betaalkorting
// per keukenmerk. Op een optie is normaliter maar één van de twee van
// toepassing (het merk van die specifieke optie). key blijft ongewijzigd
// t.o.v. de oude, generiekere namen ("kuchentreff_sachsen"/"betaalkorting")
// — alleen het label is hernoemd, zodat al opgeslagen aanvinkingen (o.a. bij
// bestaande Sachsen-opties) geldig blijven zonder migratie.
export const KASTEN_DISCOUNTS: KastenDiscount[] = [
  { key: 'kuchentreff_sachsen', label: 'Sachsen betaalkorting', percentage: 11 },
  { key: 'betaalkorting', label: 'Artego betaalkorting', percentage: 5 },
]

// Past de aangevinkte kortingen ná elkaar toe (elke korting over het bedrag
// ná de vorige, niet gewoon opgeteld). Volgorde maakt voor het resultaat
// niets uit (vermenigvuldigen is commutatief) — relevant is vooral dat het
// geen simpele optelling is.
export function computeKastenNetCostTotal(grossCostTotal: number, discountKeys: string[]): number {
  const active = KASTEN_DISCOUNTS.filter((d) => discountKeys.includes(d.key))
  const net = active.reduce((amount, d) => amount * (1 - d.percentage / 100), grossCostTotal)
  return Math.round(net * 100) / 100
}

// Zet één categorie in de kostprijs-opbouw op een expliciet toegepast bedrag
// ('in': een bewuste keuze via "Toepassen op Offerte", geen live/automatische
// waarde meer).
export function patchCostRow(rows: CostBreakdownItem[], key: CostCategoryKey, werkelijke_kosten: number): CostBreakdownItem[] {
  return rows.map((r) => (r.key === key ? { ...r, werkelijke_kosten, werkelijke_kosten_source: 'in' as const } : r))
}

// Vervangt de regels van deze klantversie-categorie volledig — zelfde
// "eerste match, vervang of maak aan"-gedrag als replaceSectionLines in
// QuoteEditor, maar als pure functie zodat "Toepassen op Offerte" 'm kan
// gebruiken zonder dat de Offerte-pagina zelf geopend hoeft te zijn.
export function replaceCategoryLines(
  sections: QuoteCustomerSection[],
  category: QuoteCustomerCategory,
  defaultTitle: string,
  lines: string[]
): QuoteCustomerSection[] {
  const idx = sections.findIndex((s) => s.category === category)
  const newLines = lines.map((text) => ({ text, included: true }))
  if (idx === -1) return [...sections, { category, title: defaultTitle, lines: newLines }]
  return sections.map((s, i) => (i === idx ? { ...s, lines: newLines } : s))
}
