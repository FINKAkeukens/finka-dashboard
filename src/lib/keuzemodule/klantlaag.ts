// De "klantlaag" van de keuzemodule: hoe een Sachsenküchen-code uit Winner
// Flex wordt vertaald naar wat de klant in het portaal ziet. De keuzes zelf
// (welke kleuren, grepen, decors, prijzen) komen uit de ingelezen catalogus;
// hier staat alleen welke catalogusartikelen we aan de klant aanbieden en
// onder welke naam. Codepatronen gebruiken {b} voor de kastbreedte in drie
// cijfers (080) — zo vindt "Houten bestekset" bij een kast van 80 cm het
// artikel BEHSET080.

export type KastSoort = 'lade' | 'hoog' | 'spoel' | 'afval' | 'apparaat' | 'wand' | 'overig'

export const KAST_SOORT_LABELS: Record<KastSoort, string> = {
  lade: 'Ladekast',
  hoog: 'Hoge kast',
  spoel: 'Spoelkast',
  afval: 'Afvalkast',
  apparaat: 'Apparaat',
  wand: 'Wandkast',
  overig: 'Overig (niet tonen)',
}

// Kastcode → soort. Volgorde telt: specifieke patronen eerst.
export function soortVanCode(code: string): KastSoort {
  const c = code.toUpperCase().trim()
  if (/^D?US\d/.test(c)) return 'spoel'
  if (/^D?U\d-\d{3}Z?AB/.test(c) || /ZAB\d/.test(c)) return 'afval'
  if (/^D?UK\d/.test(c)) return 'apparaat' // kookplaatkast
  if (/^G[A-Z]+\d/.test(c)) return 'apparaat' // GI/GO/GS/GE…: apparatenkasten en -fronten (G208 = greep)
  if (/^D?U\d-\d{3}/.test(c)) return 'lade'
  if (/^D?V\d/.test(c) && !/^VSL/.test(c)) return 'hoog'
  if (/^D?H\d/.test(c)) return 'wand'
  return 'overig'
}

// Breedte in cm uit de code ("U6-080Z2" → 80, "UK6-100Z2-KA" → 100).
export function breedteVanCode(code: string): number | null {
  // Bij GI/GO-apparatenkasten is het getal de nishoogte, geen breedte.
  if (/^G[IO]/i.test(code.trim())) return null
  const m = code.match(/-(\d{3})/)
  return m ? Number(m[1]) : null
}

// ---------- indeling van ladekasten ----------

export interface Variant {
  key: string
  label: string
  // Schets in een vakje van 62×54: [x, y, b, h, soort] — 0 = lade, 1 = binnenlade (gestippeld), 2 = plank (lijn).
  parts: [number, number, number, number, 0 | 1 | 2][]
}

export const VARIANTEN: Variant[] = [
  { key: 'Z2', label: '2 grote lades', parts: [[4, 4, 54, 21, 0], [4, 29, 54, 21, 0]] },
  { key: 'Z2IK', label: '2 lades + binnenlade', parts: [[4, 4, 54, 21, 0], [4, 29, 54, 21, 0], [10, 7, 42, 8, 1]] },
  { key: 'Z3', label: '3 lades', parts: [[4, 4, 54, 11, 0], [4, 18, 54, 15, 0], [4, 36, 54, 14, 0]] },
  { key: '', label: '2 deuren met plank', parts: [[4, 4, 25, 46, 0], [33, 4, 25, 46, 0], [8, 26, 46, 0, 2]] },
]

// "U6-080Z2IK" → { basis: "U6-080", variant: "Z2IK" }; null als het geen
// standaard ladekast is (dan geen indelingskeuze).
export function splitLadeCode(code: string): { basis: string; variant: string } | null {
  const m = code.trim().match(/^(D?U\d-\d{3})(Z2IK|Z2|Z3)?$/)
  return m ? { basis: m[1], variant: m[2] ?? '' } : null
}

