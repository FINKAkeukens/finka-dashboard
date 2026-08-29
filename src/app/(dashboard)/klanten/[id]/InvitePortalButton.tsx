'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { KeyRound, Copy, Check } from 'lucide-react'

// Genereert server-side (via /api/portaal/invite) een tijdelijk wachtwoord
// en toont het één keer — staff deelt dit zelf met de klant (WhatsApp/mail).
// De klant kan het daarna zelf wijzigen via /portaal/wachtwoord. Zie die
// route voor de reden waarom dit geen e-mail-uitnodiging met magic link is.
export default function InvitePortalButton({ customerId, hasPortalAccount }: { customerId: string; hasPortalAccount: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleInvite() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portaal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Er ging iets mis')
        return
      }
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    await navigator.clipboard.writeText(`E-mail: ${result.email}\nWachtwoord: ${result.password}\nInloggen: ${window.location.origin}/portaal/login`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (result) {
    return (
      <div className="bg-white rounded-lg border border-[#DDD8D2] px-4 py-3 text-sm space-y-2">
        <p className="text-[#1C1B19]">
          Wachtwoord: <span className="font-mono font-medium">{result.password}</span>
        </p>
        <p className="text-xs text-[#6B6560]">Deel dit zelf met {result.email} — de klant kan het daarna wijzigen in het portaal.</p>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-[#6B6560] hover:text-[#1C1B19]">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Gekopieerd' : 'Kopieer inloggegevens'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Button variant="outline" onClick={handleInvite} disabled={loading} className="gap-1.5">
        <KeyRound size={14} />
        {loading ? 'Bezig...' : hasPortalAccount ? 'Wachtwoord resetten' : 'Uitnodigen voor klantportaal'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
