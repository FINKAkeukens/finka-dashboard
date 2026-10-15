import { Appliance, AppliancePackage, ApplianceSpecs, ApplianceType, EnergyLabel, OvenSubtype, ProductLine } from '@/lib/types'
import { decodeConflicts, decodeModel } from '@/lib/model-decoder'

// Types uit de bibliotheek die als accessoire gelden i.p.v. als apparatuur:
// ze horen in de offerte bij regeltype 'accessoire', in de kostenrij
// "Accessoires" en in de gelijknamige klantsectie/configurator-sectie. Hier
// gedeeld zodat Offerte en Configurator gegarandeerd dezelfde groep hanteren.
export const ACCESSOIRE_APPLIANCE_TYPES: ApplianceType[] = ['kraan', 'kokendwaterkraan', 'spoelbak', 'anders']

export const TYPE_LABELS: Record<string, string> = {
  kookplaat: 'Kookplaat',
  oven: 'Oven',
  'combi-oven': 'Combi-oven',
  magnetron: 'Magnetron',
  vaatwasser: 'Vaatwasser',
  afzuigkap: 'Afzuigkap',
  koelkast: 'Koelkast',
  koelvries: 'Koel-vries',
  vriezer: 'Vriezer',
  wijnklimaatkast: 'Wijnklimaatkast',
  kokendwaterkraan: 'Kokendwaterkraan',
  kraan: 'Kraan',
  spoelbak: 'Spoelbak',
  anders: 'Anders',
}

export const TYPE_ORDER = [
  'kookplaat', 'oven', 'combi-oven', 'magnetron', 'vaatwasser', 'afzuigkap',
  'koelvries', 'vriezer', 'koelkast', 'wijnklimaatkast', 'kokendwaterkraan', 'kraan', 'spoelbak', 'anders',
] as const

// In de bibliotheek (sidebar/overzicht) worden sommige verwante types
// samengevoegd onder één kopje — ze staan in de tabel/edit-formulieren nog
// gewoon los als eigen `type`, dit is puur een weergavegroepering.
export const OVEN_GROUP = {
  key: 'oven-magnetron',
  label: 'Oven en magnetron',
  types: ['oven', 'combi-oven', 'magnetron'] as const,
}

export const COOLING_GROUP = {
  key: 'koelen',
  label: 'Koelen',
  types: ['koelvries', 'vriezer', 'koelkast', 'wijnklimaatkast'] as const,
}

export const APPLIANCE_GROUPS = [OVEN_GROUP, COOLING_GROUP]

export const OVEN_SUBTYPE_LABELS: Record<OvenSubtype, string> = {
  solo: 'Solo-oven',
  'combi-magnetron': 'Combi magnetron/oven',
  stoom: 'Stoomoven',
}

