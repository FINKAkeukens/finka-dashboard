import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Je bent een assistent voor een Nederlandse keukenontwerper. Analyseer offerte-documenten en extraheer alle keukenapparatuur.

Extraheer alle keukenapparatuur die vermeld wordt. Voor elk product, geef:
- type: één van: kookplaat, oven, combi-oven, vaatwasser, afzuigkap, koelkast, koelvries, kokendwaterkraan, anders
  (gebruik koelvries voor koel-vriescombinaties, koelkast voor alleen koelkast, kokendwaterkraan voor Quooker e.a.)
- brand: merk
- model: modelnummer of -naam
- price: prijs in euro's (alleen het getal, geen €-teken)
- category: baseer dit op merkreputatie en productserie zoals bekend in de Nederlandse keukenmarkt. De waarde in de JSON-output moet ALTIJD exact lowercase zijn: "premium", "midden" of "budget" (nooit hoofdletters).

  premium — topkwaliteit, lange levensduur, hoogste afwerking:
  Altijd premium: Miele, Gaggenau, V-Zug, Wolf, Bora, Quooker, La Cornue, Küppersbusch, Bertazzoni (toplijnen), Smeg (toplijnen)
  Premium productlijnen: Siemens iQ700/iQ900, Bosch Serie 8, AEG Mastery/ProComfort, Neff (alle), Liebherr (alle), Falmec (toplijnen)

  midden — goede kwaliteit, solide, gangbaar in kwalitatieve keukens:
  Siemens iQ300/iQ500, Bosch Serie 4/6, AEG standaard, Samsung (inbouw), LG (inbouw), Whirlpool Supreme, Electrolux, Bauknecht, Smeg (basislijnen), Franke, Berbel

  budget — instapmodel, functioneel maar basiskwaliteit:
  Beko, Gorenje, Indesit, Candy, Hisense, Zanussi, Amica, Bosch Serie 2, Siemens iQ100

  Bij twijfel: hogere series (700, 800, 900, Pro, Mastery) = premium. Midden series (300, 500, 600) = midden. Lage series (100, 200) = budget.

- specs: object met relevante specs:
  kookplaat: energy_type (inductie/gas/keramisch), zones, watt, db_sound
  oven/combi-oven: pyrolysis (true/false), steam (true/false), capacity_liters, db_sound
  vaatwasser: integration (volledig/half), db_sound, capacity_sets
  afzuigkap: afzuig_type (wand/eiland/inbouw/plafond), capacity_m3h, db_sound
  koelkast: fridge_liters, freezer (true/false), db_sound
  kokendwaterkraan: functions_count (getal uit X-in-1), has_sparkling (true/false), tank_liters, finish
  Voeg altijd db_sound toe als het vermeld staat.

Geef ook:
- supplier_name: naam van de leverancier
- supplier_email: e-mailadres van de leverancier
- quote_date: datum van de offerte (YYYY-MM-DD), als vermeld
- notes: korte samenvatting van bijzonderheden

Antwoord ALLEEN met geldige JSON:
{
  "appliances": [...],
  "supplier_name": "...",
  "supplier_email": "...",
  "quote_date": "...",
  "notes": "..."
}`

type ExtractionResult = {
  appliances: Array<{
    type: string
    brand: string
    model: string
    price?: number
    category?: string
    specs: Record<string, unknown>
  }>
  supplier_name?: string
  supplier_email?: string
  quote_date?: string
  notes?: string
}

function parseResult(text: string): ExtractionResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const result: ExtractionResult = JSON.parse(jsonMatch[0])
    result.appliances = result.appliances.map(a => ({
      ...a,
      category: a.category?.toLowerCase(),
    }))
    return result
  } catch {
    return { appliances: [], notes: 'Kon niet automatisch verwerken' }
  }
}

export async function extractApplianceFromEmail(
  subject: string,
  body: string,
  sender: string,
  pdfBase64?: string | null
): Promise<ExtractionResult> {
  const emailContext = `E-mail afzender: ${sender}\nOnderwerp: ${subject}\nInhoud:\n${body.slice(0, 3000)}`

  // Met PDF-bijlage — gebruik Sonnet voor betere PDF-analyse
  if (pdfBase64) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: pdfBase64,
              },
            },
            {
              type: 'text' as const,
              text: `${SYSTEM_PROMPT}\n\nE-mail context:\n${emailContext}\n\nAnalyseer het bijgevoegde PDF-document (de offerte) en de e-mailtekst hierboven.`,
            },
          ],
        }],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      return parseResult(text)
    } catch (err) {
      console.error('PDF extraction failed, falling back to text:', err)
    }
  }

  // Alleen tekst — gebruik Haiku (goedkoper)
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${emailContext}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseResult(text)
}

const KITCHEN_SUMMARY_PROMPT = `Je bent een assistent voor een Nederlandse keukenontwerper. Je krijgt een technische uitdraai (tekening + onderdelenlijst) uit keukenontwerpsoftware zoals Winner Flex of Compusoft.

