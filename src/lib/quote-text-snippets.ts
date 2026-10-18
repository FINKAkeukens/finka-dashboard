import { QuoteTextSnippet } from './types'

// Alle invulvelden van de offerte waar een standaardtekst voor kan worden
// klaargezet (finka_quote_text_snippets.field_key). Volgorde = volgorde op
// /instellingen/teksten, gelijk aan de volgorde in QuoteEditor.tsx.
//
// mode bepaalt wat "invoegen" in de offerte doet:
//   'text'   — meerregelig veld: leeg → tekst, anders onderaan toegevoegd
//   'line'   — eenregelig veld: tekst vervangt wat er staat
//   'lines'  — sectieregels: elke regel van de tekst wordt een nieuwe regel
//   'cost'   — kostenregel: nieuwe regel met naam = label, tekst = omschrijving
//   'discount' — kortingsregel: nieuwe regel met tekst = omschrijving
export type QuoteTextFieldMode = 'text' | 'line' | 'lines' | 'cost' | 'discount'

export interface QuoteTextField {
  key: string
  group: string
  label: string
  mode: QuoteTextFieldMode
  hint?: string
}

export const QUOTE_TEXT_FIELDS: QuoteTextField[] = [
  { key: 'disclaimer_ontwerp', group: 'Ontwerp / tekening', label: 'Disclaimer — ontwerp/tekening', mode: 'text' },
  { key: 'korting', group: 'Prijs (intern)', label: 'Korting — omschrijving', mode: 'discount', hint: 'Voegt een nieuwe kortingsregel toe met deze omschrijving (bedrag vul je zelf in).' },
  { key: 'document_label', group: 'Voorpagina', label: 'Documentnaam', mode: 'line', hint: 'Bijv. "Offerte" of "Prijsindicatie".' },
  { key: 'headline', group: 'Voorpagina', label: 'Titel op voorpagina', mode: 'line', hint: 'Zet een woord tussen *sterretjes* voor cursief; Enter = tweede regel.' },
  { key: 'subtitle', group: 'Voorpagina', label: 'Korte omschrijving (onder de titel)', mode: 'text' },
  { key: 'disclaimer_voorpagina', group: 'Voorpagina', label: 'Disclaimer — voorpagina', mode: 'text' },
  { key: 'intro', group: 'Toelichting', label: 'Introtekst', mode: 'text' },
  { key: 'disclaimer_toelichting', group: 'Toelichting', label: 'Disclaimer — toelichting', mode: 'text' },
  { key: 'sectie_titel', group: 'Secties', label: 'Sectietitel', mode: 'line' },
  { key: 'sectie_regels', group: 'Secties', label: 'Sectieregels', mode: 'lines', hint: 'Elke regel van de tekst wordt een eigen regel in de sectie.' },
  { key: 'disclaimer_sectie', group: 'Secties', label: 'Disclaimer — onderaan een sectie', mode: 'text' },
  { key: 'kostenregel', group: 'Kosten', label: 'Kostenregel', mode: 'cost', hint: 'Naam = label van de regel (bijv. KEUKEN), tekst = omschrijving. Bedrag vul je zelf in.' },
  { key: 'disclaimer_kosten', group: 'Kosten', label: 'Disclaimer — kosten', mode: 'text' },
  { key: 'aansluitingen_toelichting', group: 'Opstelling en aansluitingen', label: 'Toelichting', mode: 'text' },
  { key: 'aansluitingen_disclaimer', group: 'Opstelling en aansluitingen', label: 'Disclaimer', mode: 'text' },
  { key: 'vervolg_titel', group: 'Vervolgpagina', label: 'Vervolgpagina — titel', mode: 'line' },
  { key: 'vervolg_tekst', group: 'Vervolgpagina', label: 'Vervolgpagina — tekst (volgende stappen)', mode: 'text' },
  { key: 'disclaimer_vervolg', group: 'Vervolgpagina', label: 'Disclaimer — vervolgpagina', mode: 'text' },
  { key: 'afsluitende_quote', group: 'Afsluiting', label: 'Afsluitende quote (laatste pagina)', mode: 'line' },
  { key: 'disclaimer_afsluiting', group: 'Afsluiting', label: 'Disclaimer — afsluitpagina', mode: 'text' },
  { key: 'voorbehoud', group: 'Afsluiting', label: 'Voorbehoud-tekst (onder de totaalprijs)', mode: 'text' },
]

export function snippetsFor(snippets: QuoteTextSnippet[], fieldKey: string) {
  return snippets
    .filter((s) => s.field_key === fieldKey && s.body.trim())
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

// Naam in het keuzemenu: de zelfgekozen naam, anders het begin van de tekst.
export function snippetMenuLabel(snippet: Pick<QuoteTextSnippet, 'title' | 'body'>) {
  if (snippet.title.trim()) return snippet.title.trim()
  const firstLine = snippet.body.trim().split('\n')[0]
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
}

// Invoegen in een tekstveld: leeg → de standaardtekst, meerregelig → onder
// de bestaande tekst erbij (nooit stilletjes iets weggooien), eenregelig →
// vervangen (een titel met twee titels erin heeft geen zin).
export function insertSnippetText(current: string, body: string, mode: QuoteTextFieldMode) {
  if (!current.trim() || mode === 'line') return body
  return `${current.trimEnd()}\n\n${body}`
}
