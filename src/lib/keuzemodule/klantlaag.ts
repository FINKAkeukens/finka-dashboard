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
//
// Alle toebehoren uit de catalogus die in een kast passen, in een paar
// groepen zodat de klant niet een lange lijst krijgt: per groep één regel
// met een samenvatting, open te klappen. Codepatronen: {b} = kastbreedte in
// drie cijfers (080), {u} = houtuitvoering (EN eiken naturel, ES essen
// zwart, QG OrganiQ grijs). Diepte-index -6 = standaard corpusdiepte 555 mm
// (-4 = 340 mm bij wandkasten).

export type Uitvoering = 'EN' | 'ES' | 'QG'

export const UITVOERINGEN: { key: Uitvoering; label: string; kleur: string }[] = [
  { key: 'EN', label: 'Eiken naturel', kleur: '#C9A274' },
  { key: 'ES', label: 'Essen zwart', kleur: '#2B2A28' },
  { key: 'QG', label: 'OrganiQ grijs', kleur: '#6E6E6B' },
]

export interface OptieGroep {
  key: string
  label: string
  sub: string
  // 'een' = hooguit één keuze (bv. één bestekindeling per lade)
  keuze: 'een' | 'meer'
}

export const GROEPEN: OptieGroep[] = [
  { key: 'bestek', label: 'Bestekindeling', sub: 'Voor de bovenste lade', keuze: 'een' },
  { key: 'inzet', label: 'Losse inzetten', sub: 'Foliehouder, messenblok, kruiden', keuze: 'meer' },
  { key: 'korf', label: 'Indeling van de grote lades', sub: 'Pannen, potten en voorraad', keuze: 'meer' },
  { key: 'binnen', label: 'Binnenin de kast', sub: 'Extra lades en planken', keuze: 'meer' },
  { key: 'schoon', label: 'Schoonmaak en afval', sub: 'Onder de spoelbak', keuze: 'meer' },
  { key: 'handig', label: 'Handig', sub: 'Antislip, verlichting en meer', keuze: 'meer' },
]

export interface ExtraDef {
  key: string
  groep: string
  label: string
  sub: string
  // Catalogusartikel(en); eerste die bestaat telt. null = altijd "prijs volgt".
  codes: string[] | null
  // Houtuitvoeringen waarin het artikel bestaat (code bevat {u}).
  uitvoeringen?: Uitvoering[]
  // Alleen vanaf deze kastbreedte (cm).
  vanaf?: number
  // Herkent hetzelfde artikel in een Winner Flex-subpositie (al inbegrepen).
  herken?: RegExp
}

const HOUT: Uitvoering[] = ['EN', 'ES']
const HOUT_QG: Uitvoering[] = ['EN', 'ES', 'QG']

const LICHT = (sub: string): ExtraDef => ({ key: 'licht', groep: 'handig', label: 'Verlichting', sub, codes: null })

