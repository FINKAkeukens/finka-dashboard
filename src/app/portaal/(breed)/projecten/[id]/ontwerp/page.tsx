export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getPortalCustomer } from '@/lib/portal'
import { createServiceClient } from '@/lib/supabase/service'
import { bouwPakket } from '@/lib/keuzemodule/pakket'
import type { Keuzes } from '@/lib/keuzemodule/types'
import KeuzemoduleApp from './KeuzemoduleApp'

export default async function OntwerpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  const service = createServiceClient()
  const { data: project } = await service
    .from('finka_projects')
    .select('id, title, customer_id, keuzemodule_actief')
    .eq('id', id)
    .maybeSingle()
  // Eigen project én module aangezet; anders bestaat deze pagina niet.
  if (!project || project.customer_id !== session.customer.id || !project.keuzemodule_actief) notFound()

  const pakket = await bouwPakket(service, id)
  if (!pakket) notFound()

  const { data: feedback } = await service
    .from('finka_keuzemodule_feedback')
    .select('keuzes, status, ingestuurd_at')
    .eq('project_id', id)
    .eq('ronde', pakket.ronde)
    .maybeSingle()

  return (
    <KeuzemoduleApp
      projectId={id}
      projectTitel={project.title as string}
      pakket={pakket}
      beginKeuzes={(feedback?.keuzes ?? {}) as Keuzes}
      ingestuurdAt={feedback?.status === 'ingestuurd' ? (feedback.ingestuurd_at as string) : null}
      voorbeeld={session.preview}
    />
  )
}
