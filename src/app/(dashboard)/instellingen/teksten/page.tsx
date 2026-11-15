export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { DefaultTexts, QuoteTextSnippet } from '@/lib/types'
import DefaultTextsForm from './DefaultTextsForm'
import QuoteTextSnippetsForm from './QuoteTextSnippetsForm'
import WhatsappMessagesForm from './WhatsappMessagesForm'
import { WHATSAPP_FIELD_KEY } from '@/lib/quote-text-snippets'

export default async function TekstenInstellingenPage() {
  const supabase = await createClient()
  const [{ data: texts }, { data: snippets, error: snippetsError }] = await Promise.all([
    supabase.from('finka_default_texts').select('*').limit(1).maybeSingle(),
    supabase.from('finka_quote_text_snippets').select('*').order('sort_order'),
  ])
  const allSnippets = (snippets ?? []) as QuoteTextSnippet[]
  const quoteSnippets = allSnippets.filter((s) => s.field_key !== WHATSAPP_FIELD_KEY)
  const whatsappMessages = allSnippets.filter((s) => s.field_key === WHATSAPP_FIELD_KEY)

  return (
    <div className="p-4 md:p-8 max-w-2xl space-y-10">
      <section>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Standaardteksten</h1>
          <p className="text-sm text-[#6B6560] mt-1">
            Het vertrekpunt voor een nieuwe offerte of een nieuw aansluitschema. Een wijziging hier geldt voor
            projecten die vanaf nu worden aangemaakt — een al aangemaakte offerte/aansluitschema heeft haar eigen,
            los bewerkbare tekst en verandert dus niet met terugwerkende kracht mee.
          </p>
        </div>
        <DefaultTextsForm texts={texts as DefaultTexts | null} />
      </section>

      <section>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[#1C1B19]">Teksten per offerteveld</h2>
          <p className="text-sm text-[#6B6560] mt-1">
            Kant-en-klare teksten per invulveld van de offerte, in te voegen via &ldquo;Standaardtekst&rdquo; bij
            het veld. Leeg veld: tekst wordt ingevuld. Veld met tekst: standaardtekst komt eronder. Titels worden
            vervangen.
          </p>
        </div>
        <QuoteTextSnippetsForm snippets={snippetsError ? null : quoteSnippets} />
      </section>

      {!snippetsError && (
        <section>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[#1C1B19]">WhatsApp-berichten</h2>
            <p className="text-sm text-[#6B6560] mt-1">
              Eigen berichten met een titel. Kopieer een bericht met het kopieerknopje en plak het in WhatsApp.
            </p>
          </div>
          <WhatsappMessagesForm messages={whatsappMessages} />
        </section>
      )}
    </div>
  )
}
