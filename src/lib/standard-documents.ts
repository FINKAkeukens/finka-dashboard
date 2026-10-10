import type { CustomerType, StandardDocument, StandardDocumentAudience } from './types'

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  consument: 'Consument (B2C)',
  bedrijf: 'Bedrijf (B2B)',
}

export const AUDIENCE_LABELS: Record<StandardDocumentAudience, string> = {
  iedereen: 'Alle klanten',
  consument: 'Alleen consumenten (B2C)',
  bedrijf: 'Alleen bedrijven (B2B)',
}

// Vóór migratie-sectie 82 bestonden series_id/valid_from nog niet — dan is
// elk document z'n eigen reeks die altijd geldt.
export function seriesId(doc: StandardDocument): string {
  return doc.series_id ?? doc.id
}

// Datum (YYYY-MM-DD) in Nederlandse tijd — een akkoord om 23:30 telt voor
// die dag, niet voor de volgende (UTC).
export function amsterdamDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

// Ging een klant van dit type deze versie ooit zien? Gebruikt door de
// bestands-poortwachter: een klant mag ook een oudere versie openen.
export function isForCustomerType(doc: StandardDocument, customerType: CustomerType | null | undefined): boolean {
  return doc.active && (doc.audience === 'iedereen' || doc.audience === (customerType ?? 'consument'))
}

// Welke standaarddocumenten een klant van dit type in het portaal ziet —
// per reeks precies één versie: de nieuwste die op `referenceDate` al gold.
// referenceDate = de dag van het akkoord op de offerte (voorwaarden liggen
// dan vast), of vandaag als er nog geen akkoord is. Gold er op die dag nog
// geen enkele versie (bv. een document dat pas later is toegevoegd), dan de
// oudste — beter iets tonen dan niets. Een onbekend/ontbrekend klanttype
// telt als consument, net als de kolom-default.
export function standardDocumentsFor(
  docs: StandardDocument[],
  customerType: CustomerType | null | undefined,
  referenceDate: string = amsterdamDate(new Date())
): StandardDocument[] {
  const bySeries = new Map<string, StandardDocument[]>()
  for (const d of docs) {
    if (!isForCustomerType(d, customerType)) continue
    const key = seriesId(d)
    bySeries.set(key, [...(bySeries.get(key) ?? []), d])
  }
  const picked: StandardDocument[] = []
  for (const versions of bySeries.values()) {
    // Oudste eerst; NULL (= vanaf het begin) vóór elke datum.
    const sorted = [...versions].sort((a, b) => (a.valid_from ?? '').localeCompare(b.valid_from ?? ''))
    const valid = sorted.filter((v) => !v.valid_from || v.valid_from <= referenceDate)
    picked.push(valid.length ? valid[valid.length - 1] : sorted[0])
  }
  return picked.sort((a, b) => a.sort_order - b.sort_order)
}

// Peildatum voor standardDocumentsFor bij een project: de dag van het
// eerste akkoord op een offerte (ook als die offerteversie later is
// gearchiveerd — het akkoord en dus de voorwaarden blijven staan), anders
// vandaag.
export function termsReferenceDate(akkoordDates: (string | null | undefined)[]): string {
  const dates = akkoordDates.filter((d): d is string => !!d).sort()
  return amsterdamDate(dates[0] ?? new Date())
}
