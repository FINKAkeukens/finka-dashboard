import Anthropic from '@anthropic-ai/sdk'
import { ApplianceSpecs, ApplianceType } from '@/lib/types'
import { suggestCategory, TYPE_ORDER } from '@/lib/appliance-utils'

// Online controle van één apparaat tegen de officiële specificaties
// (fabrikant / grote NL-webwinkels) via Claude + web search. Gebruikt bij:
// - "Controleer online" op een bibliotheek-apparaat (EditApplianceForm)
// - "Opzoeken" bij handmatig toevoegen (apparatuur/nieuw)
// - automatisch per apparaat in een inbox-offerte vóór goedkeuren
// De AI-extractie uit een offerte (lib/claude.ts) werkt alleen vanuit de
// offertetekst + geheugen; dit is de stap die het daadwerkelijk opzoekt.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface VerifyInput {
  type?: string | null
  brand: string
  model: string
  specs?: ApplianceSpecs | null
  notes?: string | null
}

export interface VerifyResult {
  found: boolean
  confidence: 'hoog' | 'middel' | 'laag'
  official_name: string
  type: ApplianceType
  brand: string
  model: string
  category: 'budget' | 'midden' | 'premium' | null
  specs: ApplianceSpecs
  description: string
  issues: { field: string; current: string; correct: string; why: string }[]
  sources: string[]
}

const PROMPT = `Je controleert één apparaat uit de apparatuurbibliotheek van een Nederlandse keukenzaak.
Zoek het op (bij voorkeur de fabrikantsite, anders grote NL-webwinkels zoals Coolblue, Tink, Keukenloods, Expert)
en geef de juiste gegevens. Ga NIET uit van je geheugen: baseer type, maten en specs op wat je online vindt.

Huidige gegevens (kunnen fout zijn):
{record}

Toegestane types: ${TYPE_ORDER.join(', ')}
- combi-oven = oven MET magnetron- of stoomfunctie; magnetron = solo-magnetron (evt. met grill); oven = gewone bakoven.
- koelkast = zonder vriesgedeelte of met klein vriesvak (dan freezer=true); koelvries = koel-vriescombinatie; vriezer = alleen vriezen.
- kokendwaterkraan = kraan en/of reservoir van Quooker e.a.; kraan = gewone mengkraan.
- anders = accessoires (filters, sifons, zijlijsten, montagesets) — omschrijving in specs.custom_type.

Gebruik in "specs" UITSLUITEND deze sleutels; laat weg wat niet van toepassing of onbekend is. Alle maten in CENTIMETERS (decimalen mogen):
algemeen: niche_height_cm, niche_width_cm, niche_depth_cm (inbouwnis — gebruik de nominale nismaat zoals de branche hem noemt:
  koelkast 88/102/122/140/158/178/194, oven 45 of 60, vaatwasser 81.5 of 86.5),
  width_cm, height_cm, depth_cm (het apparaat zelf), energy_label (A-G), db_sound (getal), color,
  series (bv. "iQ700", "Serie 6", "N 70", "8000"), product_line ("Studioline"/"Accentline" alleen als het model dat aantoonbaar is)
kookplaat: energy_type (inductie/gas/keramisch), zones, watt, integrated_hood (true bij kookplaat met afzuiging), hood_mode ("afvoer"/"recirculatie")
oven/combi-oven/magnetron: oven_subtype ("solo"/"combi-magnetron"/"stoom"), capacity_liters, pyrolysis, steam
vaatwasser: integration ("volledig"/"half"/"vrijstaand"), capacity_sets, hinge ("standaard"/"vario" — vario = sleepdeur/schuifscharnier)
afzuigkap: afzuig_type (wand/eiland/inbouw/plafond/onderbouw/werkblad), capacity_m3h
koelkast/koelvries/vriezer/wijnklimaatkast: fridge_liters (koelgedeelte; bij vriezer de vriesinhoud), freezer (true/false), freezer_liters, bottles,
  installation ("inbouw"/"onderbouw"/"vrijstaand"), door_mounting ("sleepdeur"/"deur-op-deur")
kokendwaterkraan: functions_count (1 = alleen kokend, 3 = koud/warm/kokend, 4 = + bruisend/gekoeld via CUBE), has_sparkling, tank_liters, finish,
  tap_model (bv. "Fusion Square"), component ("kraan"/"reservoir"/"set")
kraan: finish
spoelbak: material, bowls ("enkel"/"anderhalf"/"dubbel"), bowl_width_mm, bowl_length_mm, mounting ("onderbouw"/"vlakinbouw"/"opbouw"), width_cm
anders: custom_type

Let op typische fouten: nismaat ingevuld als liters, mm i.p.v. cm, serie als couverts, koel-vries zonder freezer=true,
verkeerd type, omschrijving of opmerkingen in het modelveld.

Antwoord ALLEEN met JSON:
{
  "found": true/false,
  "confidence": "hoog"/"middel"/"laag",
  "official_name": "volledige productnaam",
  "type": "...",
  "brand": "correct gespelde merknaam",
  "model": "schoon modelnummer (zonder omschrijving)",
  "specs": { ...volledige specs met bovenstaande sleutels... },
  "description": "korte NL-omschrijving max 120 tekens, bv. 'Inbouw koel-vriescombinatie, nis 178 cm, NoFrost, deur-op-deur'",
  "issues": [{"field": "...", "current": "...", "correct": "...", "why": "..."}],
  "sources": ["url", ...]
}
"issues" = alleen echte inhoudelijke fouten in de huidige gegevens. Vind je het apparaat niet: found=false, confidence="laag", en verander niets.`

export async function verifyAppliance(input: VerifyInput): Promise<VerifyResult> {
  const record = JSON.stringify({
    type: input.type ?? null,
    brand: input.brand,
    model: input.model,
    specs: input.specs ?? {},
    notes: input.notes ?? null,
  })

  const message = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: PROMPT.replace('{record}', record) }],
  })

  if (message.stop_reason === 'refusal') throw new Error('Controle geweigerd door het model')
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Geen bruikbaar antwoord van de controle')
  const raw = JSON.parse(match[0]) as Omit<VerifyResult, 'category'>

  const type = (TYPE_ORDER as readonly string[]).includes(raw.type) ? raw.type : ((input.type as ApplianceType) ?? 'anders')
  const specs = cleanSpecs(raw.specs ?? {})
  return {
    found: !!raw.found,
    confidence: raw.confidence ?? 'laag',
    official_name: raw.official_name ?? '',
    type,
    brand: raw.brand || input.brand,
    model: raw.model || input.model,
    category: raw.type === 'anders' ? null : suggestCategory(raw.brand || input.brand, specs.series as string | undefined),
    specs,
    description: raw.description ?? '',
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    sources: Array.isArray(raw.sources) ? raw.sources.slice(0, 5) : [],
  }
}

// Sleutels die tekst blijven, ook als de waarde op een getal lijkt (AEG-serie "8000").
const TEXT_KEYS = new Set(['series', 'color', 'finish', 'custom_type', 'tap_model', 'energy_label', 'material', 'product_line'])

// Lege waardes eruit, getallen-als-tekst naar getallen.
function cleanSpecs(specs: Record<string, unknown>): ApplianceSpecs {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(specs)) {
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'string' && !TEXT_KEYS.has(k) && /^-?\d+([.,]\d+)?$/.test(v.trim())) out[k] = Number(v.trim().replace(',', '.'))
    else if (typeof v === 'number' && TEXT_KEYS.has(k)) out[k] = String(v)
    else out[k] = v
  }
  return out as ApplianceSpecs
}
