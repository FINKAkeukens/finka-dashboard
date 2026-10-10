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

// Welke standaarddocumenten een klant van dit type in het portaal ziet —
// alleen actieve, in de volgorde van Instellingen → Standaarddocumenten.
// Een onbekend/ontbrekend type (bv. vóór migratie-sectie 81) telt als
// consument, net als de kolom-default.
export function standardDocumentsFor(docs: StandardDocument[], customerType: CustomerType | null | undefined): StandardDocument[] {
  const type = customerType ?? 'consument'
  return docs
    .filter((d) => d.active && (d.audience === 'iedereen' || d.audience === type))
    .sort((a, b) => a.sort_order - b.sort_order)
}
