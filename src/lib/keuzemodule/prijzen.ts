import 'server-only'

// Prijsindicatie = de catalogusprijs zelf: volgens de Sachsen-catalogus is
// 1 verrekenpunt 1 euro. Bewust geen korting, opslag of btw erbij (Merel,
// 2026-11-08: "rekenen met de catalogusprijzen, niet met een korting uit de
// configurator"). Alleen server-side gebruiken, zodat er nooit meer dan de
// prijzen van de eigen opties naar de klant gaan.
export function klantPrijs(punten: number): number {
  return Math.round(punten)
}
