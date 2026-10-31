import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAATWERK_PROMPT = `Je bent een assistent voor een Nederlandse keukenontwerper. Je krijgt een offerte voor maatwerk (bv. van een timmerman of werkplaats: kasten op maat, wandpanelen, nissen, ombouw, plinten, betimmering).

Maak hiervan een overzichtelijke samenvatting in gewone, klantvriendelijke taal — één regel per onderdeel, met materiaal, afwerking en (globale) afmetingen waar die in de offerte staan. Géén artikelnummers, uurtarieven of prijzen per regel.

Voorbeelden van hoe regels eruit moeten zien (stijl, niet inhoud):
- "Hoge kast op maat naast de koelkast, eiken fineer, ca. 60 × 240 cm"
- "Wandpaneel achter de kookplaat, gespoten in kleur van de fronten"

Zoek ook het totaalbedrag excl. BTW van de offerte en geef dat als getal terug.

Antwoord ALLEEN met geldige JSON:
{
  "summary": ["regel 1", "regel 2", ...],
  "totaal_excl_btw": 0
}`

interface MaatwerkSummaryResult {
  summary: string[]
  totaalExclBtw: number | null
}

export async function extractMaatwerkSummary(pdfBase64: string): Promise<MaatwerkSummaryResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 },
        },
        { type: 'text' as const, text: MAATWERK_PROMPT },
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
