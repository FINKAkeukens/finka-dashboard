import 'server-only'
import { DEFAULT_COST_BREAKDOWN, KASTEN_DISCOUNTS } from '@/lib/configurator'

// Van catalogus-brutopunten naar een prijsindicatie voor de klant: dezelfde
// rekenregels als het kostenoverzicht (Sachsen structurele korting −45% −10%,
// marge Keukenkastjes) plus btw. De betaalkorting telt bewust niet mee, zodat
// de indicatie eerder iets te hoog dan te laag is. Alleen server-side
// gebruiken: brutopunten gaan nooit naar de klant.

const BTW = 0.21

function factor(): number {
  const korting = KASTEN_DISCOUNTS.find((d) => d.key === 'sachsen_structureel')
  const netto = (korting?.percentages ?? []).reduce((f, p) => f * (1 - p / 100), 1)
  const marge = DEFAULT_COST_BREAKDOWN.find((r) => r.key === 'keukenkastjes')?.marge_percentage ?? 0
  return netto * (1 + marge / 100) * (1 + BTW)
}

const FACTOR = factor()

// Afgerond op hele euro's: het blijft een indicatie.
export function klantPrijs(bruto: number): number {
  return Math.round(bruto * FACTOR)
}
