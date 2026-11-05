// Gedeelde types van de keuzemodule: wat de server aan het portaal geeft
// (Pakket) en wat de klant terugstuurt (Keuzes). Het pakket bevat alleen
// wat de klant voor dít project mag zien, met klantprijzen (indicatie incl.
// btw) — nooit brutopunten of de rest van de catalogus.

import type { KastSoort, KastStatus } from './klantlaag'

export interface PakketIndeling {
  key: string
  label: string
  parts: [number, number, number, number, 0 | 1 | 2][]
  // Verschil met ons voorstel; null = prijs volgt.
  prijs: number | null
  voorstel: boolean
}

export interface PakketExtra {
  key: string
  cat: string
  label: string
  sub: string
  prijs: number | null
}

export interface PakketKast {
  id: string
  positie: string
  code: string
  naam: string
  omschrijving: string
  soort: KastSoort
  wand: string | null
  // Positie op de plattegrond als fractie (0–1) van breedte en hoogte.
  pin: { x: number; y: number } | null
  indelingen: PakketIndeling[]
  extras: PakketExtra[]
  inbegrepen: { key: string; label: string }[]
  apparaat: string | null
  apparaatVoorstel: string | null
}

export interface PakketDecor {
  code: string
  naam: string
  img: string | null
}

export interface PakketGreep extends PakketDecor {
  soort: 'knop' | 'greep' | 'lang'
  kleur: 'zwart' | 'rvs' | 'brons' | 'hout' | 'wit'
  lengte: number | null
  // Meerprijs voor alle grepen samen t.o.v. ons voorstel.
  prijs: number
}

export interface PakketWerkblad extends PakketDecor {
  compact: boolean
  diktes: number[]
  groep: 'hout' | 'steen' | 'marmer'
}

export interface Pakket {
  ronde: number
  plattegrond: string | null
  kasten: PakketKast[]
  keuken: {
    front: string | null
    frontkleur: string | null
    lades: string | null
    plint: string | null
    wangen: string | null
    corpus: { voorstel: string | null; opties: (PakketDecor & { hout: boolean })[] }
    greep: { voorstel: string | null; aantal: number; opties: PakketGreep[] }
  }
  werkblad: {
    voorstel: (PakketWerkblad & { dikte: number | null }) | null
    voorstelTekst: string | null
    decors: PakketWerkblad[]
  }
  wand: PakketExtra[]
}

export interface KastKeuze {
  status?: KastStatus
  indeling?: string
  extras?: Record<string, boolean>
  push?: boolean
  note?: string
}

export interface GreepKeuze {
  kind: 'greep' | 'lijst' | 'push'
  code?: string
}

export interface ApparaatKeuze {
  choice?: 'akkoord' | 'alt' | 'eigen'
  alt?: 'instap' | 'luxe'
  merk?: string
  type?: string
}

export interface WerkbladKeuze {
  mode?: 'voorstel' | 'zelf'
  mat?: string
  code?: string
  dikte?: number
  richting?: string
}

export interface Keuzes {
  kasten?: Record<string, KastKeuze>
  keuken?: {
    corpus?: string
    greep?: GreepKeuze
    rijen?: Record<string, 'akkoord' | 'bespreken'>
  }
  wand?: Record<string, boolean>
  werkblad?: WerkbladKeuze
  apparatuur?: Record<string, ApparaatKeuze>
}

export interface Wijziging {
  tag: string
  titel: string
  tekst: string
  // Bedrag in euro (indicatie) of null; prijsVolgt = er komt nog iets bij.
  bedrag: number | null
  prijsVolgt: boolean
  soort: 'wijziging' | 'vraag'
  // Sachsen-codes voor de ontwerper in Winner Flex.
  codes: string[]
}
