import { ApplianceSpecs, ApplianceType } from '@/lib/types'

// Leest type, nismaat en serie af uit het modelnummer — zonder AI of
// internet, dus gratis en direct. Alleen regels die voor de hele
// productreeks van een merk gelden; bij twijfel geeft hij niets terug.
// Getoetst tegen de online gecontroleerde bibliotheek (oktober 2026).

export interface DecodedModel {
  type?: ApplianceType
  specs: ApplianceSpecs
  // Korte uitleg voor in de UI, bv. "Siemens SX = vaatwasser, nis 86,5 cm".
  explanation: string
}

const code = (model: string) => model.toUpperCase().replace(/[^A-Z0-9+]/g, '')

const SIEMENS_SERIES: Record<string, string> = { '1': 'iQ100', '3': 'iQ300', '5': 'iQ500', '7': 'iQ700' }
const COOLING_NICHE: Record<string, number> = { '11': 72, '21': 88, '22': 88, '31': 102, '41': 122, '42': 122, '51': 140, '72': 158, '81': 178, '82': 178, '84': 178, '85': 178, '86': 178, '87': 178 }

function siemens(m: string): DecodedModel | null {
  // Vaatwassers: SN = 60 cm / nis 81,5 · SX = 60 cm / nis 86,5 · SR = 45 cm / nis 81,5
  // 3e teken 6/8 = volledig integreerbaar, 7 = volledig + varioScharnier; 4e = serie.
  let r = /^S([NXR])([678])([1357])/.exec(m)
  if (r) {
    const specs: ApplianceSpecs = {
      integration: 'volledig',
      niche_height_cm: r[1] === 'X' ? 86.5 : 81.5,
      width_cm: r[1] === 'R' ? 45 : 60,
      series: SIEMENS_SERIES[r[3]],
    }
    if (r[2] === '7') specs.hinge = 'vario'
    return { type: 'vaatwasser', specs, explanation: `Siemens S${r[1]} = vaatwasser ${specs.width_cm} cm, nis ${String(specs.niche_height_cm).replace('.', ',')} cm` }
  }
  // Koelen: KI81 = koelkast nis 178 · KI82/KI42 = koelkast met vriesvak · KI84-87 = koel-vries · KI41 = nis 122 enz.
  r = /^KI(\d\d)/.exec(m)
  if (r && COOLING_NICHE[r[1]]) {
    const n = r[1]
    const combi = ['84', '85', '86', '87'].includes(n)
    const freezer = combi || n.endsWith('2')
    return {
      type: combi ? 'koelvries' : 'koelkast',
      specs: { niche_height_cm: COOLING_NICHE[n], installation: 'inbouw', freezer },
      explanation: `Siemens KI${n} = ${combi ? 'koel-vriescombinatie' : freezer ? 'koelkast met vriesvak' : 'koelkast'}, nis ${COOLING_NICHE[n]} cm`,
    }
  }
  r = /^GI(\d\d)/.exec(m)
  if (r && COOLING_NICHE[r[1]]) {
    return { type: 'vriezer', specs: { niche_height_cm: COOLING_NICHE[r[1]], installation: 'inbouw', freezer: true }, explanation: `Siemens GI = vriezer, nis ${COOLING_NICHE[r[1]]} cm` }
  }
  if (/^GU/.test(m)) return { type: 'vriezer', specs: { niche_height_cm: 82, installation: 'onderbouw', freezer: true }, explanation: 'Siemens GU = onderbouw vriezer, nis 82 cm' }
  // Ovens: H = nis 60, C = compact/nis 45; 2e letter = soort. 9/7 = iQ700.
  r = /^([HC])([BMSRDE])(\d)/.exec(m)
  if (r) {
    const niche = r[1] === 'H' ? 60 : 45
    const kind = r[2]
    const series = r[3] === '9' || r[3] === '7' ? 'iQ700' : undefined
    const base: ApplianceSpecs = { niche_height_cm: niche, ...(series ? { series } : {}) }
    if (kind === 'B') return { type: 'oven', specs: { ...base, oven_subtype: 'solo', steam: false }, explanation: `Siemens ${r[1]}B = bakoven, nis ${niche} cm` }
    if (kind === 'M') return { type: 'combi-oven', specs: { ...base, oven_subtype: 'combi-magnetron', steam: false }, explanation: `Siemens ${r[1]}M = oven met magnetron, nis ${niche} cm` }
    if (kind === 'S' || kind === 'D') return { type: 'combi-oven', specs: { ...base, oven_subtype: 'stoom', steam: true }, explanation: `Siemens ${r[1]}${kind} = stoomoven, nis ${niche} cm` }
    if (kind === 'R') return { type: 'oven', specs: { ...base, oven_subtype: 'solo', steam: true }, explanation: `Siemens ${r[1]}R = oven met stoomondersteuning, nis ${niche} cm` }
    if (kind === 'E' && r[1] === 'C') return { type: 'magnetron', specs: { ...base }, explanation: 'Siemens CE = magnetron, nis 45 cm' }
  }
  if (/^B[EF]\d/.test(m)) return { type: 'magnetron', specs: { niche_height_cm: 38 }, explanation: 'Siemens BE/BF = inbouwmagnetron, nis 38 cm' }
  // Kookplaten: EH/EU/EX/ED = inductie; cijfer erna = breedte (6 = 60, 8 = 80, 9 = 90, 7 = 70).
  r = /^E([HUXD])([6789])/.exec(m)
  if (r) return { type: 'kookplaat', specs: { energy_type: 'inductie' }, explanation: `Siemens E${r[1]} = inductiekookplaat, ±${r[2]}0 cm breed` }
  return null
}