// Energielabel is een generiek veld — van toepassing op (bijna) elk type
// apparaat, dus geen per-type filter maar één die overal beschikbaar is.
export const ENERGY_LABELS: EnergyLabel[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export const ENERGY_LABEL_COLORS: Record<EnergyLabel, string> = {
  A: 'bg-green-50 text-green-700 border-green-200',
  B: 'bg-lime-50 text-lime-700 border-lime-200',
  C: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  D: 'bg-amber-50 text-amber-700 border-amber-200',
  E: 'bg-orange-50 text-orange-700 border-orange-200',
  F: 'bg-red-50 text-red-700 border-red-200',
  G: 'bg-red-100 text-red-800 border-red-300',
}

// Productlijn is ook generiek — geldt voor elk apparaattype, net als
// energielabel.
export const PRODUCT_LINES: ProductLine[] = ['Studioline', 'Accentline']

export const CATEGORY_COLORS: Record<string, string> = {
  budget: 'bg-green-50 text-green-700 border-green-200',
  midden: 'bg-blue-50 text-blue-700 border-blue-200',
  premium: 'bg-amber-50 text-amber-700 border-amber-200',
}

export function formatPrice(price: number | null | undefined) {
  if (price == null) return '—'
  return `€${price.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`
}

export function getSpecSummary(appliance: Appliance): string {
  const s = appliance.specs ?? {}
  const parts: string[] = []

  switch (appliance.type) {
    case 'kookplaat':
      if (s.energy_type) parts.push(String(s.energy_type))
      if (s.zones) parts.push(`${s.zones} zones`)
      if (s.integrated_hood) parts.push('met afzuiging')
      if (s.width_cm) parts.push(formatCm(s.width_cm)!)
      break
    case 'oven':
    case 'combi-oven':
    case 'magnetron':
      if (s.oven_subtype) parts.push(OVEN_SUBTYPE_LABELS[s.oven_subtype as OvenSubtype] ?? String(s.oven_subtype))
      if (s.niche_height_cm) parts.push(`nis ${formatCm(s.niche_height_cm)}`)
      if (s.capacity_liters) parts.push(`${s.capacity_liters}L`)
      if (s.pyrolysis) parts.push('pyrolyse')
      if (s.steam) parts.push('stoom')
      break
    case 'vaatwasser':
      if (s.integration) parts.push(String(s.integration))
      if (s.width_cm && s.width_cm < 50) parts.push(formatCm(s.width_cm)!)
      if (s.niche_height_cm) parts.push(`nis ${formatCm(s.niche_height_cm)}`)
      if (s.db_sound) parts.push(`${s.db_sound} dB`)
      if (s.capacity_sets) parts.push(`${s.capacity_sets} couverts`)
      break
    case 'afzuigkap':
      if (s.afzuig_type) parts.push(String(s.afzuig_type))
      if (s.capacity_m3h) parts.push(`${s.capacity_m3h} m³/h`)
      break
    case 'koelkast':
    case 'koelvries':
    case 'vriezer':
    case 'wijnklimaatkast':
      if (s.installation && s.installation !== 'inbouw') parts.push(String(s.installation))
      if (s.niche_height_cm) parts.push(`nis ${formatCm(s.niche_height_cm)}`)
      if (s.fridge_liters) parts.push(`${s.fridge_liters}L`)
      if (s.freezer_liters) parts.push(`vries ${s.freezer_liters}L`)
      if (s.bottles) parts.push(`${s.bottles} flessen`)
      break
    case 'kokendwaterkraan':
      if (s.component === 'reservoir') parts.push('reservoir')
      if (s.tap_model) parts.push(String(s.tap_model))
      if (s.functions_count) parts.push(s.functions_count === 1 ? 'alleen kokend' : `${s.functions_count}-in-1`)
      if (s.has_sparkling) parts.push('bruisend')
      if (s.finish) parts.push(String(s.finish))
      break
    case 'kraan':
      if (s.finish) parts.push(String(s.finish))
      break
    case 'spoelbak':
      if (s.material) parts.push(String(s.material))
      if (s.bowls) parts.push(String(s.bowls))
      if (s.mounting) parts.push(String(s.mounting))
      if (s.width_cm) parts.push(formatCm(s.width_cm)!)
      break
    case 'anders':
      if (typeof s.custom_type === 'string' && s.custom_type) parts.push(s.custom_type)
      break
  }

  if (s.db_sound && appliance.type !== 'vaatwasser') {
    parts.push(`${s.db_sound} dB`)
  }
  if (s.energy_label) parts.push(`label ${s.energy_label}`)
  if (s.product_line) parts.push(String(s.product_line))
  if (s.series) parts.push(String(s.series))

  return parts.join(' · ') || '—'
}

export function countByType(appliances: Appliance[]) {
  return appliances.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}

export function priceRange(items: Appliance[]) {
  const prices = items.map(a => a.price).filter((p): p is number => p != null)
  if (!prices.length) return null
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export function specEntries(type: string, specs: ApplianceSpecs): { label: string; value: string }[] {
  const fmt = (v: string | number | boolean | undefined) => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v === 'boolean') return v ? 'Ja' : 'Nee'
    return String(v)
  }

  const entries: { label: string; value: string | null }[] = []

  switch (type) {
    case 'kookplaat':
      entries.push(
        { label: 'Energietype', value: fmt(specs.energy_type) },
        { label: 'Zones', value: fmt(specs.zones) },
        { label: 'Vermogen', value: specs.watt ? `${specs.watt}W` : null },
        { label: 'Met afzuiging', value: specs.integrated_hood ? (specs.hood_mode ? `ja, ${specs.hood_mode}` : 'ja') : null },
      )
      break
    case 'oven':
    case 'combi-oven':
    case 'magnetron':
      entries.push(
        { label: 'Ovensoort', value: specs.oven_subtype ? OVEN_SUBTYPE_LABELS[specs.oven_subtype as OvenSubtype] ?? String(specs.oven_subtype) : null },

        { label: 'Pyrolyse', value: fmt(specs.pyrolysis) },
        { label: 'Stoom', value: fmt(specs.steam) },
        { label: 'Inhoud', value: specs.capacity_liters ? `${specs.capacity_liters}L` : null },
      )
      break
    case 'vaatwasser':
      entries.push(
        { label: 'Integreerbaar', value: fmt(specs.integration) },
        { label: 'Scharnier', value: fmt(specs.hinge) },
        { label: 'Geluid', value: specs.db_sound ? `${specs.db_sound} dB` : null },
        { label: 'Couverts', value: fmt(specs.capacity_sets) },
      )
      break
    case 'afzuigkap':
      entries.push(
        { label: 'Type', value: fmt(specs.afzuig_type) },
        { label: 'Capaciteit', value: specs.capacity_m3h ? `${specs.capacity_m3h} m³/h` : null },
      )
      break
    case 'koelkast':
    case 'koelvries':
    case 'vriezer':
    case 'wijnklimaatkast':
      entries.push(
        { label: 'Montage', value: fmt(specs.installation) },
        { label: 'Deurmontage', value: fmt(specs.door_mounting) },
        { label: 'Koelinhoud', value: specs.fridge_liters ? `${specs.fridge_liters}L` : null },
        { label: 'Vriesinhoud', value: specs.freezer_liters ? `${specs.freezer_liters}L` : null },
        { label: 'Flessen', value: fmt(specs.bottles) },
      )
      break
    case 'kokendwaterkraan':
      entries.push(
        { label: 'Onderdeel', value: fmt(specs.component) },
        { label: 'Kraanmodel', value: fmt(specs.tap_model) },
        { label: 'Functies', value: specs.functions_count ? (specs.functions_count === 1 ? 'alleen kokend' : `${specs.functions_count}-in-1`) : null },
        { label: 'Bruisend', value: fmt(specs.has_sparkling) },
        { label: 'Tank', value: specs.tank_liters ? `${specs.tank_liters}L` : null },
        { label: 'Afwerking', value: fmt(specs.finish) },
      )
      break
    case 'kraan':
      entries.push(
        { label: 'Afwerking', value: fmt(specs.finish) },
      )
      break
    case 'spoelbak':
      entries.push(
        { label: 'Materiaal', value: fmt(specs.material) },
        { label: 'Bakken', value: fmt(specs.bowls) },
        { label: 'Montage', value: fmt(specs.mounting) },
        { label: 'Bakmaat', value: specs.bowl_width_mm && specs.bowl_length_mm ? `${specs.bowl_length_mm} × ${specs.bowl_width_mm} mm` : null },
      )
      break
    case 'anders':
      if (typeof specs.custom_type === 'string' && specs.custom_type) {
        entries.push({ label: 'Type', value: specs.custom_type })
      }
      break
  }

  if (specs.db_sound && type !== 'vaatwasser') {
    entries.push({ label: 'Geluid', value: `${specs.db_sound} dB` })
  }
  const dims = (a: unknown, b: unknown, c: unknown) =>
    [a, b, c].some((v) => typeof v === 'number')
      ? [a, b, c].map((v) => (typeof v === 'number' ? v.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '?')).join(' × ') + ' cm'
      : null
  entries.push(
    { label: 'Nismaat (h × b × d)', value: dims(specs.niche_height_cm, specs.niche_width_cm, specs.niche_depth_cm) },
    { label: 'Apparaat (h × b × d)', value: dims(specs.height_cm, specs.width_cm, specs.depth_cm) },
  )
  if (specs.color) entries.push({ label: 'Kleur', value: String(specs.color) })
  if (specs.energy_label) {
    entries.push({ label: 'Energielabel', value: specs.energy_label })
  }
  if (specs.product_line) {
    entries.push({ label: 'Lijn', value: specs.product_line })
  }
  if (specs.series) {
    entries.push({ label: 'Serie', value: String(specs.series) })
  }

  return entries.filter((e): e is { label: string; value: string } => e.value != null)
}

