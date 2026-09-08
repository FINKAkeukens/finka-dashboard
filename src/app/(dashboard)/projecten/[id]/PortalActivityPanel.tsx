'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Bell, Check } from 'lucide-react'
import type { PortalActivity } from '@/lib/types'

// Wat de klant sinds de vorige keer in het portaal heeft gedaan. Verdwijnt
// zodra staff 'm als gelezen markeert (seen_at) — daarmee gaat ook het
// groene bolletje in de projectenlijst/dashboard uit.
export default function PortalActivityPanel({ activity }: { activity: PortalActivity[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<PortalActivity[]>(activity)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function markAllSeen() {
    setSaving(true)
    setError('')
    const { error: updError } = await supabase
      .from('finka_portal_activity')
      .update({ seen_at: new Date().toISOString() })
      .in('id', items.map((i) => i.id))
    setSaving(false)
    if (updError) {
      setError(updError.message)
      return
    }
    setItems([])
    router.refresh()
  }

  if (items.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-green-900">
            <Bell size={14} />
            De klant heeft {items.length} wijziging{items.length !== 1 ? 'en' : ''} doorgevoerd
          </p>
          <ul className="mt-2 space-y-1">
            {items.map((item) => (
              <li key={item.id} className="text-sm text-green-900">
                · {item.description}
                <span className="ml-1.5 text-xs text-green-700">
                  {new Date(item.created_at).toLocaleString('nl-NL', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={markAllSeen}
          disabled={saving}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs text-green-900 transition-colors hover:border-green-400 disabled:opacity-50"
        >
          <Check size={13} />
          {saving ? 'Bezig...' : 'Gezien'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
