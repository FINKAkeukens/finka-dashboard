'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/audit'

// Klanten worden gearchiveerd, niet verwijderd (zelfde idee als bij
// projecten): projecten, offertes en de audit-log die aan de klant hangen
// blijven gewoon bestaan. Gearchiveerd = alleen uit het overzicht, terug te
// vinden én terug te zetten via het filter "Gearchiveerd".
export default function ArchiveCustomerButton({
  customerId,
  customerName,
  archived,
}: {
  customerId: string
  customerName: string
  archived: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    const question = archived
      ? `${customerName} terugzetten naar het klantenoverzicht?`
      : `${customerName} archiveren? De klant verdwijnt uit het overzicht maar blijft bewaard, inclusief projecten en offertes.`
    if (!confirm(question)) return
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('finka_customers')
      .update({ archived_at: archived ? null : new Date().toISOString() })
      .eq('id', customerId)
    if (error) {
      setBusy(false)
      alert(`${archived ? 'Terugzetten' : 'Archiveren'} mislukt: ${error.message}`)
      return
    }
    await logAudit(supabase, {
      tableName: 'finka_customers',
      recordId: customerId,
      fieldName: 'archived_at',
      action: archived ? 'update' : 'archive',
      changedBy: user?.email,
    })
    router.refresh()
  }

  const Icon = archived ? ArchiveRestore : Archive
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={archived ? 'Terugzetten' : 'Archiveren'}
      className="p-1.5 rounded-md text-[#9A948D] hover:text-[#1C1B19] hover:bg-[#EDE9E4] disabled:opacity-50 transition-colors"
    >
      <Icon size={14} />
    </button>
  )
}
