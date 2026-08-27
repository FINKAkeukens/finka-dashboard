export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Mail, Wifi, WifiOff, CheckCircle, Clock, SkipForward } from 'lucide-react'
import GmailConnectButton from './GmailConnectButton'
import SyncButton from './SyncButton'
import InboxItem from './InboxItem'
import BulkSkipEmptyButton from './BulkSkipEmptyButton'

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; tab?: string }>
}) {
  const { connected, error, tab = 'pending' } = await searchParams
  const supabase = await createClient()

  const { data: tokenRow } = await supabase
    .from('finka_gmail_token')
    .select('refresh_token, gmail_email, updated_at')
    .single()

  const isConnected = !!tokenRow?.refresh_token

  const [{ data: pending }, { data: processed }, { data: skipped }] = await Promise.all([
    supabase.from('finka_email_queue').select('*').eq('status', 'pending').order('received_at', { ascending: false }),
    supabase.from('finka_email_queue').select('*').eq('status', 'processed').order('received_at', { ascending: false }),
    supabase.from('finka_email_queue').select('*').eq('status', 'skipped').order('received_at', { ascending: false }),
  ])

  const tabs = [
    { id: 'pending', label: 'Te verwerken', count: pending?.length ?? 0, icon: Clock, color: 'text-amber-600' },
    { id: 'processed', label: 'Goedgekeurd', count: processed?.length ?? 0, icon: CheckCircle, color: 'text-green-600' },
    { id: 'skipped', label: 'Overgeslagen', count: skipped?.length ?? 0, icon: SkipForward, color: 'text-gray-400' },
  ]

  const activeItems = tab === 'processed' ? processed : tab === 'skipped' ? skipped : pending

  // Pending e-mails waar de AI niks in herkende — vaak ruis (reply-threads,
  // niet-gerelateerde mail die toevallig op een zoekwoord matcht). Die
  // blijven anders eindeloos "pending" staan totdat iemand ze één voor één
  // openklapt om te zien dat er niks in zit.
  const emptyPendingIds = (pending ?? [])
    .filter(p => !p.ai_extracted?.appliances?.length)
    .map(p => p.id)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B19]">Offerte inbox</h1>
          <p className="text-sm text-[#6B6560] mt-0.5">Ontvangen offertemails van leveranciers</p>
        </div>
        {isConnected && <SyncButton />}
      </div>

      {/* Meldingen */}
      {connected && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3 mb-4">
          <CheckCircle size={15} />
          Gmail succesvol gekoppeld! Klik op &ldquo;Nu synchroniseren&rdquo; om e-mails op te halen.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-4">
          Fout: {decodeURIComponent(error)}
        </div>
      )}

      {/* Gmail status */}
      <div className={`flex items-center justify-between rounded-xl border px-5 py-4 mb-6 ${
        isConnected ? 'bg-green-50 border-green-200' : 'bg-white border-[#DDD8D2]'
      }`}>
        <div className="flex items-center gap-3">
          {isConnected ? <Wifi size={18} className="text-green-600" /> : <WifiOff size={18} className="text-[#6B6560]" />}
          <div>
            <p className="text-sm font-medium text-[#1C1B19]">
              {isConnected ? 'Gmail gekoppeld' : 'Gmail nog niet gekoppeld'}
            </p>
            <p className="text-xs text-[#6B6560]">
              {isConnected
                ? `Laatste sync: ${tokenRow?.updated_at ? new Date(tokenRow.updated_at).toLocaleString('nl-NL') : 'onbekend'}`
                : 'Koppel je Gmail om offertes automatisch te importeren'}
            </p>
          </div>
        </div>
        <GmailConnectButton isConnected={isConnected} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-[#F7F5F2] rounded-xl p-1">
        {tabs.map(t => (
          <a
            key={t.id}
            href={`/apparatuur/inbox?tab=${t.id}`}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors ${
              tab === t.id
                ? 'bg-white text-[#1C1B19] font-medium shadow-sm'
                : 'text-[#6B6560] hover:text-[#1C1B19]'
            }`}
          >
            <t.icon size={14} className={tab === t.id ? t.color : ''} />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.id
                  ? t.id === 'pending' ? 'bg-amber-100 text-amber-700' : t.id === 'processed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  : 'bg-[#EDE9E4] text-[#6B6560]'
              }`}>
                {t.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {tab === 'pending' && emptyPendingIds.length > 0 && (
        <div className="flex items-center justify-between bg-[#F7F5F2] rounded-lg px-4 py-2.5 mb-4">
          <p className="text-xs text-[#6B6560]">
            {emptyPendingIds.length} e-mail{emptyPendingIds.length !== 1 ? 's' : ''} zonder herkende producten — vaak ruis (reply-threads, niet-gerelateerde mail).
          </p>
          <BulkSkipEmptyButton ids={emptyPendingIds} />
        </div>
      )}

      {/* Inhoud */}
      {!activeItems?.length ? (
        <div className="bg-white rounded-xl border border-[#DDD8D2] py-14 text-center">
          <Mail size={24} className="mx-auto text-[#DDD8D2] mb-2" />
          <p className="text-sm text-[#6B6560]">
            {!isConnected
              ? 'Koppel eerst Gmail'
              : tab === 'pending'
              ? 'Geen e-mails te verwerken — klik op "Nu synchroniseren"'
              : tab === 'processed'
              ? 'Nog geen goedgekeurde offertes'
              : 'Geen overgeslagen e-mails'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeItems.map(item => (
            <InboxItem key={item.id} item={item} readonly={tab !== 'pending'} />
          ))}
        </div>
      )}
    </div>
  )
}
