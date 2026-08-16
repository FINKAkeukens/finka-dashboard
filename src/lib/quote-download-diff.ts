import type { CustomerCostLine, CostBreakdownItem, PageDisclaimerKey, Quote, QuoteCustomerSection, QuoteDownloadItemSnapshot, QuoteDownloadSnapshot, QuoteItem } from './types'

// De klant-zichtbare velden (dezelfde selectie als offerte/[projectId]/page.tsx
// rendert) plús de interne kostprijs-opbouw (cost_breakdown + de losse regels
// uit finka_quote_items + de interne totalen) — Merel wil in de
// downloadgeschiedenis ook zien of er tussen twee downloads intern aan de
// kostprijzen is gesleuteld, niet alleen wat de klant te zien kreeg.
export function buildDownloadSnapshot(quote: Quote, items: QuoteItem[]): QuoteDownloadSnapshot {
  return {
    status: quote.status,
    customer_document_label: quote.customer_document_label,
    customer_headline: quote.customer_headline,
    customer_subtitle: quote.customer_subtitle,
    customer_intro_text: quote.customer_intro_text,
    customer_sections: quote.customer_sections,
    customer_cost_lines: quote.customer_cost_lines,
    customer_connections_intro: quote.customer_connections_intro,
    customer_connections_disclaimer: quote.customer_connections_disclaimer,
    customer_connections: quote.customer_connections,
    customer_closing_heading: quote.customer_closing_heading,
    customer_closing_text: quote.customer_closing_text,
    customer_closing_quote: quote.customer_closing_quote,
    customer_disclaimer_text: quote.customer_disclaimer_text,
    page_disclaimers: quote.page_disclaimers,
    price: quote.customer_price ?? quote.total_price,
    cost_breakdown: quote.cost_breakdown,
    internal_subtotal: quote.subtotal,
    internal_total_price: quote.total_price,
    items: items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: i.line_total,
    })),
    plattegrond_url: quote.plattegrond_url,
    render_urls: quote.render_urls,
    standaard_afbeeldingen: quote.standaard_afbeeldingen,
    cover_image_url: quote.cover_image_url,
    connections_image_url: quote.connections_image_url,
  }
}