function bosch(m: string): DecodedModel | null {
  // Vaatwassers: SMV = 60 cm nis 81,5 · SBV = 60 cm nis 86,5 · SPV = 45 cm nis 81,5; 4e teken = serie.
  let r = /^S([MBP])V(\d)/.exec(m)
  if (r) {
    const specs: ApplianceSpecs = {
      integration: 'volledig',
      niche_height_cm: r[1] === 'B' ? 86.5 : 81.5,
      width_cm: r[1] === 'P' ? 45 : 60,
      series: ['2', '4', '6', '8'].includes(r[2]) ? `Serie ${r[2]}` : undefined,
    }
    if (!specs.series) delete specs.series
    return { type: 'vaatwasser', specs, explanation: `Bosch S${r[1]}V = vaatwasser ${specs.width_cm} cm, nis ${String(specs.niche_height_cm).replace('.', ',')} cm` }
  }
  // Koelen: KIR = koelkast, KIL = met vriesvak, KIV/KIS/KIN/KIF/KIG = koel-vries; cijfers = nis.
  r = /^KI([RLVSNFG])(\d\d)/.exec(m)
  if (r && COOLING_NICHE[r[2]]) {
    const combi = 'VSNFG'.includes(r[1])
    const niche = COOLING_NICHE[r[2]]
    return {
      type: combi ? 'koelvries' : 'koelkast',
      specs: { niche_height_cm: niche, installation: 'inbouw', freezer: combi || r[1] === 'L' },
      explanation: `Bosch KI${r[1]} = ${combi ? 'koel-vriescombinatie' : r[1] === 'L' ? 'koelkast met vriesvak' : 'koelkast'}, nis ${niche} cm`,
    }
  }
  r = /^GI[VN](\d\d)/.exec(m)
  if (r && COOLING_NICHE[r[1]]) return { type: 'vriezer', specs: { niche_height_cm: COOLING_NICHE[r[1]], installation: 'inbouw', freezer: true }, explanation: `Bosch GI = vriezer, nis ${COOLING_NICHE[r[1]]} cm` }
  // Ovens: H = nis 60, C = nis 45; B = bakoven, M = met magnetron, S/D = stoom, R = stoomondersteuning.
  r = /^([HC])([BMSDR])[A-Z]/.exec(m)
  if (r) {
    const niche = r[1] === 'H' ? 60 : 45
    const k = r[2]
    if (k === 'B') return { type: 'oven', specs: { niche_height_cm: niche, oven_subtype: 'solo', steam: false }, explanation: `Bosch ${r[1]}B = bakoven, nis ${niche} cm` }
    if (k === 'M') return { type: 'combi-oven', specs: { niche_height_cm: niche, oven_subtype: 'combi-magnetron', steam: false }, explanation: `Bosch ${r[1]}M = oven met magnetron, nis ${niche} cm` }
    if (k === 'S' || k === 'D') return { type: 'combi-oven', specs: { niche_height_cm: niche, oven_subtype: 'stoom', steam: true }, explanation: `Bosch ${r[1]}${k} = stoomoven, nis ${niche} cm` }
    if (k === 'R') return { type: 'oven', specs: { niche_height_cm: niche, oven_subtype: 'solo', steam: true }, explanation: `Bosch ${r[1]}R = oven met stoomondersteuning, nis ${niche} cm` }
  }
  if (/^B[EF]L/.test(m)) return { type: 'magnetron', specs: { niche_height_cm: 38 }, explanation: 'Bosch BEL/BFL = inbouwmagnetron, nis 38 cm' }
  return null
}

function neff(m: string): DecodedModel | null {
  // Neff: B + cijfer = bakoven nis 60; C + 2 cijfers + M = compacte oven met magnetron nis 45.
  if (/^B\d[A-Z]/.test(m)) return { type: 'oven', specs: { niche_height_cm: 60, oven_subtype: 'solo' }, explanation: 'Neff B… = bakoven, nis 60 cm' }
  if (/^C\d\dM/.test(m)) return { type: 'combi-oven', specs: { niche_height_cm: 45, oven_subtype: 'combi-magnetron', steam: false }, explanation: 'Neff C..M = compacte oven met magnetron, nis 45 cm' }
  return null
}

const QUOOKER_FINISH: Record<string, string> = { CHR: 'chroom', RVS: 'RVS', SST: 'RVS', BLK: 'zwart', GME: 'gunmetal', PTN: 'messing patina', PTB: 'messing patina', GLD: 'goud' }

