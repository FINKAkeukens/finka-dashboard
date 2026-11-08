// Gedeelde types van de keuzemodule: wat de server aan het portaal geeft
// (Pakket) en wat de klant terugstuurt (Keuzes). Het pakket bevat alleen
// wat de klant voor dít project mag zien, met klantprijzen (indicatie incl.
// btw) — nooit brutopunten of de rest van de catalogus.

import type { KastSoort, KastStatus, Uitvoering, WerkbladMateriaal } from './klantlaag'
import type { Plattegrond, Vak } from './plattegrond'

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
  groep: string
  label: string
  sub: string
  prijs: number | null
  // Sachsen-bestelnummer voor de ontwerper; {u} = gekozen houtuitvoering.
  code: string | null
  uitvoeringen: Uitvoering[] | null
  // Zit al in het ontwerp (subpositie in Winner Flex).
  inOntwerp?: boolean
}

export interface PakketKast {
  id: string
  positie: string
  code: string
  naam: string
  omschrijving: string
  soort: KastSoort
  wand: string | null
  // Vak op de getekende plattegrond (null = niet op de tekening gevonden).
  vak: Vak | null
  indelingen: PakketIndeling[]
  extras: PakketExtra[]
  inbegrepen: { key: string; label: string }[]
  apparaat: string | null
  apparaatVoorstel: string | null
  // Houtuitvoering van de inzetten in het ontwerp; standaard voor nieuwe keuzes.
  uitvoering: Uitvoering | null
  // Opmerking van FINKA bij deze kast.
  toelichting: string | null
  // Tekening van de kast uit de elementenlijst (kortlevende link) of null.
  afbeelding: string | null
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
  // Meerprijs voor alle grepen samen t.o.v. ons voorstel (null = prijzen uit).
  prijs: number | null
}


export interface Pakket {
  // false = FINKA heeft prijzen uitgezet; alle prijs-velden zijn dan null.
  prijzen: boolean
  toelichting: string | null
  ronde: number
  plattegrond: Plattegrond | null
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
  // Alleen ons voorstel; de klant kiest geen werkblad uit een catalogus.
  werkblad: {
    voorstel: string | null
    materiaal: WerkbladMateriaal | null
  }
  wand: PakketExtra[]
}

export interface KastKeuze {
  status?: KastStatus
  indeling?: string
  extras?: Record<string, boolean>
  // Houtuitvoering voor alle houten inzetten in deze kast.
  uitvoering?: Uitvoering
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
  opmerking?: string
}

export interface WerkbladKeuze {
  status?: 'akkoord' | 'bespreken'
  opmerking?: string
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
  // Sachsen-codes voor de ontwerper in Winner Flex: erbij en (bij een
  // vervanging) eraf.
  codes: string[]
  codesWeg?: string[]
  // Alleen bij kasten: positienummer, naam en de kastcode in het ontwerp.
  positie?: string
  kast?: string
  codeInOntwerp?: string
}
