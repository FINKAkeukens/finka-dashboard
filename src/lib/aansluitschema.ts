import { ConnectionCabinet, ConnectionCategory, ConnectionItem, PinType } from './types'

export const CATEGORY_ORDER: ConnectionCategory[] = ['water_afvoer', 'elektra', 'overig']

export const CATEGORY_LABELS: Record<ConnectionCategory, string> = {
  water_afvoer: 'Water en afvoer',
  elektra: 'Elektra – inbouw wandcontactdozen of flexibele aansluitingen (geaard)',
  overig: 'Overig',
}

export const PIN_TYPE_LABELS: Record<PinType, string> = {
  warm_water: 'Warm water',
  koud_water: 'Koud water',
  afvoer: 'Afvoer',
  elektra: 'Elektra',
}

export const PIN_TYPE_COLORS: Record<PinType, string> = {
  warm_water: '#DC2626',
  koud_water: '#2563EB',
  afvoer: '#4B5563',
  elektra: '#D97706',
}

// Vaste standaardlijst — 1-op-1 overgenomen uit Merels bestaande
// aansluitschema-tekst (FINKA-aansluitschema-Breda-20260811.pdf). Elk nieuw
// project krijgt deze regels automatisch bij eerste bezoek van het tabblad
// (zie AansluitschemaTab.tsx), allemaal standaard uitgevinkt — staff vinkt
// aan wat van toepassing is en vult aantal/hoogte/positie in. standard_key
// zorgt dat een regel herkenbaar blijft ook als de omschrijving lokaal wordt
// aangepast.
export const DEFAULT_CONNECTION_ITEMS: Array<{
  standard_key: string
  category: ConnectionCategory
  omschrijving: string
}> = [
  // Water en afvoer
  { standard_key: 'warm_water_spoelbak', category: 'water_afvoer', omschrijving: 'Warm water aansluiting d.m.v. 15 mm koper of ½" muurplaat' },
  { standard_key: 'koud_water_spoelbak', category: 'water_afvoer', omschrijving: 'Koud water aansluiting d.m.v. 15 mm koper of ½" muurplaat' },
  { standard_key: 'koud_water_vaatwasser', category: 'water_afvoer', omschrijving: 'Koud water aansluiting t.b.v. vaatwasser / wasmachine (met beluchterkraan)' },
  { standard_key: 'pvc_afvoer', category: 'water_afvoer', omschrijving: 'PVC afvoer 40 mm t.b.v. spoelbak en/of vaatwasser, 15 cm boven de plint' },
  { standard_key: 'gaskraan', category: 'water_afvoer', omschrijving: 'Haakse gaskraan, max. 4 cm uit de muur, bereikbaar en niet achter apparatuur' },
  // Elektra
  { standard_key: 'combi_stoomoven', category: 'elektra', omschrijving: 'T.b.v. combi- / stoomoven, max. 3680 watt' },
  { standard_key: 'oven', category: 'elektra', omschrijving: 'T.b.v. oven of combimagnetron, max. 3680 watt' },
  { standard_key: 'vonkontsteking', category: 'elektra', omschrijving: 'T.b.v. vonkontsteking gaskookplaat' },
  { standard_key: 'koelkast', category: 'elektra', omschrijving: 'T.b.v. koelkast / vriezer' },
  { standard_key: 'vaatwasser_elektra', category: 'elektra', omschrijving: 'T.b.v. vaatwasser / wasmachine, max. 3680 watt' },
  { standard_key: 'afzuigkap', category: 'elektra', omschrijving: 'T.b.v. afzuigkap — bij een eilandkap is een kabel met contrastekker nodig' },
  { standard_key: 'tweede_oven', category: 'elektra', omschrijving: 'T.b.v. tweede oven / combimagnetron, max. 3680 watt' },
  { standard_key: 'magnetron', category: 'elektra', omschrijving: 'T.b.v. magnetron' },
  { standard_key: 'afzuigunit_verlichting', category: 'elektra', omschrijving: 'Enkel / dubbel t.b.v. inbouw afzuigunit of verlichting' },
  { standard_key: 'koffiezetapparaat', category: 'elektra', omschrijving: 'T.b.v. koffiezetapparaat, max. 3680 watt' },
  { standard_key: 'verlichting', category: 'elektra', omschrijving: 'T.b.v. verlichting — moet spanning krijgen via een schakelaar' },
  { standard_key: 'boiler_kokendwaterkraan', category: 'elektra', omschrijving: 'T.b.v. boiler of kokendwaterkraan (± 3680 watt)' },
  { standard_key: 'perilex', category: 'elektra', omschrijving: 'Perilex wandcontactdoos, 7400 watt, t.b.v. kookplaat / oven / fornuis / stoomoven' },
  { standard_key: 'energiezuil', category: 'elektra', omschrijving: 'Aansluitpunt t.b.v. inbouw stopcontact of energiezuil' },
  // Overig
  { standard_key: 'afzuigkap_afvoer', category: 'overig', omschrijving: 'Aansluiting voor afvoer afzuigkap. Diameter volgens voorschrift leverancier; afvoergat afhankelijk van de bouwkundige situatie' },
  { standard_key: 'loze_leiding_verlichting', category: 'overig', omschrijving: 'Loze leiding 22 mm t.b.v. aansluiting verlichting' },
  { standard_key: 'vloerdoos_eiland', category: 'overig', omschrijving: 'Vloerdoos / doorvoer in de vloer t.b.v. eiland' },
]

