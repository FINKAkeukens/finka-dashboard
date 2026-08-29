'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Los van het interne /login — zelfde Supabase Auth-pool, maar bewust een
// eigen inlogpagina/stijl voor klanten (zie src/lib/supabase/proxy.ts voor
// de sessie-routing en (dashboard)/layout.tsx voor de staff/klant-scheiding).
export default function PortalLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Onjuist e-mailadres of wachtwoord')
      setLoading(false)
    } else {
      router.push('/portaal')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F2]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#1C1B19]">FINKA</h1>
          <p className="text-sm text-[#6B6560] mt-1">Klantportaal</p>
        </div>

        <div className="bg-white rounded-xl border border-[#DDD8D2] p-8 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jij@voorbeeld.nl"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Inloggen...' : 'Inloggen'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
