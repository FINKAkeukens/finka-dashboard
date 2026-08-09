import { Appliance, ApplianceSpecs } from '@/lib/types'

export const TYPE_LABELS: Record<string, string> = {
  kookplaat: 'Kookplaat',
  oven: 'Oven',
  'combi-oven': 'Combi-oven',
  vaatwasser: 'Vaatwasser',
  afzuigkap: 'Afzuigkap',
  koelkast: 'Koelkast',
  koelvries: 'Koel-vries',
  kokendwaterkraan: 'Kokendwaterkraan',
  kraan: 'Kraan',
  spoelbak: 'Spoelbak',
  anders: 'Anders',
}

export const TYPE_ORDER = [
  'kookplaat', 'oven', 'combi-oven', 'vaatwasser', 'afzuigkap',
  'koelkast', 'koelvries', 'kokendwaterkraan', 'kraan', 'spoelbak', 'anders',
] as const

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
      if (s.width_cm) parts.push(`${s.width_cm} cm`)
      break
    case 'oven':
    case 'combi-oven':
      if (s.capacity_liters) parts.push(`${s.capacity_liters}L`)
      if (s.pyrolysis) parts.push('pyrolyse')
      if (s.steam) parts.push('stoom')
      break
    case 'vaatwasser':
      if (s.integration) parts.push(String(s.integration))
      if (s.db_sound) parts.push(`${s.db_sound} dB`)
      if (s.capacity_sets) parts.push(`${s.capacity_sets} couverts`)
      break
    case 'afzuigkap':
      if (s.afzuig_type) parts.push(String(s.afzuig_type))
      if (s.capacity_m3h) parts.push(`${s.capacity_m3h} m³/h`)
      break
    case 'koelkast':
    case 'koelvries':
      if (s.fridge_liters) parts.push(`${s.fridge_liters}L`)
      if (s.freezer) parts.push('vriezer')
      break
    case 'kokendwaterkraan':
      if (s.functions_count) parts.push(`${s.functions_count}-in-1`)
      if (s.has_sparkling) parts.push('bruisend')
      if (s.finish) parts.push(String(s.finish))
      break
    case 'kraan':
      if (s.finish) parts.push(String(s.finish))
      break
    case 'spoelbak':
      if (s.material) parts.push(String(s.material))
      if (s.bowls) parts.push(String(s.bowls))
      if (s.width_cm) parts.push(`${s.width_cm} cm`)
      break
    case 'anders':
      if (typeof s.custom_type === 'string' && s.custom_type) parts.push(s.custom_type)
      break
  }

  if (s.db_sound && appliance.type !== 'vaatwasser') {
    parts.push(`${s.db_sound} dB`)
  }

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
        { label: 'Breedte', value: specs.width_cm ? `${specs.width_cm} cm` : null },
      )
      break
    case 'oven':
    case 'combi-oven':
      entries.push(
        { label: 'Pyrolyse', value: fmt(specs.pyrolysis) },
        { label: 'Stoom', value: fmt(specs.steam) },
        { label: 'Inhoud', value: specs.capacity_liters ? `${specs.capacity_liters}L` : null },
      )
      break
    case 'vaatwasser':
      entries.push(
        { label: 'Integreerbaar', value: fmt(specs.integration) },
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
      entries.push(
        { label: 'Inhoud', value: specs.fridge_liters ? `${specs.fridge_liters}L` : null },
        { label: 'Vriezer', value: fmt(specs.freezer) },
      )
      break
    case 'kokendwaterkraan':
      entries.push(
        { label: 'Functies', value: specs.functions_count ? `${specs.functions_count}-in-1` : null },
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
        { label: 'Breedte', value: specs.width_cm ? `${specs.width_cm} cm` : null },
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

  return entries.filter((e): e is { label: string; value: string } => e.value != null)
}
