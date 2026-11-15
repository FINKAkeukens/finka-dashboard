import { createServiceClient } from '@/lib/supabase/service'
import { bouwPakket, laadKeuzemodule } from '@/lib/keuzemodule/pakket'
import { berekenWijzigingen } from '@/lib/keuzemodule/wijzigingen'
import type { Keuzes, Wijziging } from '@/lib/keuzemodule/types'
import type { OfferAttachment } from '@/lib/types'
import KeuzemoduleBeheer, { type FeedbackRonde, type UitdraaiBron } from './KeuzemoduleBeheer'

// Tabblad "Keuzemodule" op het project. Laadt alleen als het tabblad open
// staat (zie page.tsx); de catalogus wordt hier alleen in beperkte vorm
// gelezen (modellen voor de prijsgroep).
export default async function KeuzemoduleTab({ projectId, customerId, actief }: { projectId: string; customerId: string; actief: boolean }) {
  const service = createServiceClient()
  const [{ instelling, kasten }, { data: feedbackRows }, { data: quotes }, { data: catalogus }] = await Promise.all([
    laadKeuzemodule(service, projectId),
    service.from('finka_keuzemodule_feedback').select('ronde, status, keuzes, ingestuurd_at, updated_at').eq('project_id', projectId).order('ronde', { ascending: false }),
    service.from('finka_quotes').select('id').eq('project_id', projectId),
    service.from('finka_catalogi').select('id, titel').eq('actief', true).maybeSingle(),
  ])

  // Winner Flex-uitdraaien die al bij de Kasten-opties van dit project staan.
  const quoteIds = (quotes ?? []).map((q) => q.id as string)
  const { data: opties } = quoteIds.length
    ? await service.from('finka_configurator_options').select('name, data, updated_at').eq('section', 'kasten').in('quote_id', quoteIds).order('updated_at', { ascending: false })
    : { data: [] }
  const bronnen: UitdraaiBron[] = (opties ?? []).flatMap((o) =>
    (((o.data as { attachments?: OfferAttachment[] })?.attachments) ?? [])
      .filter((a) => /\.pdf(\?|$)/i.test(a.url))
      .map((a) => ({ url: a.url, naam: `${o.name as string} · ${a.name}` }))
  )

  const { data: modellen } = catalogus
    ? await service.from('finka_catalogus_items').select('code, data').eq('catalogus_id', catalogus.id).eq('soort', 'model')
    : { data: [] }

  // Feedback per ronde, met de wijzigingen zoals de klant ze zag.
  const pakket = feedbackRows?.length ? await bouwPakket(service, projectId, { metPrijzen: true }) : null
  const rondes: FeedbackRonde[] = (feedbackRows ?? []).map((f) => ({
    ronde: f.ronde as number,
    status: f.status as 'concept' | 'ingestuurd',
    ingestuurd_at: f.ingestuurd_at as string | null,
    updated_at: f.updated_at as string,
    wijzigingen: pakket ? berekenWijzigingen(pakket, (f.keuzes ?? {}) as Keuzes) : ([] as Wijziging[]),
  }))

  return (
    <KeuzemoduleBeheer
      projectId={projectId}
      customerId={customerId}
      actief={actief}
      instelling={instelling}
      kasten={kasten}
      bronnen={bronnen}
      catalogusTitel={(catalogus?.titel as string | undefined) ?? null}
      modellen={Object.fromEntries((modellen ?? []).map((m) => [m.code as string, ((m.data as { pg?: number | null })?.pg) ?? null]))}
      rondes={rondes}
    />
  )
}
