'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setLoading(true)
    setResult(null)
    const res = await fetch('/api/gmail/sync', { method: 'POST' })
    const data = await res.json()
    if (data.error) {
      setResult('Fout: ' + data.error)
    } else {
      setResult(`${data.synced} nieuwe e-mails gevonden`)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-sm text-[#6B6560]">{result}</span>}
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-1.5 bg-white text-[#1C1B19] text-sm px-4 py-2 rounded-lg border border-[#DDD8D2] hover:border-[#1C1B19] transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Synchroniseren...' : 'Nu synchroniseren'}
      </button>
    </div>
  )
}