// Apparaten van een pakket in de vaste type-volgorde van de rest van de app.
// Apparaten die inmiddels uit de bibliotheek zijn verwijderd vallen weg.
export function packageAppliances(pkg: AppliancePackage, appliances: Appliance[]): Appliance[] {
  return pkg.appliance_ids
    .map((id) => appliances.find((a) => a.id === id))
    .filter((a): a is Appliance => !!a)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
}

// ---------------------------------------------------------------------------
// Kwaliteitsbewaking bibliotheek
// ---------------------------------------------------------------------------

// Modelnummer zonder spaties/streepjes/punten en hoofdletterongevoelig, zodat
// "KI86 NSF E0", "ki86nsfe0" en "KI86-NSFE0" als hetzelfde apparaat tellen.
export function normalizeModel(model: string | null | undefined): string {
  return (model ?? '').toUpperCase().replace(/[^A-Z0-9+]/g, '')
}

// Bestaand bibliotheek-apparaat met (genormaliseerd) hetzelfde merk + model.
// Valt terug op "het ene modelnummer bevat het andere" (bv. "3FRPTN PRO3
// Fusion Round Patina" vs "3FRPTN") zolang dat stuk minstens 6 tekens heeft,
// om valse treffers op korte codes als "PRO3" te voorkomen.
export function findDuplicateAppliance<T extends { id: string; brand: string; model: string }>(
  brand: string,
  model: string,
  appliances: T[],
  excludeId?: string,
): T | undefined {
  const b = brand.trim().toLowerCase()
  const m = normalizeModel(model)
  if (!m) return undefined
  const sameBrand = appliances.filter((a) => a.id !== excludeId && a.brand.trim().toLowerCase() === b)
  const exact = sameBrand.find((a) => normalizeModel(a.model) === m)
  if (exact) return exact
  return sameBrand.find((a) => {
    const other = normalizeModel(a.model)
    const shorter = other.length < m.length ? other : m
    const longer = other.length < m.length ? m : other
    return shorter.length >= 6 && longer.includes(shorter)
  })
}

