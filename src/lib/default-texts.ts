import { DefaultTexts } from './types'

// Fallback zolang de finka_default_texts-migratie nog niet gedraaid is (of de
// rij om wat voor reden dan ook ontbreekt) — zelfde tekst als voorheen
// hardcoded in QuoteEditor.tsx/aansluitschema.ts, zodat gedrag ongewijzigd
// blijft totdat de migratie is uitgevoerd. Zie ook DEFAULT_EUROLINE_RATES in
// euroline-calc.ts voor hetzelfde patroon.
export const DEFAULT_TEXTS: DefaultTexts = {
  id: '',
  offerte_closing_quote: 'Op naar een prachtig resultaat.',
  offerte_disclaimer_text: 'Onder voorbehoud van definitieve prijzen en orderbevestiging door FINKA keukens.',
  offerte_connections_disclaimer: 'Graag maten goed controleren. Wij zijn niet aansprakelijk voor verkeerd doorgegeven maten of niet gecontroleerde maten.',
  aansluitschema_let_op_notities: `- Bij een kookeiland met daarboven een eilandafzuigkap moet het plafond ter plaatse van tenminste 50 kg draagkracht zijn; een deugdelijke constructie is vereist om de kap aan op te hangen.
- Het plafond moet afgewerkt zijn. Vraag hier vooraf advies over bij uw aannemer.
- Alle maten zijn hartmaten vanaf de afgewerkte vloer.
- De stopcontacten dienen vlak inbouw te zijn.
- Aansluitmaterialen zoals perilex stekker, afvoer syphon en dergelijke worden niet meegeleverd.
- Achter en onder de plaats waar apparatuur komt te staan, mag geen leidingwerk lopen.
- Alle stopcontacten moeten voorzien zijn van randaarde.
- Wanneer er een kickspace op de cv-installatie komt, wordt vooraf een kogelafsluitkraan gemonteerd.
- Oven en kookplaat moeten op verschillende groepen worden aangesloten.`,
  updated_at: '',
}
