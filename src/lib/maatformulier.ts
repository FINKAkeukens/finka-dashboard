import { MaatformulierFieldType, MaatformulierItem } from './types'

export const MAATFORMULIER_TYPE_LABELS: Record<MaatformulierFieldType, string> = {
  ja_nee: 'Ja / Nee',
  ja_nee_nvt: 'Ja / Nee / N.v.t.',
  tekst: 'Tekst',
  getal: 'Getal (met eenheid)',
  keuze: 'Eigen keuzeopties',
  afspraak: 'Afspraak (alleen tekst)',
}

// Elke 'keuze'-regel krijgt deze optie automatisch erbij (niet als losse
// waarde in options — zo kan hij niet per ongeluk verwijderd worden en hoeft
// hij niet bij elke regel apart te worden toegevoegd). Zelfde aanpak als bij
// de vragenlijst, zie MULTI_SELECT_OTHER_OPTION in src/lib/questionnaire.ts.
export const MAATFORMULIER_OTHER_OPTION = 'Anders, namelijk...'

// Het eigen antwoord wordt opgeslagen als "Anders: <tekst>" in dezelfde
// answer-kolom. Dat blijft leesbaar in het dashboard (staff ziet gewoon
// "Anders: graniet") en vraagt geen extra kolom of JSON.
const OTHER_PREFIX = 'Anders:'

// Vaste keuzes per type; 'keuze' haalt ze uit het item zelf.
export function answerOptions(item: Pick<MaatformulierItem, 'type' | 'options'>): string[] {
  switch (item.type) {
    case 'ja_nee': return ['Ja', 'Nee']
    case 'ja_nee_nvt': return ['Ja', 'Nee', 'N.v.t.']
    case 'keuze': return [...item.options, MAATFORMULIER_OTHER_OPTION]
    default: return []
  }
}

export interface KeuzeAnswer {
  // De aangeklikte optie; MAATFORMULIER_OTHER_OPTION bij een eigen antwoord.
  option: string
  // Alleen gevuld bij een eigen antwoord.
  other: string
}

export function parseKeuzeAnswer(answer: string | null): KeuzeAnswer {
  if (!answer) return { option: '', other: '' }
  if (answer === OTHER_PREFIX || answer.startsWith(`${OTHER_PREFIX} `)) {
    return { option: MAATFORMULIER_OTHER_OPTION, other: answer.slice(OTHER_PREFIX.length).trim() }
  }
  return { option: answer, other: '' }
}

export function serializeKeuzeAnswer({ option, other }: KeuzeAnswer): string {
  if (!option) return ''
  if (option !== MAATFORMULIER_OTHER_OPTION) return option
  return other.trim() ? `${OTHER_PREFIX} ${other.trim()}` : OTHER_PREFIX
}

// Weergave van een antwoord in het dashboard — met eenheid erachter, en een
// duidelijke tekst zolang de klant nog niets heeft ingevuld.
export function formatAnswer(item: Pick<MaatformulierItem, 'type' | 'answer' | 'unit'>): string {
  if (item.type === 'afspraak') return ''
  if (!item.answer) return 'Nog niet ingevuld'
  return item.unit ? `${item.answer} ${item.unit}` : item.answer
}

// --- Sub-vragen -----------------------------------------------------------
// Een sub-vraag hangt via parent_id aan een vraag erboven en verschijnt pas
// zodra die met show_when_answer is beantwoord (migratie-sectie 67). Alleen
// vragen met vaste antwoordopties kunnen een ouder zijn — bij een vrij
// tekst-/getalveld valt er niets betrouwbaars op te vergelijken.

export function canHaveSubQuestions(item: Pick<MaatformulierItem, 'type' | 'options'>): boolean {
  return answerOptions(item).length > 0
}

