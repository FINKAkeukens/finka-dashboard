export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import EditSupplierForm from './EditSupplierForm'
import SupplierDocumentsExplorer from './SupplierDocumentsExplorer'

export default async function LeverancierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: supplier } = await supabase
    .from('finka_suppliers')
    .select('*')
    .eq('id', id)
    .single()

  if (!supplier) notFound()

  const [{ data: folders }, { data: documents }] = await Promise.all([
    supabase
      .from('finka_supplier_folders')
      .select('*')
      .eq('supplier_id', id)
      .order('name', { ascending: true }),
    supabase
      .from('finka_supplier_documents')
      .select('*')
      .eq('supplier_id', id)
      .order('uploaded_at', { ascending: false }),
  ])

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/leveranciers" className="flex items-center gap-1.5 text-sm text-[#6B6560] hover:text-[#1C1B19] mb-6">
        <ArrowLeft size={14} />
        Terug naar leveranciers
      </Link>

      <h1 className="text-2xl font-semibold text-[#1C1B19] mb-1">{supplier.name}</h1>

      <div className="grid grid-cols-2 gap-4 mt-4 mb-6">
        {supplier.email && (
          <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 bg-white rounded-lg border border-[#DDD8D2] px-4 py-3 text-sm hover:border-[#C9A96E] transition-colors">
            <Mail size={14} className="text-[#6B6560]" />
            <span className="text-[#1C1B19] truncate">{supplier.email}</span>
          </a>
        )}
        {supplier.phone && (
          <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 bg-white rounded-lg border border-[#DDD8D2] px-4 py-3 text-sm hover:border-[#C9A96E] transition-colors">
            <Phone size={14} className="text-[#6B6560]" />
            <span className="text-[#1C1B19]">{supplier.phone}</span>
          </a>
        )}
      </div>

      <div className="mb-8">
        <EditSupplierForm supplier={supplier} />
      </div>

      <h2 className="text-sm font-medium text-[#1C1B19] mb-3">Documenten</h2>
      <SupplierDocumentsExplorer
        supplierId={id}
        initialFolders={folders ?? []}
        initialDocuments={documents ?? []}
      />
    </div>
  )
}