// ---------- extra's per kast ----------

export interface ExtraDef {
  key: string
  cat: string
  label: string
  sub: string
  // Catalogusartikel(en); eerste die bestaat telt. null = altijd "prijs volgt".
  codes: string[] | null
  // Herkent hetzelfde artikel in een Winner Flex-subpositie (al inbegrepen).
  herken?: RegExp
}

export const EXTRAS: Partial<Record<KastSoort, ExtraDef[]>> = {
  lade: [
    { key: 'besteh', cat: 'Lade-indeling', label: 'Houten bestekset', sub: 'Massief eiken of zwart essen', codes: ['BEHSET{b}'], herken: /^BEHSET/ },
    { key: 'bestekf', cat: 'Lade-indeling', label: 'Bestekset hout of composiet', sub: 'Modulair, ook in grijs composiet', codes: ['BEFSET{b}-6EN', 'BEFSET{b}-6QG'], herken: /^BEFSET/ },
    { key: 'bestekk', cat: 'Lade-indeling', label: 'Bestekbak kunststof', sub: 'Nachtgrijs, eenvoudig schoon te maken', codes: ['BE{b}-6AS'], herken: /^BE\d{3}-/ },
    { key: 'folie', cat: 'Lade-indeling', label: 'Foliesnijder', sub: 'Voor huishoudfolie en aluminiumfolie, hout', codes: ['BEHFE02-EN'], herken: /^BE[HF]FE02/ },
    { key: 'messen', cat: 'Lade-indeling', label: 'Messenblok in de lade', sub: 'Massief hout', codes: ['BEHFE03-EN'], herken: /^BE[HF]FE03/ },
    { key: 'kruiden', cat: 'Lade-indeling', label: 'Kruidenrekje in de lade', sub: 'Potjes liggen schuin en leesbaar, hout', codes: ['BEHFE04-EN'], herken: /^BE[HF]FE04/ },
    { key: 'univ', cat: 'Lade-indeling', label: 'Universele inzet', sub: 'Tweedelig, voor losse spullen', codes: ['BEHFE01-EN'], herken: /^BE[HF]FE01/ },
    { key: 'orga', cat: 'Lade-indeling', label: 'Losse bakjes', sub: 'Orga-container, massief hout', codes: ['MOC04-EN'], herken: /^MOC/ },
    { key: 'smart', cat: 'Potten en voorraad', label: 'Verdeelsysteem met schotjes', sub: 'Houdt pannen, deksels en potten op hun plek', codes: ['FADA{b}'], herken: /^FADA/ },
    { key: 'pantry', cat: 'Potten en voorraad', label: 'Voorraadbak met glazen deksel', sub: 'Pantry-box voor brood, groente of fruit', codes: ['APB-{b}'], herken: /^APB/ },
    { key: 'antislip', cat: 'Lade-indeling', label: 'Antislipmatten', sub: 'Per lade, voedselveilig', codes: ['RM{b}-6A', 'RM{b}-4A'], herken: /^RM\d/ },
    { key: 'licht', cat: 'Verlichting', label: 'Verlichting in de lades', sub: 'LED gaat aan als je de lade opent', codes: null },
  ],
  hoog: [
    { key: 'krat', cat: 'Potten en voorraad', label: 'Uittrekbaar voorraadkrat', sub: 'Massief hout, voor aardappels en uien', codes: ['MVB01-EN'], herken: /^MVB/ },
    { key: 'plank', cat: 'Planken', label: 'Extra legplank', sub: 'In de kleur van de binnenkant', codes: ['EB{b}-4'], herken: /^EB\d/ },
    { key: 'glas', cat: 'Planken', label: 'Glazen legplank', sub: 'Helder glas, 8 mm', codes: ['EBGL{b}-4'], herken: /^EBGL/ },
    { key: 'flesrek', cat: 'Potten en voorraad', label: 'Flessenrek', sub: 'Massief hout', codes: ['MFE01-EN'], herken: /^MFE/ },
    { key: 'licht', cat: 'Verlichting', label: 'Verlichting binnenin', sub: 'LED gaat aan als je de deur opent', codes: null },
  ],
  spoel: [
    { key: 'paz', cat: 'Schoonmaak', label: 'Uittrekbare schoonmaakhouder', sub: 'Korf met handvat en bakjes', codes: ['PAZ4'], herken: /^PAZ/ },
    { key: 'licht', cat: 'Verlichting', label: 'Verlichting binnenin', sub: 'LED gaat aan als je de deur opent', codes: null },
  ],
  afval: [
    { key: 'licht', cat: 'Verlichting', label: 'Verlichting in de lade', sub: 'LED gaat aan als je de lade opent', codes: null },
  ],
}