function quooker(m: string): DecodedModel | null {
  // Prefix = reservoir (3 = PRO3, 22+ = COMBI+, 22 = COMBI); daarna kraanmodel + afwerking.
  const r = /^(3|22\+|22)?(FXR|FXS|FX|FR|FS|FN|NR|NS)([A-Z]*)$/.exec(m)
  if (!r) {
    if (/^PRO3/.test(m) && !/[FN][RS]/.test(m.slice(4))) return { type: 'kokendwaterkraan', specs: { component: 'reservoir', tank_liters: 3 }, explanation: 'Quooker PRO3 = reservoir 3 liter' }
    return null
  }
  const [, prefix, tap, rest] = r
  const tapNames: Record<string, string> = { FXR: 'Flex Round', FXS: 'Flex Square', FX: 'Flex', FR: 'Fusion Round', FS: 'Fusion Square', FN: 'Fusion', NR: 'Nordic Round', NS: 'Nordic Square' }
  const specs: ApplianceSpecs = { tap_model: tapNames[tap], component: prefix ? 'set' : 'kraan' }
  if (prefix === '3') { specs.tank_liters = 3; specs.series = 'PRO3' }
  if (prefix === '22+') { specs.tank_liters = 7; specs.series = 'COMBI+' }
  if (prefix === '22') { specs.tank_liters = 7; specs.series = 'COMBI' }
  if (tap.startsWith('F')) { specs.functions_count = 3; specs.has_sparkling = /CUBE/.test(rest) }
  const fin = Object.keys(QUOOKER_FINISH).find((f) => rest.endsWith(f))
  if (fin) specs.finish = QUOOKER_FINISH[fin]
  return { type: 'kokendwaterkraan', specs, explanation: `Quooker ${prefix ? `${specs.series} + ` : 'losse kraan '}${specs.tap_model}` }
}

function liebherr(m: string): DecodedModel | null {
  // Eerste cijfer van de viercijferige code = nis: 3 = 88, 4 = 122, 5 = 178.
  const r = /^(S?U?I?)(C|R|K|F|G)[A-Z]*?(\d)\d{3}/.exec(m)
  if (!r) return null
  const niche = { '3': 88, '4': 122, '5': 178 }[r[3]]
  const t = r[2]
  const type: ApplianceType = t === 'C' ? 'koelvries' : t === 'F' || t === 'G' ? 'vriezer' : 'koelkast'
  const specs: ApplianceSpecs = { installation: 'inbouw', freezer: type !== 'koelkast' || t === 'K' }
  if (niche) specs.niche_height_cm = niche
  return { type, specs, explanation: `Liebherr ${t === 'C' ? 'IC = koel-vries' : t === 'R' ? 'IR = koelkast' : t === 'K' ? 'IK = koelkast met vriesvak' : 'vriezer'}${niche ? `, nis ${niche} cm` : ''}` }
}

export function decodeModel(brand: string | null | undefined, model: string | null | undefined): DecodedModel | null {
  const b = (brand ?? '').trim().toLowerCase()
  const m = code(model ?? '')
  if (!m) return null
  if (b === 'siemens') return siemens(m)
  if (b === 'bosch') return bosch(m)
  if (b === 'neff') return neff(m)
  if (b === 'quooker') return quooker(m)
  if (b === 'liebherr') return liebherr(m)
  return null
}

// Waar het modelnummer iets anders zegt dan wat er is ingevuld.
export function decodeConflicts(type: string, specs: ApplianceSpecs, decoded: DecodedModel | null): string[] {
  if (!decoded) return []
  const out: string[] = []
  if (decoded.type && decoded.type !== type) out.push(`Modelnummer wijst op type "${decoded.type}"`)
  for (const key of ['niche_height_cm', 'integration', 'hinge', 'freezer', 'oven_subtype', 'functions_count', 'tank_liters'] as const) {
    const want = decoded.specs[key]
    const have = specs[key] as unknown
    if (want === undefined || have === undefined || have === null || have === '') continue
    if (String(want) !== String(have)) out.push(`Modelnummer wijst op ${key.replace(/_/g, ' ')} = ${String(want)} (ingevuld: ${String(have)})`)
  }
  return out
}

// Vult ontbrekende velden aan en zet type/nismaat recht volgens het modelnummer.
// Bestaande andere waardes blijven staan.
export function applyDecoded<T extends { type?: string | null; specs?: ApplianceSpecs | null }>(a: T, decoded: DecodedModel | null): T {
  if (!decoded) return a
  const specs: ApplianceSpecs = { ...(a.specs ?? {}) }
  for (const [k, v] of Object.entries(decoded.specs)) {
    if (v === undefined) continue
    const authoritative = k === 'niche_height_cm' || k === 'freezer' || k === 'integration'
    if (authoritative || specs[k] === undefined || specs[k] === null || specs[k] === '') specs[k] = v
  }
  return { ...a, type: decoded.type ?? a.type, specs }
}
