'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function PortalPasswordPage() {
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Gebruik minstens 8 tekens.')
      return
    }
    if (password !== confirm) {
      setError('De wachtwoorden komen niet overeen.')
      return
    }
    setSaving(true)
    const { error: updError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updError) {
      setError(updError.message)
      return
    }
    setSaved(true)
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="space-y-4 max-w-sm">
      <h1 className="text-xl font-semibold text-[#1C1B19]">Wachtwoord wijzigen</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#DDD8D2] p-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Nieuw wachtwoord</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Herhaal wachtwoord</Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">Wachtwoord gewijzigd.</p>}
        <Button type="submit" disabled={saving}>{saving ? 'Bezig...' : 'Opslaan'}</Button>
      </form>
    </div>
  )
}
