export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { MaatformulierCategoryItem, MaatformulierTemplateItem } from '@/lib/types'
import MaatformulierTemplateForm from './MaatformulierTemplateForm'

export default async function MaatformulierInstellingenPage() {
  const supabase = await createClient()
  const [{ data: categories }, { data: templates }] = await Promise.all([
    supabase.from('finka_maatformulier_categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('finka_maatformulier_templates').select('*').order('sort_order', { ascending: true }),
  ])

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Ruimte gereed</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Het standaardformulier dat klanten in het portaal invullen en ondertekenen. Bij een project maak je hiervan
          een kopie; die kun je daarna per klant aanpassen — regels verbergen, hernoemen of zelf toevoegen — zonder dat
          dit sjabloon of andere projecten meebewegen.
        </p>
      </div>
      <MaatformulierTemplateForm
        initialCategories={(categories ?? []) as MaatformulierCategoryItem[]}
        initialItems={(templates ?? []) as MaatformulierTemplateItem[]}
      />
    </div>
  )
}