const LADEKAST: ExtraDef[] = [
  { key: 'bestekk', groep: 'bestek', label: 'Kunststof, nachtgrijs', sub: 'Licht en makkelijk schoon te maken', codes: ['BE{b}-6A'], herken: /^BE\d{3}-\dA$/ },
  { key: 'bestekkm', groep: 'bestek', label: 'Kunststof met messeninzet', sub: 'Zwart transparant', codes: ['BE{b}-6NKA'], herken: /^BE\d{3}-\dNKA$/ },
  { key: 'bestekm', groep: 'bestek', label: 'Metalen segmentinzet', sub: 'Antraciet, past bij de lade', codes: ['BEASE'], vanaf: 40, herken: /^BEASE/ },
  { key: 'besteh', groep: 'bestek', label: 'Massief houten set', sub: 'Vaste indeling, eiken of zwart essen', codes: ['BEHSET{b}-6{u}'], uitvoeringen: HOUT, herken: /^BEHSET/ },
  { key: 'bestekf', groep: 'bestek', label: 'Modulaire set', sub: 'Zelf in te delen, hout of OrganiQ', codes: ['BEFSET{b}-6{u}'], uitvoeringen: HOUT_QG, herken: /^BEFSET/ },
  { key: 'folie', groep: 'inzet', label: 'Foliehouder', sub: 'Huishoud- en aluminiumfolie met afscheurrand', codes: ['BEFFE02-{u}', 'BEHFE02-{u}'], uitvoeringen: HOUT_QG, herken: /^BE[HF]FE02/ },
  { key: 'messen', groep: 'inzet', label: 'Messenblok', sub: 'Messen liggen veilig in de lade', codes: ['BEFFE03-{u}', 'BEHFE03-{u}'], uitvoeringen: HOUT_QG, herken: /^BE[HF]FE03/ },
  { key: 'kruiden', groep: 'inzet', label: 'Kruidenhouder', sub: 'Potjes liggen schuin en leesbaar', codes: ['BEFFE04-{u}', 'BEHFE04-{u}'], uitvoeringen: HOUT_QG, herken: /^BE[HF]FE04/ },
  { key: 'univ', groep: 'inzet', label: 'Universele inzet', sub: 'Vakverdeling voor losse spullen', codes: ['BEFFE01-{u}', 'BEHFE01-{u}'], uitvoeringen: HOUT_QG, herken: /^BE[HF]FE01/ },
  { key: 'orga4', groep: 'inzet', label: 'Klein opbergbakje', sub: 'Orga-Container 4, massief hout', codes: ['MOC04-{u}'], uitvoeringen: HOUT, herken: /^MOC04/ },
  { key: 'smart', groep: 'korf', label: 'Verdeelsysteem met schotjes', sub: 'Pannen, deksels en potten blijven op hun plek', codes: ['FADA{b}'], herken: /^FADA/ },
  { key: 'orga1', groep: 'korf', label: 'Opbergbak', sub: 'Orga-Container 1, massief hout', codes: ['MOC01-{u}'], uitvoeringen: HOUT, herken: /^MOC01/ },
  { key: 'orga3', groep: 'korf', label: 'Lange opbergbak', sub: 'Orga-Container 3, hout of OrganiQ', codes: ['MOC03-{u}'], uitvoeringen: HOUT_QG, herken: /^MOC03/ },
  { key: 'frame', groep: 'korf', label: 'Verstelbaar kader', sub: 'Orga-frame, kunststof', codes: ['KOR2'], herken: /^KOR2/ },
  { key: 'flessen', groep: 'korf', label: 'Flessenkorf', sub: 'Voor 8 flessen, staand in de lade', codes: ['KORBFLT'], herken: /^KORBFLT/ },
  { key: 'brood', groep: 'korf', label: 'Flessen- en stokbroodhouder', sub: 'Met broodzak', codes: ['KORBBT'], herken: /^KORBBT/ },
  { key: 'pantry', groep: 'korf', label: 'Voorraadbak met glazen deksel', sub: 'Pantry-box voor brood, groente of fruit', codes: ['APB-{b}'], herken: /^APB/ },
  { key: 'antislip', groep: 'handig', label: 'Antislipmatten', sub: 'In alle lades, voedselveilig', codes: ['RM{b}-6A'], herken: /^RM\d/ },
  { key: 'snijder', groep: 'handig', label: 'Allessnijder', sub: 'Snijmachine die uit de lade komt', codes: ['RAS3', 'RAS2'], vanaf: 45, herken: /^RAS/ },
  LICHT('LED gaat aan als je de lade opent'),
]

const BINNENIN: ExtraDef[] = [
  { key: 'binnenk', groep: 'binnen', label: 'Extra binnenlade', sub: 'Lage lade achter de deur', codes: ['MPZIK{b}-6'], herken: /^(MPZIK|IK)\d/ },
  { key: 'binnena', groep: 'binnen', label: 'Extra binnenkorflade', sub: 'Hoge lade achter de deur', codes: ['MPZIA{b}-6'], herken: /^(MPZIA|IA)\d/ },
  { key: 'plank', groep: 'binnen', label: 'Extra legplank', sub: 'In de kleur van de binnenkant', codes: ['MPEB{b}-6'], herken: /^(MP)?EB\d/ },
  { key: 'glas', groep: 'binnen', label: 'Glazen legplank', sub: 'Helder glas, 8 mm', codes: ['MPEBGL{b}-6'], herken: /EBGL/ },
  { key: 'plateau', groep: 'binnen', label: 'Uittrekbaar plateau', sub: 'Bijvoorbeeld voor een keukenmachine', codes: ['TBA{b}-6'], herken: /^TBA/ },
]

