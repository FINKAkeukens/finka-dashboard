import { format } from 'date-fns'
import { SampleCategory, SampleLoan, SampleSize } from '@/lib/types'

export const SAMPLE_CATEGORY_LABELS: Record<SampleCategory, string> = {
  front: 'Front',
  werkblad: 'Werkblad',
  greep: 'Greep',
  kleur: 'Kleur / afwerking',
  anders: 'Anders',
}

export const SAMPLE_SIZES: SampleSize[] = ['XL', 'L', 'M', 'S']

export const SAMPLE_MATERIALS = ['Fineer', 'Houtlook', 'Lak', 'Hoogglanslak', 'Glas']

// Alleen bij dit materiaal hoort het veld Uitvoering.
export const VENEER_MATERIAL = 'Fineer'

// Vaste materialen plus alles wat ooit via "Anders" is ingevuld, zodat een
// zelf ingevuld materiaal de volgende keer gewoon in de keuzelijst staat.
export function sampleMaterialOptions(used: (string | null)[]): string[] {
  const known = new Set(SAMPLE_MATERIALS.map((m) => m.toLowerCase()))
  const extra = new Map<string, string>()
  for (const raw of used) {
    const m = raw?.trim()
    if (!m || known.has(m.toLowerCase())) continue
    if (!extra.has(m.toLowerCase())) extra.set(m.toLowerCase(), m)
  }
  return [...SAMPLE_MATERIALS, ...[...extra.values()].sort((a, b) => a.localeCompare(b, 'nl'))]
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