// Prijsklasse volgt een vaste regel per merk/serie i.p.v. per keer door de
// AI gekozen — zo staan twee iQ700-apparaten nooit in verschillende klassen.
// null = geen regel bekend → handmatig/AI laten bepalen.
const PREMIUM_BRANDS = ['miele', 'gaggenau', 'v-zug', 'wolf', 'bora', 'quooker', 'la cornue', 'küppersbusch', 'kuppersbusch', 'neff', 'liebherr', 'novy', 'subzero', 'sub-zero']
const MIDDEN_BRANDS = ['atag', 'pelgrim', 'franke', 'whirlpool', 'samsung', 'lg', 'electrolux', 'smeg', 'bauknecht', 'berbel', 'selsiuz', 'falmec', 'blanco']
const BUDGET_BRANDS = ['inventum', 'etna', 'beko', 'gorenje', 'indesit', 'candy', 'hisense', 'zanussi', 'amica', 'caressi']

export function suggestCategory(brand: string, series?: string | null): 'budget' | 'midden' | 'premium' | null {
  const b = brand.trim().toLowerCase()
  const s = (series ?? '').toLowerCase().replace(/\s/g, '')
  if (b === 'siemens') {
    if (/iq(7|9)00/.test(s)) return 'premium'
    if (/iq(3|5)00/.test(s)) return 'midden'
    if (/iq100/.test(s)) return 'budget'
    return null
  }
  if (b === 'bosch') {
    if (/(serie|series)8/.test(s)) return 'premium'
    if (/(serie|series)(4|6)/.test(s)) return 'midden'
    if (/(serie|series)2/.test(s)) return 'budget'
    return null
  }
  if (b === 'aeg') {
    if (/(8000|9000|mastery)/.test(s)) return 'premium'
    return 'midden'
  }
  if (PREMIUM_BRANDS.includes(b)) return 'premium'
  if (MIDDEN_BRANDS.includes(b)) return 'midden'
  if (BUDGET_BRANDS.includes(b)) return 'budget'
  return null
}