const DEURKAST: ExtraDef[] = [
  ...BINNENIN,
  LICHT('LED gaat aan als je de deur opent'),
]

const HOGEKAST: ExtraDef[] = [
  ...BINNENIN,
  { key: 'krat', groep: 'binnen', label: 'Uittrekbaar voorraadkrat', sub: 'Massief eiken, voor aardappels en uien', codes: ['MVB01-EN'], herken: /^MVB/ },
  { key: 'flesrek', groep: 'binnen', label: 'Flessenrek', sub: 'Massief eiken', codes: ['MFE01-EN'], herken: /^MFE/ },
  LICHT('LED gaat aan als je de deur opent'),
]

const SPOELKAST: ExtraDef[] = [
  { key: 'paz', groep: 'schoon', label: 'Uittrekbare schoonmaakhouder', sub: 'Korf met handvat en bakjes', codes: ['PAZ4'], herken: /^PAZ/ },
  { key: 'bodem', groep: 'schoon', label: 'Beschermende bodem', sub: 'Kunststof bak tegen lekkage', codes: ['EB-SPB{b}'], herken: /SPB/ },
  { key: 'handdoek', groep: 'schoon', label: 'Uittrekbare handdoekhouder', sub: 'Tweedelig, antraciet', codes: ['HTHC2'], herken: /^HTHC/ },
  { key: 'afval2', groep: 'schoon', label: 'Afvalbak, 2 vakken', sub: '12 + 18 liter, trekt mee uit met de deur', codes: ['AE34'], vanaf: 50, herken: /^AE34/ },
  { key: 'afval1', groep: 'schoon', label: 'Afvalbak, 2 × 15 liter', sub: 'Volledig uittrekbaar', codes: ['AE32'], vanaf: 30, herken: /^AE32/ },
  { key: 'afvaldeur', groep: 'schoon', label: 'Afvalbak aan de deur', sub: '15 liter, deksel gaat vanzelf open', codes: ['AE15'], herken: /^AE15/ },
  LICHT('LED gaat aan als je de deur opent'),
]

const KOOKPLAATKAST: ExtraDef[] = [
  { key: 'smart', groep: 'korf', label: 'Verdeelsysteem met schotjes', sub: 'Pannen, deksels en potten blijven op hun plek', codes: ['FADA{b}'], herken: /^FADA/ },
  { key: 'orga3', groep: 'korf', label: 'Lange opbergbak', sub: 'Orga-Container 3, hout of OrganiQ', codes: ['MOC03-{u}'], uitvoeringen: HOUT_QG, herken: /^MOC03/ },
  { key: 'hitte', groep: 'handig', label: 'Hittebeschermingsbodem', sub: 'In de bovenste lade, onder de kookplaat', codes: ['HSE{b}'], herken: /^HSE/ },
  { key: 'antislip', groep: 'handig', label: 'Antislipmatten', sub: 'In alle lades, voedselveilig', codes: ['RM{b}-6A'], herken: /^RM\d/ },
]

const WANDKAST: ExtraDef[] = [
  { key: 'plank', groep: 'binnen', label: 'Extra legplank', sub: 'In de kleur van de binnenkant', codes: ['MPEB{b}-4'], herken: /^(MP)?EB\d/ },
  { key: 'glas', groep: 'binnen', label: 'Glazen legplank', sub: 'Helder glas, 8 mm', codes: ['MPEBGL{b}-4'], herken: /EBGL/ },
  LICHT('LED binnenin of eronder'),
]

const AFVALKAST: ExtraDef[] = [LICHT('LED gaat aan als je de lade opent')]