// Extra's aan de wand en verlichting: niet aan één kast gebonden.
export const WAND_EXTRAS: ExtraDef[] = [
  { key: 'reling', cat: 'Wand', label: 'Reling aan de wand, 90 cm', sub: 'Linero MosaiQ', codes: ['NMQPL090'] },
  { key: 'nisreling', cat: 'Wand', label: 'Verlichte nisreling, 120 cm', sub: 'Met LED, glazen plank en verschuifbare houders', codes: ['NRB01L-120ED', 'NRB01L-120SW'] },
  { key: 'bovenlicht', cat: 'Verlichting', label: 'Verlichting onder de bovenkast', sub: 'LED warm wit, 120 cm', codes: ['LA5M-120'] },
  { key: 'plintlicht', cat: 'Verlichting', label: 'Plintverlichting', sub: 'LED-strip warm wit', codes: ['LS15M-L'] },
  { key: 'stopcontact', cat: 'Wand', label: 'Inbouwstopcontact in het werkblad', sub: 'Komt omhoog als je erop drukt', codes: ['STD01-ED'] },
  { key: 'qi', cat: 'Wand', label: 'Draadloze telefoonoplader', sub: 'Onzichtbaar ingebouwd', codes: null },
]

export function codeVoorBreedte(patroon: string, breedte: number | null): string | null {
  if (!patroon.includes('{b}')) return patroon
  if (!breedte) return null
  return patroon.replace('{b}', String(Math.round(breedte)).padStart(3, '0'))
}

// ---------- naam en omschrijving voor de klant ----------

const LADE_OMSCHRIJVING: Record<string, string> = {
  Z2: '2 grote lades',
  Z2IK: '2 lades en een binnenlade',
  Z3: '3 lades',
  '': '2 deuren met een plank',
}

export function kastNaam(code: string, soort: KastSoort, breedte: number | null): string {
  const b = breedte ? ` ${breedte} cm` : ''
  const c = code.toUpperCase()
  switch (soort) {
    case 'lade': return `Onderkast${b}`
    case 'spoel': return `Spoelkast${b}`
    case 'afval': return `Afvalkast${b}`
    case 'hoog': return `Hoge kast${b}`
    case 'wand': return `Wandkast${b}`
    case 'apparaat':
      if (/^GS/.test(c)) return `Vaatwasser${b}`
      if (/^D?UK/.test(c)) return `Kookplaatkast${b}`
      return `Apparatenkast${b}`
    default: return code
  }
}

// Winner Flex beschrijft in het Engels ("2 pull-outs", "1 inner drawer");
// de klant krijgt een korte Nederlandse zin.
const VERTALING: [RegExp, string][] = [
  [/(\d+) inner pull-outs?/i, '$1 binnenlade(s)'],
  [/(\d+) inner drawers?/i, '$1 binnenlade(s)'],
  [/(\d+) pull-outs?/i, '$1 lade(s)'],
  [/(\d+) drawers?/i, '$1 lade(s)'],
  [/(\d+) appliance doors?(, doweled)?/i, '$1 apparaatdeur(en)'],
  [/(\d+) compensation flap/i, '$1 klep'],
  [/(\d+) flaps?/i, '$1 klep(pen)'],
  [/(\d+) doors?(, doweled)?/i, '$1 deur(en)'],
  [/(\d+) shel(f|ves)/i, '$1 plank(en)'],
  [/(\d+) niche (.+)/i, 'nis $2'],
  [/(\d+) inner cover panel/i, ''],
  [/(\d+) protection bottom plate/i, 'beschermende bodem'],
]

