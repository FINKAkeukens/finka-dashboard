export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { DefaultTexts } from '@/lib/types'
import DefaultTextsForm from './DefaultTextsForm'

export default async function TekstenInstellingenPage() {
  const supabase = await createClient()
  const { data: texts } = await supabase
    .from('finka_default_texts')
    .select('*')
    .limit(1)
    .maybeSingle() as { data: DefaultTexts | null }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Standaardteksten</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Het vertrekpunt voor een nieuwe offerte of een nieuw aansluitschema. Een wijziging hier geldt voor
          projecten die vanaf nu worden aangemaakt — een al aangemaakte offerte/aansluitschema heeft haar eigen,
          los bewerkbare tekst en verandert dus niet met terugwerkende kracht mee.
        </p>
      </div>
      <DefaultTextsForm texts={texts} />
    </div>
  )
}