const PAGE_DISCLAIMER_LABELS: Record<PageDisclaimerKey, string> = {
  voorpagina: 'Voorpagina',
  toelichting: 'Toelichting',
  kosten: 'Kostenpagina',
  ontwerp: 'Ontwerp-pagina',
  vervolg: 'Vervolgpagina',
  afsluiting: 'Afsluiting',
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// Vergelijkt alleen de daadwerkelijk afgedrukte regels (included: true, niet-
// lege tekst) — precies wat de klant op de PDF ziet, zie ook de filter in
// offerte/[projectId]/page.tsx.
function printedLines(sections: QuoteCustomerSection[]): string[] {
  return sections.flatMap((s) => s.lines.filter((l) => l.included && l.text.trim()).map((l) => `${s.title}: ${l.text}`))
}

function diffSections(prev: QuoteCustomerSection[], curr: QuoteCustomerSection[]): string[] {
  const prevLines = new Set(printedLines(prev))
  const currLines = new Set(printedLines(curr))
  const added = [...currLines].filter((l) => !prevLines.has(l))
  const removed = [...prevLines].filter((l) => !currLines.has(l))
  const messages: string[] = []
  if (added.length) messages.push(`${added.length} regel(s) toegevoegd bij "Wat zit erin" (o.a. ${added.slice(0, 2).join(', ')}${added.length > 2 ? ', ...' : ''})`)
  if (removed.length) messages.push(`${removed.length} regel(s) verwijderd bij "Wat zit erin" (o.a. ${removed.slice(0, 2).join(', ')}${removed.length > 2 ? ', ...' : ''})`)
  return messages
}

function diffCostLines(prev: CustomerCostLine[], curr: CustomerCostLine[]): string[] {
  if (eq(prev, curr)) return []
  const messages: string[] = []
  const prevByLabel = new Map(prev.map((l) => [l.label, l]))
  const currByLabel = new Map(curr.map((l) => [l.label, l]))
  for (const [label, line] of currByLabel) {
    const prevLine = prevByLabel.get(label)
    if (!prevLine) messages.push(`Investeringsregel "${label}" toegevoegd (${formatPrice(line.amount)})`)
    else if (prevLine.amount !== line.amount) messages.push(`"${label}" gewijzigd van ${formatPrice(prevLine.amount)} naar ${formatPrice(line.amount)}`)
  }
  for (const label of prevByLabel.keys()) {
    if (!currByLabel.has(label)) messages.push(`Investeringsregel "${label}" verwijderd`)
  }
  return messages
}

// Interne kostprijs-opbouw (Keukenkastjes/Werkblad/Apparatuur/.../Service) —
// vergelijkt zowel de werkelijke kosten als het margepercentage per categorie.
function diffCostBreakdown(prev: CostBreakdownItem[], curr: CostBreakdownItem[]): string[] {
  if (eq(prev, curr)) return []
  const messages: string[] = []
  const prevByKey = new Map(prev.map((r) => [r.key, r]))
  for (const row of curr) {
    const prevRow = prevByKey.get(row.key)
    if (!prevRow) continue
    if (prevRow.werkelijke_kosten !== row.werkelijke_kosten) {
      messages.push(`Interne kostprijs "${row.label}" gewijzigd van ${formatPrice(prevRow.werkelijke_kosten)} naar ${formatPrice(row.werkelijke_kosten)}`)
    }
    if (prevRow.marge_percentage !== row.marge_percentage) {
      messages.push(`Marge "${row.label}" gewijzigd van ${prevRow.marge_percentage}% naar ${row.marge_percentage}%`)
    }
  }
  return messages
}

// Interne losse regels (finka_quote_items) — gematcht op id (stabiel na een
// save, zie de handleSave-fix in QuoteEditor.tsx) i.p.v. omschrijving, want
// twee regels kunnen toevallig dezelfde omschrijving hebben.
function diffItems(prev: QuoteDownloadItemSnapshot[], curr: QuoteDownloadItemSnapshot[]): string[] {
  if (eq(prev, curr)) return []
  const messages: string[] = []
  const prevById = new Map(prev.map((i) => [i.id, i]))
  const currById = new Map(curr.map((i) => [i.id, i]))
  for (const [id, item] of currById) {
    const prevItem = prevById.get(id)
    if (!prevItem) {
      messages.push(`Interne regel "${item.description || '(zonder omschrijving)'}" toegevoegd (${formatPrice(item.line_total)})`)
    } else if (prevItem.unit_price !== item.unit_price || prevItem.quantity !== item.quantity || prevItem.line_total !== item.line_total) {
      messages.push(`Interne regel "${item.description || '(zonder omschrijving)'}" gewijzigd van ${formatPrice(prevItem.line_total)} naar ${formatPrice(item.line_total)}`)
    }
  }
  for (const id of prevById.keys()) {
    if (!currById.has(id)) {
      const removed = prevById.get(id)!
      messages.push(`Interne regel "${removed.description || '(zonder omschrijving)'}" verwijderd`)
    }
  }
  return messages
}

// Levert een lijst leesbare Nederlandse regels op met wat er is veranderd
// t.o.v. de vorige download. `prev` is null bij de allereerste download.
export function diffQuoteSnapshots(prev: QuoteDownloadSnapshot | null, curr: QuoteDownloadSnapshot): string[] {
  if (!prev) return []

  const changes: string[] = []

  if (prev.status !== curr.status) changes.push(`Status gewijzigd van "${prev.status}" naar "${curr.status}"`)
  if (prev.price !== curr.price) changes.push(`Prijs gewijzigd van ${formatPrice(prev.price)} naar ${formatPrice(curr.price)}`)

  changes.push(...diffCostBreakdown(prev.cost_breakdown, curr.cost_breakdown))
  changes.push(...diffItems(prev.items, curr.items))
  if (prev.internal_subtotal !== curr.internal_subtotal) changes.push(`Interne subtotaal gewijzigd van ${formatPrice(prev.internal_subtotal)} naar ${formatPrice(curr.internal_subtotal)}`)
  if (prev.internal_total_price !== curr.internal_total_price) changes.push(`Intern totaal gewijzigd van ${formatPrice(prev.internal_total_price)} naar ${formatPrice(curr.internal_total_price)}`)

  if (prev.customer_document_label !== curr.customer_document_label) changes.push('Documentlabel aangepast')
  if (prev.customer_headline !== curr.customer_headline) changes.push('Kop aangepast')
  if (prev.customer_subtitle !== curr.customer_subtitle) changes.push('Ondertitel aangepast')
  if (prev.customer_intro_text !== curr.customer_intro_text) changes.push('Introtekst aangepast')

  changes.push(...diffSections(prev.customer_sections, curr.customer_sections))
  changes.push(...diffCostLines(prev.customer_cost_lines, curr.customer_cost_lines))

  if (!eq(prev.customer_connections, curr.customer_connections)) changes.push('Aansluitingenlijst aangepast')
  if (prev.customer_connections_intro !== curr.customer_connections_intro) changes.push('Introtekst aansluitingen aangepast')
  if (prev.customer_connections_disclaimer !== curr.customer_connections_disclaimer) changes.push('Disclaimer aansluitingen aangepast')
  if (!eq(prev.connections_image_url, curr.connections_image_url)) changes.push('Aansluitschema-afbeelding gewijzigd')

  if (prev.customer_closing_heading !== curr.customer_closing_heading) changes.push('Afsluitende kop aangepast')
  if (prev.customer_closing_text !== curr.customer_closing_text) changes.push('Afsluitende tekst aangepast')
  if (prev.customer_closing_quote !== curr.customer_closing_quote) changes.push('Afsluitende quote aangepast')
  if (prev.customer_disclaimer_text !== curr.customer_disclaimer_text) changes.push('Disclaimer prijspagina aangepast')

  if (!eq(prev.page_disclaimers, curr.page_disclaimers)) {
    const keys = new Set([...Object.keys(prev.page_disclaimers ?? {}), ...Object.keys(curr.page_disclaimers ?? {})]) as Set<PageDisclaimerKey>
    for (const key of keys) {
      const before = prev.page_disclaimers?.[key]
      const after = curr.page_disclaimers?.[key]
      if (before !== after) changes.push(`Disclaimer "${PAGE_DISCLAIMER_LABELS[key] ?? key}" aangepast`)
    }
  }

  if (!eq(prev.plattegrond_url, curr.plattegrond_url)) changes.push('Plattegrond gewijzigd')
  if (!eq(prev.render_urls, curr.render_urls)) changes.push('Renders gewijzigd')
  if (!eq(prev.standaard_afbeeldingen, curr.standaard_afbeeldingen)) changes.push('Standaardafbeeldingen gewijzigd')
  if (!eq(prev.cover_image_url, curr.cover_image_url)) changes.push('Voorpagina-afbeelding gewijzigd')

  return changes
}