export function kastOmschrijving(code: string, soort: KastSoort, regels: string[]): string {
  const lade = splitLadeCode(code)
  if (soort === 'lade' && lade) return LADE_OMSCHRIJVING[lade.variant] ?? ''
  if (soort === 'afval') {
    const liters = regels.join(' ').match(/(\d+)x (\d+) liters?/i)
    return 'Uittrekbare lade met afvalbakken' + (liters ? ` (${liters[1]}× ${liters[2]} liter)` : '')
  }
  const delen: string[] = []
  for (const raw of regels) {
    const r = raw.replace(/ with .*$/i, '')
    if (/^(Hoogte|Breedte|Diepte|Aangepast)/i.test(r)) continue
    const v = VERTALING.find(([re]) => re.test(r))
    if (!v) continue
    const tekst = r.replace(v[0], v[1]).replace(/^1 (\w+)\((en|s|pen)\)/, '1 $1').replace(/\((en|s|pen)\)/g, (_, s) => s)
    if (tekst.trim()) delen.push(tekst.trim())
  }
  return delen.join(', ')
}

// ---------- apparatuur ----------

export function apparaatLabel(code: string, regels: string[]): string {
  const c = code.toUpperCase()
  const tekst = regels.join(' ').toLowerCase()
  if (/^GS/.test(c)) return 'Vaatwasser'
  if (/^D?UK/.test(c)) return 'Kookplaat'
  if (/^GO/.test(c)) return /2 open niches/.test(tekst) ? 'Oven en combimagnetron' : 'Oven'
  if (/^GI/.test(c)) return 'Koel- of vriesapparaat'
  return 'Apparaat'
}

// ---------- hele keuken ----------

export const STATUS_KEUZES = ['akkoord', 'wijzig', 'vraag'] as const
export type KastStatus = (typeof STATUS_KEUZES)[number]

export const STATUS_LABELS: Record<KastStatus, string> = {
  akkoord: 'Akkoord',
  wijzig: 'Wijzigen',
  vraag: 'Ik heb een vraag',
}

export const KEUKEN_RIJEN = [
  { key: 'front', label: 'Model en front' },
  { key: 'corpus', label: 'Kleur binnenkant kasten' },
  { key: 'greep', label: 'Grepen' },
  { key: 'lades', label: 'Lades' },
  { key: 'plint', label: 'Plint' },
  { key: 'wangen', label: 'Zijpanelen' },
] as const

export const WERKBLAD_MATERIALEN = [
  { key: 'laminaat', label: 'Laminaat', sub: 'Sterk en onderhoudsvriendelijk. Veel hout-, steen- en marmerlooks.' },
  { key: 'compact', label: 'Compact laminaat', sub: 'Dun (12 mm) en massief, ook de randen. Strak en modern.' },
  { key: 'composiet', label: 'Composiet', sub: 'Kwartscomposiet: hard, krasvast en weinig onderhoud.' },
  { key: 'keramiek', label: 'Keramiek', sub: 'Hittebestendig en zeer krasvast. Dunne, strakke bladen.' },
  { key: 'natuursteen', label: 'Natuursteen', sub: 'Graniet of marmer: elk blad is uniek.' },
] as const

export const WERKBLAD_RICHTINGEN = ['Licht en wit', 'Warm en beige', 'Grijs', 'Donker en zwart', 'Met ader of tekening']