export const DEFAULT_LET_OP_NOTITIES = `- Bij een kookeiland met daarboven een eilandafzuigkap moet het plafond ter plaatse van tenminste 50 kg draagkracht zijn; een deugdelijke constructie is vereist om de kap aan op te hangen.
- Het plafond moet afgewerkt zijn. Vraag hier vooraf advies over bij uw aannemer.
- Alle maten zijn hartmaten vanaf de afgewerkte vloer.
- De stopcontacten dienen vlak inbouw te zijn.
- Aansluitmaterialen zoals perilex stekker, afvoer syphon en dergelijke worden niet meegeleverd.
- Achter en onder de plaats waar apparatuur komt te staan, mag geen leidingwerk lopen.
- Alle stopcontacten moeten voorzien zijn van randaarde.
- Wanneer er een kickspace op de cv-installatie komt, wordt vooraf een kogelafsluitkraan gemonteerd.
- Oven en kookplaat moeten op verschillende groepen worden aangesloten.`

export function seedConnectionItems(projectId: string): Omit<ConnectionItem, 'id' | 'created_at' | 'updated_at'>[] {
  return DEFAULT_CONNECTION_ITEMS.map((item, i) => ({
    project_id: projectId,
    category: item.category,
    standard_key: item.standard_key,
    sort_order: i,
    omschrijving: item.omschrijving,
    van_toepassing: false,
    aantal: null,
    hoogte_cm: null,
    positie_toelichting: null,
  }))
}

export interface CabinetPosition {
  cabinet: ConnectionCabinet
  xStartMm: number
  xEndMm: number
}

// Cumulatieve mm-posities van links naar rechts — puur rekenwerk uit de
// breedtes, zodat de maatlat en de pin-hulplijnen altijd kloppen zonder dat
// iemand handmatig een totaalbreedte hoeft bij te houden.
export function computeCabinetPositions(cabinets: ConnectionCabinet[]): { positions: CabinetPosition[]; totalWidthMm: number } {
  const sorted = [...cabinets].sort((a, b) => a.sort_order - b.sort_order)
  let cursor = 0
  const positions: CabinetPosition[] = sorted.map((cabinet) => {
    const xStartMm = cursor
    cursor += cabinet.breedte_mm
    return { cabinet, xStartMm, xEndMm: cursor }
  })
  return { positions, totalWidthMm: cursor }
}
