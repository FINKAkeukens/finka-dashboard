import { EurolineInputs, EurolineRates } from './types'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// Fallback als de instellingenrij (nog) niet geladen kon worden — zelfde
// waarden als de DB-defaults in de migratie. De tarieven zelf worden beheerd
// via Instellingen → Euroline-tarieven, niet meer hardcoded.
export const DEFAULT_EUROLINE_RATES: EurolineRates = {
  id: '',
  opslag_base: 139.75,
  opslag_per_week_extra: 23.75,
  levering_base: 282.75,
  levering_groter_toeslag: 124.75,
  levering_niet_begane_grond: 120.25,
  levering_verhuislift: 250,
  levering_extra_lostijd_per_halfuur: 64.50,
  levering_buiten_werkgebied: 124.75,
  werkblad_multiplex: 33.50,
  werkblad_composiet: 77.50,
  installatie_per_m1: 207.50,
  installatie_buitengebied_per_m1: 250,
  service_tarief_per_uur: 75,
  service_minimum: 250,
  updated_at: '',
}

export const DEFAULT_EUROLINE_INPUTS: EurolineInputs = {
  montage_meters: 0,
  installatie_buitengebied: false,
  opslag_extra_weken: 0,
  levering_groter: false,
  levering_niet_begane_grond: false,
  levering_verhuislift: false,
  levering_buiten_werkgebied: false,
  levering_extra_lostijd_halfuren: 0,
  werkblad_levering: 'geen',
  service_uren: 0,
}

// "Inbegrepen"-posten uit het Euroline-tarievenblad — dingen die altijd al
// in de basisprijs zitten (dus geen aparte optie in de rekentool), puur ter
// informatie via het i-icoontje.
export const EUROLINE_INBEGREPEN: Record<'opslag' | 'levering' | 'installatie' | 'service', string[]> = {
  opslag: [
    'Opslag van apparatuur voor 3 weken, per pallet plek',
    'Opslag van een keukenwerkblad voor 3 weken',
    'Werkblad-opslag na 3 weken (inbegrepen bij de keuken)',
  ],
  levering: [
    'Lostijd van 1 uur bij een reguliere levering',
    'Levering van een keuken binnen Noord-Holland (werkgebied Euroline Logistiek)',
  ],
  installatie: [
    'Entree tot het portaal, koppeling met Simar of Compusoft',
    'Digitale beoordeling afleverlocatie',
    'Planning levering keukens in overleg met de klant',
    'Verzekering van de keukenmaterialen zodra Euroline ze onder zich heeft',
    'Rijplaten bij levering (indien nodig)',
    'Beschermhoezen schoenen',
    'Visuele weergave voor- en na de levering van de keuken',
    'Uitgebreide rapportage van oplevering (bij montage)',
    '99% schadevrije aflevering van keukens (2025)',
  ],
  service: [],
}

export interface EurolineTotals {
  opslag: number
  levering: number
  installatie: number
  service: number
}

export function computeEurolineTotals(inputs: EurolineInputs, rates: EurolineRates): EurolineTotals {
  const werkbladLeveringToeslag =
    inputs.werkblad_levering === 'multiplex' ? rates.werkblad_multiplex
    : inputs.werkblad_levering === 'composiet' ? rates.werkblad_composiet
    : 0

  const opslag = round2(rates.opslag_base + inputs.opslag_extra_weken * rates.opslag_per_week_extra)
  const levering = round2(
    rates.levering_base +
    (inputs.levering_groter ? rates.levering_groter_toeslag : 0) +
    (inputs.levering_niet_begane_grond ? rates.levering_niet_begane_grond : 0) +
    (inputs.levering_verhuislift ? rates.levering_verhuislift : 0) +
    (inputs.levering_buiten_werkgebied ? rates.levering_buiten_werkgebied : 0) +
    inputs.levering_extra_lostijd_halfuren * rates.levering_extra_lostijd_per_halfuur +
    werkbladLeveringToeslag
  )
  const installatie = round2(
    inputs.montage_meters * (inputs.installatie_buitengebied ? rates.installatie_buitengebied_per_m1 : rates.installatie_per_m1)
  )
  const service = round2(
    inputs.service_uren > 0
      ? Math.max(inputs.service_uren * rates.service_tarief_per_uur, rates.service_minimum)
      : 0
  )

  return { opslag, levering, installatie, service }
}

// Klantvriendelijke samenvatting — som van de 4 posten, zoals die in de
// kostprijs-opbouw (Opslag/Levering/Installatie/Service) terechtkomen.
export function eurolineTotaalExclBtw(totals: EurolineTotals): number {
  return round2(totals.opslag + totals.levering + totals.installatie + totals.service)
}
