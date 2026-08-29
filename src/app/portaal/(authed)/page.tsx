export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalCustomer } from '@/lib/portal'
import { createServiceClient } from '@/lib/supabase/service'
import { Project } from '@/lib/types'
import { ArrowRight } from 'lucide-react'

export default async function PortalHomePage() {
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  const service = createServiceClient()
  const { data } = await service
    .from('finka_projects')
    .select('*')
    .eq('customer_id', session.customer.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  const projects = (data ?? []) as Project[]

  if (projects.length === 1) redirect(`/portaal/projecten/${projects[0].id}`)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#1C1B19]">
          Welkom, {session.customer.first_name}
        </h1>
        <p className="text-sm text-[#6B6560] mt-1">
          {projects.length === 0 ? 'Er is nog geen project aan je account gekoppeld.' : 'Kies een project om de voortgang te bekijken.'}
        </p>
      </div>

      {projects.length > 0 && (
        <div className="space-y-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/portaal/projecten/${project.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-[#DDD8D2] px-5 py-4 hover:border-[#C9A96E] transition-colors"
            >
              <span className="text-sm font-medium text-[#1C1B19]">{project.title}</span>
              <ArrowRight size={16} className="text-[#9A948D]" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