Maak hiervan een overzichtelijke samenvatting in gewone, klantvriendelijke taal — géén artikelnummers, alleen het type onderdeel, kleur en maat. De klant leest dit, dus het moet leesbaar zijn zonder vakjargon of interne codes.

Voorbeelden van hoe regels eruit moeten zien (dit is de stijl, niet de inhoud):
- "Hoge kast, 2080mm"
- "Plint, 130mm"
- "Greeplijst, zwart"
- "Handgrepen, RVS-look"
- "Greeploze lage kasten, 780mm"
- "Corpuskleur: wit"
- "4x ladekast, 60cm breed"
- "2x hoekkast, 90cm breed"

Groepeer waar zinvol (bv. "3x hoge kast, 2080mm" i.p.v. drie losse regels). Vat samen op basis van wat je in het document ziet: kastmaten en -aantallen, plint, front-/greepstijl, kleuren/afwerkingen, en andere herkenbare hoofdonderdelen. Sla pure artikelnummers, leveranciersinterne codes en boekhoudkundige regels over.

Zoek ook het totaalbedrag "Totaalprijs excl. BTW" (of vergelijkbaar, bv. onderaan bij "Overzicht") en geef dat als getal terug (zonder €-teken, punt als duizendtal-scheiding negeren, gebruik een punt als decimaalteken).

Antwoord ALLEEN met geldige JSON:
{
  "summary": ["regel 1", "regel 2", ...],
  "totaal_excl_btw": 0
}`

interface KitchenSummaryResult {
  summary: string[]
  totaalExclBtw: number | null
}

export async function extractKitchenSummary(pdfBase64: string): Promise<KitchenSummaryResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: pdfBase64,
          },
        },
        {
          type: 'text' as const,
          text: KITCHEN_SUMMARY_PROMPT,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      summary: Array.isArray(parsed.summary) ? parsed.summary : [],
      totaalExclBtw: typeof parsed.totaal_excl_btw === 'number' ? parsed.totaal_excl_btw : null,
    }
  } catch {
    return { summary: [], totaalExclBtw: null }
  }
}

interface ConnectionCatalogEntry {
  standard_key: string | null
  omschrijving: string
}

export interface ConnectionSuggestionResult {
  items: Array<{ standard_key: string; van_toepassing?: boolean; aantal?: string; hoogte_cm?: string; positie_toelichting?: string }>
  nieuwe_regels: Array<{ category: 'water_afvoer' | 'elektra' | 'overig'; omschrijving: string; aantal?: string; hoogte_cm?: string; positie_toelichting?: string }>
  cabinets_suggestie: Array<{ breedte_mm: number; artikelcode: string; label?: string }>
  pins_suggestie: Array<{ type: 'warm_water' | 'koud_water' | 'afvoer' | 'elektra'; label: string; hoogte_cm?: string; x?: number }>
}

// Stelt een concept-invulling voor het aansluitschema voor — vult NOOIT iets
// automatisch in de database. De aanroepende route/UI toont dit altijd als
// een door Merel te beoordelen voorstel (zie AansluitschemaTab.tsx). Maten
// komen alleen uit wat zij zelf typt/aanlevert of wat rechtstreeks van de
// bijgevoegde tekening af te lezen is — de AI verzint geen posities zonder
// brontekst (zie de "geen AI-beeldgeneratie op technische
// tekeningen"-afspraak in het offerte-module-geheugen). Zowel de kastenrij
// als de pin-posities worden uit de tekening zelf gelezen, zodat Merel alleen
// hoeft aan te vinken wélke aansluitingen nodig zijn — niet waar ze komen.
const CONNECTION_SUGGESTION_PROMPT = (catalogus: ConnectionCatalogEntry[]) => `Je bent een assistent voor een Nederlandse keukenontwerper (FINKA Keukens). Je helpt een aansluitschema (leidingwerk + elektra) voor de installateur invullen, op basis van vrije tekst van de keukenontwerper en/of een bijgevoegde tekening/plattegrond (bv. een Winner Flex/CAD-uitdraai van de kastenwand).

