// Startlijst categorieën voor vaste activa (/financieel/kosten) — sluit aan
// bij de indeling die alvast op de Balans-pagina staat.
export const ASSET_CATEGORIES = [
  'inventaris',
  'apparatuur',
  'software',
  'overig',
] as const

export const ASSET_CATEGORY_LABELS: Record<string, string> = {
  inventaris: 'Inventaris',
  apparatuur: 'Apparatuur/bedrijfsmiddelen',
  software: 'Software/IT',
  overig: 'Overige vaste activa',
}

export function assetCategoryLabel(category: string): string {
  return ASSET_CATEGORY_LABELS[category] ?? category
}
