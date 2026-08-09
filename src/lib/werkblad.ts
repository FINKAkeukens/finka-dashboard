import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const WERKBLAD_PROMPT = `Je bent een assistent voor een Nederlandse keukenontwerper. Je krijgt een werkblad-specificatie of offerte van een werkblad-leverancier (bv. RVS, composiet, hardsteen).

Maak hiervan een overzichtelijke samenvatting in gewone, klantvriendelijke taal — géén artikelnummers, alleen materiaal, kleur/afwerking, dikte en afmetingen.

Voorbeelden van hoe regels eruit moeten zien (stijl, niet inhoud):
- "RVS werkblad, 15 mm dik, geborsteld"
- "Werkhoogte 98 cm"
- "Gootsteen ingelast in het blad"

Zoek ook het totaalbedrag excl. BTW voor het werkblad en geef dat als getal terug.

Antwoord ALLEEN met geldige JSON:
{
  "summary": ["regel 1", "regel 2", ...],
  "totaal_excl_btw": 0
}`

interface WerkbladSummaryResult {
  summary: string[]
  totaalExclBtw: number | null
}

export async function extractWerkbladSummary(pdfBase64: string): Promise<WerkbladSummaryResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdfBase64 },
        },
        { type: 'text' as const, text: WERKBLAD_PROMPT },
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
