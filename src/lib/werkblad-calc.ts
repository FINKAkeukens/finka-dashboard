import { WerkbladCalcInputs, WerkbladPart, WerkbladRates } from './types'

export function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function newWerkbladPart(rates: WerkbladRates): WerkbladPart {
  return {
    id: uid(),
    material_id: rates.materials[0]?.id ?? '',
    length: 3000,
    depth: 600,
    thickness: 20,
    cutouts: { kookplaat: false, spoelbak: false, kraan: false },
  }
}

// Fallback als de werkblad-tarievenrij (nog) niet geladen kon worden — zelfde
// waarden als de DB-defaults. Gedeeld tussen QuoteEditor en de Configurator
// zodat beide altijd hetzelfde vangnet gebruiken.
export const DEFAULT_WERKBLAD_RATES: WerkbladRates = {
  id: '',
  materials: [{ id: 'default', name: 'Composiet – CEBIN (mat.+rand)', price_per_m2: 320 }],
  cutouts: { kookplaat: 120, spoelbak: 260, kraan: 32 },
  thicknesses: [
    { mm: 4, surcharge: 0 }, { mm: 12, surcharge: 0 }, { mm: 20, surcharge: 0 },
    { mm: 25, surcharge: 0 }, { mm: 30, surcharge: 0 }, { mm: 38, surcharge: 0 },
  ],
  hoekverbinding: 0,
  inmeten: 0,
  montage: 0,
  transport: 0,
  updated_at: '',
}

export function defaultWerkbladCalcInputs(rates: WerkbladRates): WerkbladCalcInputs {
  return {
    parts: [newWerkbladPart(rates)],
    marge_percentage: 0,
    btw_enabled: false,
    btw_percentage: 21,
  }
}

export function depthBand(depthMm: number): string {
  if (depthMm <= 600) return 't/m 60cm'
  if (depthMm <= 1000) return 't/m 100cm'
  if (depthMm <= 1200) return 't/m 120cm'
  return '> 120cm'
}

export interface WerkbladPartCalc {
  area: number
  meters: number
  perM2: number
  materialCost: number
  cutoutCost: number
  total: number
  matName: string
  band: string
}

export function computeWerkbladPart(part: WerkbladPart, rates: WerkbladRates): WerkbladPartCalc {
  const mat = rates.materials.find((m) => m.id === part.material_id)
  const thick = rates.thicknesses.find((t) => Number(t.mm) === Number(part.thickness))
  const area = ((Number(part.length) || 0) / 1000) * ((Number(part.depth) || 0) / 1000)
  const meters = (Number(part.length) || 0) / 1000
  const perM2 = (mat ? Number(mat.price_per_m2) : 0) + (thick ? Number(thick.surcharge) : 0)
  const materialCost = area * perM2
  let cutoutCost = 0
  ;(['kookplaat', 'spoelbak', 'kraan'] as const).forEach((c) => {
    if (part.cutouts[c]) cutoutCost += Number(rates.cutouts[c]) || 0
  })
  return {
    area,
    meters,
    perM2,
    materialCost,
    cutoutCost,
    total: round2(materialCost + cutoutCost),
    matName: mat ? mat.name : '— geen materiaal —',
    band: depthBand(Number(part.depth) || 0),
  }
}

export interface WerkbladCalcTotals {
  parts: { part: WerkbladPart; calc: WerkbladPartCalc }[]
  totalArea: number
  bladTotaal: number
  koppelingKosten: number
  inmeten: number
  montage: number
  transport: number
  kostprijs: number
  verkoop: number
  btwBedrag: number
  totaal: number
}

export function computeWerkbladTotals(inputs: WerkbladCalcInputs, rates: WerkbladRates): WerkbladCalcTotals {
  const parts = inputs.parts.map((part) => ({ part, calc: computeWerkbladPart(part, rates) }))
  const totalArea = round2(parts.reduce((s, p) => s + p.calc.area, 0))
  const bladTotaal = round2(parts.reduce((s, p) => s + p.calc.total, 0))
  const extraJoints = Math.max(0, inputs.parts.length - 1)
  const koppelingKosten = round2(extraJoints * (Number(rates.hoekverbinding) || 0))
  const inmeten = round2(Number(rates.inmeten) || 0)
  const montage = round2(Number(rates.montage) || 0)
  const transport = round2(Number(rates.transport) || 0)
  const kostprijs = round2(bladTotaal + koppelingKosten + inmeten + montage + transport)
  const verkoop = round2(kostprijs * (1 + (Number(inputs.marge_percentage) || 0) / 100))
  const btwBedrag = inputs.btw_enabled ? round2(verkoop * ((Number(inputs.btw_percentage) || 0) / 100)) : 0
  const totaal = round2(verkoop + btwBedrag)
  return { parts, totalArea, bladTotaal, koppelingKosten, inmeten, montage, transport, kostprijs, verkoop, btwBedrag, totaal }
}

// Klantvriendelijke regels per deel — in dezelfde toon als de AI-samenvatting
// van een leveranciers-PDF, zodat beide werkblad-routes naar hetzelfde soort
// tekst in de klantversie leiden.
export function werkbladSummaryLines(totals: WerkbladCalcTotals): string[] {
  return totals.parts.map(({ calc }, i) => {
    const label = totals.parts.length > 1 ? `Werkblad deel ${i + 1}` : 'Werkblad'
    return `${label}: ${calc.matName}, ${calc.area.toFixed(2)} m²`
  })
}

export function formatEUR(n: number) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
}