// Onmogelijke/verdachte waardes — de typische fouten die eerder in de
// bibliotheek slopen (nismaat als liters, serie als couverts, mm als cm).
export function sanityWarnings(type: string, specs: ApplianceSpecs): string[] {
  const w: string[] = []
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
  const cooling = ['koelkast', 'koelvries', 'vriezer', 'wijnklimaatkast'].includes(type)
  const fridge = num(specs.fridge_liters)
  if (cooling && fridge != null && [72, 82, 88, 102, 122, 140, 158, 178, 194].includes(fridge)) {
    w.push(`Inhoud ${fridge} L lijkt een nishoogte (cm)`)
  }
  if (type === 'koelvries' && specs.freezer === false) w.push('Koel-vriescombinatie zonder vriesgedeelte?')
  if (num(specs.freezer_liters) && specs.freezer === false) w.push('Vriesinhoud ingevuld maar "vriezer: nee"')
  if (cooling && !specs.niche_height_cm && specs.installation !== 'vrijstaand') w.push('Nishoogte ontbreekt')
  const sets = num(specs.capacity_sets)
  if (sets != null && (sets < 4 || sets > 17)) w.push(`${sets} couverts is onmogelijk`)
  if (type === 'vaatwasser' && !specs.niche_height_cm) w.push('Nishoogte ontbreekt')
  if (['oven', 'combi-oven', 'magnetron'].includes(type) && !specs.niche_height_cm) w.push('Nishoogte (45/60) ontbreekt')
  for (const key of ['width_cm', 'height_cm', 'depth_cm', 'niche_width_cm', 'niche_height_cm', 'niche_depth_cm'] as const) {
    const v = num(specs[key])
    if (v != null && (v > 250 || v < 3)) w.push(`${key.replace(/_/g, ' ')} = ${v} cm (mm ingevuld?)`)
  }
  const liters = num(specs.capacity_liters)
  if (liters != null && (liters < 10 || liters > 100)) w.push(`Inhoud ${liters} L onwaarschijnlijk`)
  if (type === 'kokendwaterkraan' && specs.component !== 'reservoir' && !specs.functions_count) w.push('Aantal functies ontbreekt')
  return w
}

export function formatCm(v: unknown): string | null {
  if (typeof v !== 'number') return null
  return `${v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} cm`
}

export const SPEC_LABELS: Record<string, string> = {
  energy_type: 'Energietype', zones: 'Zones', watt: 'Vermogen (W)', integrated_hood: 'Met afzuiging', hood_mode: 'Afzuigmodus',
  oven_subtype: 'Ovensoort', capacity_liters: 'Inhoud (L)', pyrolysis: 'Pyrolyse', steam: 'Stoom',
  integration: 'Integreerbaar', capacity_sets: 'Couverts', hinge: 'Scharnier',
  afzuig_type: 'Type kap', capacity_m3h: 'Capaciteit (m³/h)',
  fridge_liters: 'Koelinhoud (L)', freezer: 'Vriesgedeelte', freezer_liters: 'Vriesinhoud (L)', bottles: 'Flessen',
  installation: 'Montage', door_mounting: 'Deurmontage',
  functions_count: 'Functies', has_sparkling: 'Bruisend', tank_liters: 'Tank (L)', finish: 'Afwerking', tap_model: 'Kraanmodel', component: 'Onderdeel',
  material: 'Materiaal', bowls: 'Bakken', bowl_width_mm: 'Bakbreedte (mm)', bowl_length_mm: 'Baklengte (mm)', mounting: 'Montage',
  niche_height_cm: 'Nishoogte (cm)', niche_width_cm: 'Nisbreedte (cm)', niche_depth_cm: 'Nisdiepte (cm)',
  width_cm: 'Breedte (cm)', height_cm: 'Hoogte (cm)', depth_cm: 'Diepte (cm)',
  energy_label: 'Energielabel', db_sound: 'Geluid (dB)', color: 'Kleur', series: 'Serie', product_line: 'Productlijn', custom_type: 'Omschrijving',
}

// Alle waarschuwingen voor één apparaat: onmogelijke waardes + afwijkingen
// van wat het modelnummer zegt (zie model-decoder.ts).
export function qualityWarnings(a: { type: string; brand?: string | null; model?: string | null; specs?: ApplianceSpecs | null }): string[] {
  const specs = a.specs ?? {}
  return [...sanityWarnings(a.type, specs), ...decodeConflicts(a.type, specs, decodeModel(a.brand, a.model))]
}
