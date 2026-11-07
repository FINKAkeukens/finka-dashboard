import { format } from 'date-fns'
import { SampleLoan, SampleSize } from '@/lib/types'

// Standaardwaarden; alles is aan te passen onder Instellingen → Sample
// instellingen (finka_sample_settings, migratie-sectie 99).
export const SAMPLE_CATEGORY_LABELS: Record<string, string> = {
  front: 'Front',
  werkblad: 'Werkblad',
  greep: 'Greep',
  kleur: 'Kleur / afwerking',
  anders: 'Anders',
}

export const SAMPLE_SIZES: SampleSize[] = ['XL', 'L', 'M', 'S']

export const SAMPLE_MATERIALS = ['Fineer', 'Houtlook', 'Lak', 'Hoogglanslak', 'Glas']

// Standaard hoort het veld Uitvoering bij dit materiaal.
export const VENEER_MATERIAL = 'Fineer'

export type SampleFieldKey =
  | 'name' | 'category' | 'supplier_id' | 'model' | 'code' | 'price_group' | 'size'
  | 'material' | 'veneer_execution' | 'color' | 'finish' | 'photo' | 'notes'

// Velden van het sampleformulier. placeholder = voorbeeldtekst in een leeg
// tekstveld; velden zonder placeholder zijn keuzelijsten of uploads.
export const SAMPLE_FIELDS: { key: SampleFieldKey; label: string; placeholder?: string }[] = [
  { key: 'name', label: 'Naam', placeholder: 'Bijv. Eiken naturel mat' },
  { key: 'category', label: 'Soort' },
  { key: 'supplier_id', label: 'Leverancier' },
  { key: 'model', label: 'Model', placeholder: '' },
  { key: 'code', label: 'Code / artikelnummer', placeholder: '' },
  { key: 'price_group', label: 'PG (prijsgroep)', placeholder: 'Bijv. 3' },
  { key: 'size', label: 'Maat' },
  { key: 'material', label: 'Materiaal' },
  { key: 'veneer_execution', label: 'Uitvoering', placeholder: 'Bijv. rift, dosse, gestoomd' },
  { key: 'color', label: 'Kleur', placeholder: 'Bijv. eiken naturel, antraciet' },
  { key: 'finish', label: 'Afwerking', placeholder: 'Bijv. mat, hoogglans, structuur' },
  { key: 'photo', label: 'Foto' },
  { key: 'notes', label: 'Aantekeningen', placeholder: '' },
]

export interface SampleCategoryOption {
  key: string
  label: string
}

export interface SampleSettings {
  labels: Partial<Record<SampleFieldKey, string>>
  placeholders: Partial<Record<SampleFieldKey, string>>
  categories: SampleCategoryOption[]
  sizes: string[]
  materials: string[]
  // Materiaal waarbij het veld Uitvoering verschijnt; null = bij geen.
  veneer_material: string | null
}

// Rij uit finka_sample_settings (of null als die er nog niet is). Lege
// lijsten (null) vallen terug op de standaardwaarden.
export function normalizeSampleSettings(row: Partial<Record<keyof SampleSettings, unknown>> | null | undefined): SampleSettings {
  return {
    labels: (row?.labels as SampleSettings['labels']) ?? {},
    placeholders: (row?.placeholders as SampleSettings['placeholders']) ?? {},
    categories:
      (row?.categories as SampleCategoryOption[] | null) ??
      Object.entries(SAMPLE_CATEGORY_LABELS).map(([key, label]) => ({ key, label })),
    sizes: (row?.sizes as string[] | null) ?? [...SAMPLE_SIZES],
    materials: (row?.materials as string[] | null) ?? [...SAMPLE_MATERIALS],
    veneer_material: row ? ((row.veneer_material as string | null) ?? null) : VENEER_MATERIAL,
  }
}

export function sampleFieldLabel(settings: SampleSettings, key: SampleFieldKey): string {
  return settings.labels[key]?.trim() || SAMPLE_FIELDS.find((f) => f.key === key)!.label
}

export function samplePlaceholder(settings: SampleSettings, key: SampleFieldKey): string {
  return settings.placeholders[key] ?? SAMPLE_FIELDS.find((f) => f.key === key)?.placeholder ?? ''
}

export function sampleCategoryLabel(settings: SampleSettings, key: string): string {
  return settings.categories.find((c) => c.key === key)?.label ?? SAMPLE_CATEGORY_LABELS[key] ?? key
}

// Keuzelijst plus een eerder opgeslagen waarde die (nog) niet in de lijst
// staat, zodat die bij bewerken niet verdwijnt.
export function withCurrent(options: string[], current: string | null | undefined): string[] {
  const value = current?.trim()
  if (!value || options.some((o) => o.toLowerCase() === value.toLowerCase())) return options
  return [...options, value]
}

export type SampleAvailability = 'beschikbaar' | 'uitgeleend' | 'te-laat'

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// Een staal heeft hooguit één openstaande uitlening (unieke index in
// migratie-sectie 91) — die bepaalt of hij beschikbaar is.
export function sampleAvailability(openLoan: SampleLoan | null | undefined): SampleAvailability {
  if (!openLoan) return 'beschikbaar'
  if (openLoan.due_date && openLoan.due_date < todayIso()) return 'te-laat'
  return 'uitgeleend'
}

export const AVAILABILITY_LABELS: Record<SampleAvailability, string> = {
  beschikbaar: 'Beschikbaar',
  uitgeleend: 'Uitgeleend',
  'te-laat': 'Te laat terug',
}

export const AVAILABILITY_COLORS: Record<SampleAvailability, string> = {
  beschikbaar: 'bg-green-50 text-green-700',
  uitgeleend: 'bg-amber-50 text-amber-700',
  'te-laat': 'bg-red-50 text-red-700',
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return format(new Date(`${iso}T00:00:00`), 'd-M-yyyy')
}

// Kopieën van een sample (bv. een extra FINKA-tas) nummeren door:
// "3. Groene FINKA tas (L)" → base "Groene FINKA tas (L)", en de kopieën
// worden "4. …", "5. …" vanaf het hoogste nummer dat al bestaat. Zonder
// nummer vooraan: "Naam (2)", "Naam (3)" — het origineel telt als 1.
export function sampleNumberBase(name: string): { base: string; numbered: boolean } {
  const m = name.trim().match(/^\d+\.\s*(.+)$/)
  return m ? { base: m[1], numbered: true } : { base: name.trim(), numbered: false }
}

export function sampleCopyNames(name: string, existingNames: string[], count: number): string[] {
  const { base, numbered } = sampleNumberBase(name)
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = numbered ? new RegExp(`^(\\d+)\\.\\s*${escaped}$`) : new RegExp(`^${escaped}(?: \\((\\d+)\\))?$`)
  let max = 0
  for (const existing of existingNames) {
    const m = existing.trim().match(pattern)
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1)
  }
  return Array.from({ length: count }, (_, i) => (numbered ? `${max + i + 1}. ${base}` : `${base} (${max + i + 1})`))
}
