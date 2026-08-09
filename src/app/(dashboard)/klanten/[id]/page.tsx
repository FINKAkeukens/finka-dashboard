export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin } from 'lucide-react'
import EditCustomerForm from './EditCustomerForm'
import TabBar from './TabBar'
import OfferteEditor from './OfferteEditor'
import CustomerProjectsTab from './CustomerProjectsTab'
import { Offer, Project } from '@/lib/types'

const statusColors: Record<string, string> = {
  prospect: 'bg-blue-50 text-blue-700 border-blue-100',
  actief: 'bg-green-50 text-green-700 border-green-100',
  afgerond: 'bg-gray-100 text-gray-600 border-gray-200',
  'on-hold': 'bg-amber-50 text-amber-700 border-amber-100',
}
const statusLabels: Record<string, string> = {
  prospect: 'Prospect', actief: 'Actief', afgerond: 'Afgerond', 'on-hold': 'On hold',
}

export default async function KlantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab = 'gegevens' } = await searchParams
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('finka_customers')
    .select('*')
    .eq('id', id)
    .single()

  if (!customer) notFound()

  let offer: Offer | null = null
  if (tab === 'offerte') {
    const { data } = await supabase
      .from('finka_offers')
      .select('*')
      .eq('customer_id', id)
      .maybeSingle()
    offer = data as Offer | null
  }

  let projects: Project[] = []
  if (tab === 'projecten') {
    const { data } = await supabase
      .from('finka_projects')
      .select('*, status:finka_project_statuses(id, label, color)')
      .eq('customer_id', id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    projects = (data ?? []) as Project[]
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/klanten" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar klanten
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-[#1C1B19]">
            {customer.first_name} {customer.last_name}
          </h1>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[customer.status]}`}>
            {statusLabels[customer.status]}
          </span>
        </div>
        <p className="text-sm font-mono text-[#6B6560]">{customer.reference_number}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {customer.email && (
          <a href={`mailto:${customer.email}`} className="flex items-center gap-2 bg-white rounded-lg border border-[#DDD8D2] px-4 py-3 text-sm hover:border-[#C9A96E] transition-colors">
            <Mail size={14} className="text-[#6B6560]" />
            <span className="text-[#1C1B19] truncate">{customer.email}</span>
          </a>
        )}
        {customer.phone && (
          <a href={`tel:${customer.phone}`} className="flex items-center gap-2 bg-white rounded-lg border border-[#DDD8D2] px-4 py-3 text-sm hover:border-[#C9A96E] transition-colors">
            <Phone size={14} className="text-[#6B6560]" />
            <span className="text-[#1C1B19]">{customer.phone}</span>
          </a>
        )}
        {(customer.address || customer.city) && (
          <div className="flex items-center gap-2 bg-white rounded-lg border border-[#DDD8D2] px-4 py-3 text-sm">
            <MapPin size={14} className="text-[#6B6560] shrink-0" />
            <span className="text-[#1C1B19] truncate">{[customer.address, customer.city].filter(Boolean).join(', ')}</span>
          </div>
        )}
      </div>

      <TabBar activeTab={tab} />

      {tab === 'offerte' ? (
        <OfferteEditor offer={offer} customerId={id} customer={customer} />
      ) : tab === 'projecten' ? (
        <CustomerProjectsTab customerId={id} projects={projects} />
      ) : (
        <>
          {customer.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-amber-900">{customer.notes}</p>
            </div>
          )}
          <EditCustomerForm customer={customer} />
        </>
      )}
    </div>
  )
}