// Welke toebehoren passen in deze kast?
export function extrasVoor(code: string, soort: KastSoort): ExtraDef[] {
  const c = code.toUpperCase()
  switch (soort) {
    case 'lade': {
      const lade = splitLadeCode(c)
      return lade && lade.variant ? LADEKAST : DEURKAST
    }
    case 'hoog': return HOGEKAST
    case 'spoel': return SPOELKAST
    case 'afval': return AFVALKAST
    case 'wand': return WANDKAST
    case 'apparaat': return /^D?UK/.test(c) ? KOOKPLAATKAST : []
    default: return []
  }
}

// Extra's aan de wand en verlichting: niet aan één kast gebonden.
export const WAND_EXTRAS: ExtraDef[] = [
  { key: 'reling', groep: 'Wand', label: 'Reling aan de wand, 90 cm', sub: 'Linero MosaiQ', codes: ['NMQPL090'] },
  { key: 'nisreling', groep: 'Wand', label: 'Verlichte nisreling, 120 cm', sub: 'Met LED, glazen plank en verschuifbare houders', codes: ['NRB01L-120ED', 'NRB01L-120SW'] },
  { key: 'bovenlicht', groep: 'Verlichting', label: 'Verlichting onder de bovenkast', sub: 'LED warm wit, 120 cm', codes: ['LA5M-120'] },
  { key: 'plintlicht', groep: 'Verlichting', label: 'Plintverlichting', sub: 'LED-strip warm wit', codes: ['LS15M-L'] },
  { key: 'stopcontact', groep: 'Wand', label: 'Inbouwstopcontact in het werkblad', sub: 'Komt omhoog als je erop drukt', codes: ['STD01-ED'] },
  { key: 'qi', groep: 'Wand', label: 'Draadloze telefoonoplader', sub: 'Onzichtbaar ingebouwd', codes: null },
]

// Vult {b} in; {u} blijft staan.
export function metBreedte(patroon: string, breedte: number | null): string | null {
  if (!patroon.includes('{b}')) return patroon
  if (!breedte) return null
  return patroon.replace('{b}', String(Math.round(breedte)).padStart(3, '0'))
}

export function codeVoorBreedte(patroon: string, breedte: number | null, uitvoering: Uitvoering = 'EN'): string | null {
  return metBreedte(patroon.replace('{u}', uitvoering), breedte)
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
  [/(\d+) compensation flap/i, ''],
  [/(\d+) flap doors?/i, '$1 klepdeur(en)'],
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
  // "1 lade, 1 lade" → "2 lades": gelijke onderdelen optellen.
  const telling = new Map<string, number>()
  const los: string[] = []
  for (const d of delen) {
    const m = d.match(/^(\d+) (.+)$/)
    if (!m) { los.push(d); continue }
    const enkel = m[2].replace(/(en|s)$/, '').replace(/^(lade|plank|deur|klep|klepdeur|apparaatdeur|binnenlade)$/, '$1')
    telling.set(enkel, (telling.get(enkel) ?? 0) + Number(m[1]))
  }
  const meervoud: Record<string, string> = { lade: 'lades', binnenlade: 'binnenlades', plank: 'planken', deur: 'deuren', klep: 'kleppen', klepdeur: 'klepdeuren', apparaatdeur: 'apparaatdeuren' }
  return [
    ...[...telling].map(([w, n]) => `${n} ${n === 1 ? w : meervoud[w] ?? w}`),
    ...los,
  ].join(', ')
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

// Indeling van catalogusnamen in de filters van het portaal.
export const HOUT_NAAM = /eiken|eik |noten|evoke|hout/i

export function greepKleur(naam: string): 'rvs' | 'zwart' | 'brons' | 'hout' | 'wit' {
  const n = naam.toLowerCase()
  if (/eiken|noten|hout/.test(n)) return 'hout'
  if (/brons|messing|goud|bruin/.test(n)) return 'brons'
  if (/zwart|antraciet/.test(n)) return 'zwart'
  if (/wit|porcelein/.test(n)) return 'wit'
  return 'rvs'
}

export function werkbladGroep(naam: string): 'steen' | 'hout' | 'marmer' {
  const n = naam.toLowerCase()
  if (/eiken|noten|evoke|halifax/.test(n)) return 'hout'
  if (/marmor|marmer|travertin/.test(n)) return 'marmer'
  return 'steen'
}
