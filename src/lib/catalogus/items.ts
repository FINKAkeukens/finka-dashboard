import type { Catalogus, ImageRef } from './parse'

// Eén rij in finka_catalogus_items, zoals de import-route hem ontvangt.
export type CatalogusSoort = 'corpus' | 'werkblad' | 'greep' | 'model' | 'kast' | 'accessoire'

export interface CatalogusItemInput {
  soort: CatalogusSoort
  code: string
  naam: string | null
  prijzen: number | number[] | null
  data: Record<string, unknown>
  afbeelding_url: string | null
}

// Pad van een staal in de bucket 'catalogus'. Codes kunnen tekens bevatten
// die in een pad lastig zijn; die worden vervangen.
export function staalPad(catalogusId: string, soort: CatalogusSoort, code: string, extra = ''): string {
  return `${catalogusId}/${soort}/${code.replace(/[^\w.-]/g, '_')}${extra}.webp`
}

export function catalogusNaarItems(c: Catalogus, staalUrl: (ref: ImageRef | null, soort: CatalogusSoort, code: string, extra?: string) => string | null): CatalogusItemInput[] {
  return [
    ...c.corpus.map((x) => ({ soort: 'corpus' as const, code: x.code, naam: x.naam, prijzen: null, data: {}, afbeelding_url: staalUrl(x.img, 'corpus', x.code) })),
    ...c.werkbladen.map((x) => ({
      soort: 'werkblad' as const, code: x.code, naam: x.naam, prijzen: null,
      data: { decorgroep: x.decorgroep, compact: x.compact, diktes: x.diktes },
      afbeelding_url: staalUrl(x.img, 'werkblad', x.code, x.compact ? '-compact' : ''),
    })),
    ...c.grepen.map((x) => ({
      soort: 'greep' as const, code: x.code, naam: x.naam, prijzen: x.meerprijs,
      data: { soort: x.soort, boorafstand: x.boorafstand, lengte: x.lengte },
      afbeelding_url: staalUrl(x.img, 'greep', x.code),
    })),
    ...c.modellen.map((x) => ({ soort: 'model' as const, code: x.naam, naam: x.naam, prijzen: null, data: { pg: x.pg }, afbeelding_url: null })),
    ...c.kasten.map((x) => ({ soort: 'kast' as const, code: x.code, naam: null, prijzen: x.prijzen, data: {}, afbeelding_url: null })),
    ...c.accessoires.map((x) => ({ soort: 'accessoire' as const, code: x.code, naam: x.naam, prijzen: x.prijs, data: {}, afbeelding_url: null })),
  ]
}

// "SK130_2027_NL.pdf" → "SK130 2027"
export function titelUitBestandsnaam(naam: string): string {
  const m = naam.match(/SK\s?_?(\d{3})\D{0,3}(\d{4})/i)
  return m ? `SK${m[1]} ${m[2]}` : naam.replace(/\.pdf$/i, '')
}