// Vragen waaraan `item` als sub-vraag gekoppeld mag worden: alleen regels
// boven zichzelf in hetzelfde kopje, met vaste antwoordopties, en nooit een
// eigen (klein)kind — dat zou een kringetje opleveren.
export function possibleParents<
  T extends Pick<MaatformulierItem, 'id' | 'parent_id' | 'type' | 'options' | 'sort_order'>
>(item: T, itemsInCategory: T[]): T[] {
  const byId = new Map(itemsInCategory.map((i) => [i.id, i]))
  const isDescendantOfItem = (candidate: T): boolean => {
    let current: T | undefined = candidate
    while (current?.parent_id) {
      if (current.parent_id === item.id) return true
      current = byId.get(current.parent_id)
    }
    return false
  }
  return itemsInCategory.filter(
    (other) =>
      other.id !== item.id &&
      other.sort_order < item.sort_order &&
      canHaveSubQuestions(other) &&
      !isDescendantOfItem(other)
  )
}

// Vergelijkt het gegeven antwoord met de trigger van een sub-vraag. Bij een
// 'keuze'-antwoord kan er "Anders: <tekst>" staan — dan telt de gekozen
// optie, niet de vrije tekst erachter (zie parseKeuzeAnswer).
export function matchesTrigger(parentAnswer: string | null, showWhenAnswer: string | null): boolean {
  if (!showWhenAnswer) return true
  return parseKeuzeAnswer(parentAnswer).option === showWhenAnswer
}

// Of een regel op dit moment getoond moet worden, gegeven de huidige
// antwoorden. Een sub-vraag waarvan de ouder zelf verborgen is (bv. omdat
// die weer een sub-vraag van iets anders is) blijft ook verborgen.
export function isItemVisible<T extends Pick<MaatformulierItem, 'id' | 'parent_id' | 'show_when_answer'>>(
  item: T,
  itemsById: Map<string, T>,
  answerOf: (itemId: string) => string | null
): boolean {
  if (!item.parent_id) return true
  const parent = itemsById.get(item.parent_id)
  if (!parent) return true
  if (!matchesTrigger(answerOf(parent.id), item.show_when_answer)) return false
  return isItemVisible(parent, itemsById, answerOf)
}

// Regels op volgorde, met elke sub-vraag direct onder z'n ouder (i.p.v.
// puur op sort_order, waar een sub-vraag los van z'n ouder zou kunnen
// belanden). Geeft per regel het nestniveau mee voor de inspringing.
export function itemsInTreeOrder<T extends Pick<MaatformulierItem, 'id' | 'parent_id' | 'sort_order'>>(
  items: T[]
): { item: T; depth: number }[] {
  const childrenOf = new Map<string | null, T[]>()
  const knownIds = new Set(items.map((i) => i.id))
  for (const item of items) {
    // Een sub-vraag waarvan de ouder buiten deze lijst valt (bv. door een
    // filter op zichtbaarheid) hoort hier als hoofdvraag, niet te verdwijnen.
    const key = item.parent_id && knownIds.has(item.parent_id) ? item.parent_id : null
    const list = childrenOf.get(key) ?? []
    list.push(item)
    childrenOf.set(key, list)
  }
  const result: { item: T; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    const children = (childrenOf.get(parentId) ?? []).sort((a, b) => a.sort_order - b.sort_order)
    for (const child of children) {
      result.push({ item: child, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

// Volgorde van de kopjes bij een project: net als bij de checklist bepaald
// door de laagste sort_order per kopje, zodat de sjabloonvolgorde behouden
// blijft zonder die apart op te slaan.
export function categoriesInOrder(items: Pick<MaatformulierItem, 'category' | 'sort_order'>[]): string[] {
  const minOrder = new Map<string, number>()
  for (const item of items) {
    const current = minOrder.get(item.category)
    if (current === undefined || item.sort_order < current) minOrder.set(item.category, item.sort_order)
  }
  return Array.from(minOrder.entries()).sort((a, b) => a[1] - b[1]).map(([label]) => label)
}
