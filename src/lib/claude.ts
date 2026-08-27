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
- notes: het originele beschrijvingsregel/onderschrift van DIT specifieke product zoals het in het brondocument staat (bv. kleur, uitvoering, materiaal, bijzondere kenmerken). Overtypen/parafraseren mag, weglaten niet als er tekst bij staat — dit helpt om te bepalen wat voor apparaat het precies is. Leeg laten als er niets vermeldenswaardigs bij dit product staat.

Geef ook (dit zijn gegevens over de hele offerte, niet per product):
- supplier_name: naam van de leverancier
- supplier_email: e-mailadres van de leverancier
- quote_date: datum van de offerte (YYYY-MM-DD), als vermeld
- notes: korte samenvatting van bijzonderheden van de hele offerte (niet hetzelfde als de notes per product hierboven)

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
    notes?: string
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

Alle maten geef je ALTIJD in millimeters (mm) weer, ook als het brondocument de maat in cm of m vermeldt — reken dan zelf om (1 cm = 10 mm, 1 m = 1000 mm) en schrijf het resultaat als een geheel getal gevolgd door "mm", zonder spatie (bv. "600mm", niet "60cm" of "60 cm").

Voorbeelden van hoe regels eruit moeten zien (dit is de stijl, niet de inhoud):
- "Hoge kast, 2080mm"
- "Plint, 130mm"
- "Greeplijst, zwart"
- "Handgrepen, RVS-look"
- "Greeploze lage kasten, 780mm"
- "Corpuskleur: wit"
- "4x ladekast, 600mm breed"
- "2x hoekkast, 900mm breed"

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
