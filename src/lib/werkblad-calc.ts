import { WerkbladCalcInputs, WerkbladCutout, WerkbladExtra, WerkbladMaterial, WerkbladPart, WerkbladRates, WerkbladServiceKey } from './types'

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
    cutouts: {},
  }
}

const DEFAULT_CUTOUT_NAMES: Record<string, string> = { kookplaat: 'Kookplaat', spoelbak: 'Spoelbak', kraan: 'Kraan (boring)' }

// Uitsparingen als lijst — uit cutout_list (migratie-sectie 98), of zolang
// die leeg is afgeleid uit het oude vaste trio in cutouts.
export function werkbladCutouts(rates: WerkbladRates): WerkbladCutout[] {
  if (rates.cutout_list?.length) return rates.cutout_list
  return (['kookplaat', 'spoelbak', 'kraan'] as const).map((id) => ({
    id, name: DEFAULT_CUTOUT_NAMES[id], amount: Number(rates.cutouts?.[id]) || 0,
  }))
}

export const WERKBLAD_SERVICE_FIELDS: { key: WerkbladServiceKey; label: string; unit: string }[] = [
  { key: 'hoekverbinding', label: 'Hoekverbinding', unit: 'per koppeling' },
  { key: 'inmeten', label: 'Inmeten', unit: 'vast bedrag' },
  { key: 'montage', label: 'Montage', unit: 'vast bedrag' },
  { key: 'transport', label: 'Transporttoeslag', unit: 'vast bedrag' },
]

export function werkbladServiceLabel(rates: WerkbladRates, key: WerkbladServiceKey): string {
  return rates.service_settings?.[key]?.name?.trim() || WERKBLAD_SERVICE_FIELDS.find((f) => f.key === key)!.label
}

// "Naam – Leverancier" voor keuzelijsten; de leverancier staat sinds sectie
// 98 los (oudere materialen hebben hem nog in de naam).
export function werkbladMaterialLabel(m: WerkbladMaterial): string {
  return m.supplier?.trim() ? `${m.name} – ${m.supplier.trim()}` : m.name
}

// Prijzen zoals ze in dit project gelden: bij een variabel tarief het in de
// rekentool ingevulde bedrag (rate_overrides), anders de prijs uit de
// instellingen. Alle berekeningen lopen hierlangs.
export function effectiveWerkbladRates(rates: WerkbladRates, inputs: Pick<WerkbladCalcInputs, 'rate_overrides'>): WerkbladRates {
  const o = inputs.rate_overrides ?? {}
  const pick = (variable: boolean | undefined, key: string, fallback: number) =>
    variable && typeof o[key] === 'number' ? o[key] : fallback
  const result: WerkbladRates = {
    ...rates,
    materials: rates.materials.map((m) => ({ ...m, price_per_m2: pick(m.variable, `material:${m.id}`, Number(m.price_per_m2) || 0) })),
    thicknesses: rates.thicknesses.map((t) => ({ ...t, surcharge: pick(t.variable, `thickness:${t.mm}`, Number(t.surcharge) || 0) })),
    cutout_list: werkbladCutouts(rates).map((c) => ({ ...c, amount: pick(c.variable, `cutout:${c.id}`, Number(c.amount) || 0) })),
  }
  for (const { key } of WERKBLAD_SERVICE_FIELDS) {
    result[key] = pick(rates.service_settings?.[key]?.variable, key, Number(rates[key]) || 0)
  }
  return result
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
  extras: [],
  cutout_list: [],
  service_settings: {},
  updated_at: '',
}

// Bedrag van één extra onderdeel in een project: bij een variabel onderdeel
// het per project ingevulde bedrag (anders het voorstel uit de instellingen),
// bij een vast onderdeel altijd het tarief.
export function werkbladExtraAmount(extra: WerkbladExtra, amounts: Record<string, number> | undefined): number {
  if (extra.variable && amounts && typeof amounts[extra.id] === 'number') return Number(amounts[extra.id]) || 0
  return Number(extra.amount) || 0
}

// Som van de aangevinkte extra onderdelen; een onderdeel dat in de
// instellingen verwijderd is telt niet meer mee.
export function werkbladExtrasTotal(extraIds: string[], rates: WerkbladRates, amounts?: Record<string, number>): number {
  const selected = new Set(extraIds)
  return round2((rates.extras ?? [])
    .filter((e) => selected.has(e.id))
    .reduce((sum, e) => sum + werkbladExtraAmount(e, amounts), 0))
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
  for (const c of werkbladCutouts(rates)) {
    if (part.cutouts?.[c.id]) cutoutCost += Number(c.amount) || 0
  }
  return {
    area,
    meters,
    perM2,
    materialCost,
    cutoutCost,
    total: round2(materialCost + cutoutCost),
    matName: mat ? werkbladMaterialLabel(mat) : '— geen materiaal —',
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

export function computeWerkbladTotals(inputs: WerkbladCalcInputs, baseRates: WerkbladRates): WerkbladCalcTotals {
  const rates = effectiveWerkbladRates(baseRates, inputs)
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