De vaste standaardcatalogus met regels (per project aan/uit te vinken) is:
${catalogus.map((c) => `- ${c.standard_key ?? '(eigen regel)'}: ${c.omschrijving}`).join('\n')}

Analyseer de input en stel voor:
1. "items": voor elke standaardregel die overduidelijk van toepassing is, een object met standard_key, van_toepassing: true, en indien te herleiden: aantal, hoogte_cm (in centimeter, vanaf afgewerkte vloer — vaste conventie), positie_toelichting. Laat regels die je niet kunt onderbouwen vanuit de input weg (geen giswerk).
2. "nieuwe_regels": alleen als er een aansluiting genoemd wordt die niet in de standaardcatalogus past — category (water_afvoer/elektra/overig), omschrijving, en evt. aantal/hoogte_cm/positie_toelichting.
3. "cabinets_suggestie": ALLEEN als er een tekening is bijgevoegd met een duidelijk herkenbare kastenrij (vooraanzicht) — lees de kasten van links naar rechts af: breedte_mm (schat op basis van de vermelde maten/maatlat), artikelcode (indien zichtbaar/leesbaar op de tekening), label (bv. "Spoelkast", "Vaatwasser" — alleen als herkenbaar). Dit vormt de basis waarop de pin-posities hieronder worden berekend.
4. "pins_suggestie": ALLEEN als je uit de tekening kunt aflezen wáár een aangevinkte aansluiting moet komen — {type: warm_water|koud_water|afvoer|elektra, label, hoogte_cm (indien af te lezen, anders leeg laten — nooit verzinnen), x (0-1 fractie van de totale breedte van de kastenrij hierboven, van links naar rechts)}. Baseer x op de zichtbare positie in de tekening (bv. "spoelbak in de 4e kast" → x op het midden van die kast). Bij twijfel: laat dit leeg, dit is een startpunt dat de gebruiker zelf corrigeert, nooit een gok.

Antwoord ALLEEN met geldige JSON:
{
  "items": [...],
  "nieuwe_regels": [...],
  "cabinets_suggestie": [...],
  "pins_suggestie": [...]
}`

export async function extractConnectionSuggestions(
  vrijeTekst: string,
  catalogus: ConnectionCatalogEntry[],
  plattegrondUrl?: string | null
): Promise<ConnectionSuggestionResult> {
  const content: Anthropic.Messages.ContentBlockParam[] = []
  if (plattegrondUrl) {
    content.push({ type: 'image', source: { type: 'url', url: plattegrondUrl } })
  }
  content.push({
    type: 'text',
    text: `${CONNECTION_SUGGESTION_PROMPT(catalogus)}\n\nVrije tekst van de keukenontwerper:\n${vrijeTekst.slice(0, 4000) || '(geen — baseer je uitsluitend op de bijgevoegde tekening)'}`,
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      nieuwe_regels: Array.isArray(parsed.nieuwe_regels) ? parsed.nieuwe_regels : [],
      cabinets_suggestie: Array.isArray(parsed.cabinets_suggestie) ? parsed.cabinets_suggestie : [],
      pins_suggestie: Array.isArray(parsed.pins_suggestie) ? parsed.pins_suggestie : [],
    }
  } catch {
    return { items: [], nieuwe_regels: [], cabinets_suggestie: [], pins_suggestie: [] }
  }
}
