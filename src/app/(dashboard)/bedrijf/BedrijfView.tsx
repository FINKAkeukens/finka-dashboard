'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Eye, EyeOff, Lock, LockOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import AutoTextarea from '@/components/ui/auto-textarea'
import {
  type Account,
  accountHref,
  COMPANY_FIELDS,
  copyText,
  type EditableLogin,
  INVOICE_KEYS,
} from '@/lib/bedrijfsgegevens'

const card = 'bg-white rounded-xl border border-[#DDD8D2]'
const input = 'w-full rounded-lg border border-[#DDD8D2] bg-white px-3 py-2 text-sm text-[#1C1B19] outline-none focus:border-[#1C1B19]'
const smallButton =
  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#DDD8D2] bg-white text-[#1C1B19] hover:bg-[#F7F5F2] disabled:opacity-50'
const darkButton = 'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1C1B19] text-white hover:bg-[#2D2C2A] disabled:opacity-50'
const iconButton = 'p-1 rounded-md text-[#9A948D] hover:text-[#1C1B19] hover:bg-[#F7F5F2]'

// Kopiëren met even een vinkje als bevestiging. `key` onderscheidt welke
// knop het vinkje krijgt.
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch {
      // Geen toegang tot het klembord (oude browser): niets aan te doen.
    }
  }, [])
  return { copied, copy }
}

function CopyIcon({ done }: { done: boolean }) {
  return done ? <Check size={13} className="text-[#5E8A62]" /> : <Copy size={13} />
}

// ---------------------------------------------------------------------------
// Vaste bedrijfsgegevens

function CompanyInfo({ initialValues }: { initialValues: Record<string, string> }) {
  const [supabase] = useState(createClient)
  const [values, setValues] = useState(initialValues)
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { copied, copy } = useCopy()

  const filled = COMPANY_FIELDS.filter((f) => values[f.key]?.trim()).map((f) => f.key)
  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))

  async function save() {
    if (!draft) return
    setSaving(true)
    setError('')
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('finka_company_info')
      .upsert(COMPANY_FIELDS.map((f) => ({ key: f.key, value: (draft[f.key] ?? '').trim(), updated_at: now })))
    setSaving(false)
    if (err) {
      setError('Opslaan mislukt')
      return
    }
    setValues(Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, (draft[f.key] ?? '').trim()])))
    setDraft(null)
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-3 border-b border-[#DDD8D2]">
        <h2 className="text-sm font-semibold text-[#1C1B19]">Gegevens</h2>
        {draft ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setDraft(null)} className={smallButton}>
              Annuleren
            </button>
            <button onClick={save} disabled={saving} className={darkButton}>
              Opslaan
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => copy('factuur', copyText(INVOICE_KEYS, values))} className={smallButton}>
              <CopyIcon done={copied === 'factuur'} />
              Factuurgegevens
            </button>
            <button
              onClick={() => copy('selectie', copyText(selected, values))}
              disabled={!selected.length}
              className={smallButton}
            >
              <CopyIcon done={copied === 'selectie'} />
              Kopieer selectie{selected.length ? ` (${selected.length})` : ''}
            </button>
            <button onClick={() => setDraft({ ...values })} className={smallButton} aria-label="Gegevens bewerken">
              <Pencil size={13} />
              Bewerken
            </button>
          </div>
        )}
      </div>
      {error && <p className="px-5 pt-2 text-xs text-red-600">{error}</p>}
      {draft ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 md:p-5">
          {COMPANY_FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-[#6B6560]">
              {f.label}
              <input
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className={cn(input, 'mt-1')}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-[#EEEAE5]">
          {filled.length > 0 && (
            <label className="flex items-center gap-3 px-4 md:px-5 py-2 text-xs text-[#9A948D] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.length === filled.length}
                onChange={() => setSelected(selected.length === filled.length ? [] : filled)}
                className="size-4 accent-[#1C1B19]"
              />
              Alles selecteren
            </label>
          )}
          {COMPANY_FIELDS.map((f) => {
            const value = values[f.key]?.trim()
            return (
              <div key={f.key} className="flex items-center gap-3 px-4 md:px-5 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`${f.label} selecteren`}
                  checked={selected.includes(f.key)}
                  onChange={() => toggle(f.key)}
                  disabled={!value}
                  className="size-4 accent-[#1C1B19] disabled:opacity-30"
                />
                {/* Telefoon: label boven de waarde, anders wordt de waarde te smal. */}
                <span className="flex-1 min-w-0 sm:flex sm:items-center">
                  <span className="block sm:w-44 shrink-0 text-xs text-[#6B6560]">{f.label}</span>
                  <span className={cn('block min-w-0 text-sm break-words', value ? 'text-[#1C1B19]' : 'text-[#9A948D] italic')}>
                    {value || 'Niet ingevuld'}
                  </span>
                </span>
                {value && (
                  <button onClick={() => copy(f.key, value)} className={iconButton} aria-label={`${f.label} kopiëren`}>
                    <CopyIcon done={copied === f.key} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Kluis: pincode en open/dicht

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// Pincode invoeren, de eerste keer instellen, of wijzigen (met het
// wachtwoord van de login).
function PinForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: 'ontgrendel' | 'instellen' | 'wijzigen'
  onDone: (until: number) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode !== 'ontgrendel' && pin !== repeat) {
      setError('De pincodes zijn niet gelijk')
      return
    }
    setBusy(true)
    const { ok, data } =
      mode === 'ontgrendel'
        ? await post('/api/kluis/ontgrendel', { pin })
        : await post('/api/kluis/pincode', { pin, loginPassword: mode === 'wijzigen' ? loginPassword : undefined })
    setBusy(false)
    if (!ok) {
      setError(data.error ?? 'Mislukt')
      setPin('')
      return
    }
    onDone(data.until)
  }

  const pinInput = (value: string, set: (v: string) => void, label: string, autoFocus = false) => (
    <label className="text-xs text-[#6B6560]">
      {label}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 8))}
        className={cn(input, 'mt-1 w-40 tracking-[0.3em]')}
      />
    </label>
  )

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-4 md:px-5 py-4 bg-[#F7F5F2] border-b border-[#DDD8D2]">
      {mode === 'wijzigen' && (
        <label className="text-xs text-[#6B6560]">
          Wachtwoord van de login
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className={cn(input, 'mt-1 w-56')}
          />
        </label>
      )}
      {pinInput(pin, setPin, mode === 'ontgrendel' ? 'Pincode' : 'Nieuwe pincode (4–8 cijfers)', mode !== 'wijzigen')}
      {mode !== 'ontgrendel' && pinInput(repeat, setRepeat, 'Herhaal pincode')}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || pin.length < 4} className={darkButton}>
          {mode === 'ontgrendel' ? 'Ontgrendelen' : 'Opslaan'}
        </button>
        <button type="button" onClick={onCancel} className={smallButton}>
          Annuleren
        </button>
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Accounts

function AccountEditor({
  account,
  onSaved,
  onCancel,
}: {
  account: Account | null
  onSaved: (account: Account) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [url, setUrl] = useState(account?.url ?? '')
  const [logins, setLogins] = useState<EditableLogin[] | null>(account ? null : [{ label: '', username: '', password: '' }])
  const [contacts, setContacts] = useState(account?.contacts ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Bestaand account: wachtwoorden leesbaar ophalen voor het formulier.
  useEffect(() => {
    if (!account) return
    let cancelled = false
    fetch(`/api/kluis/accounts?id=${account.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.logins) setLogins(d.logins)
        else setError(d.error ?? 'Laden mislukt')
      })
    return () => {
      cancelled = true
    }
  }, [account])

  const setLogin = (i: number, patch: Partial<EditableLogin>) =>
    setLogins((ls) => (ls ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function save() {
    if (!name.trim()) {
      setError('Naam is verplicht')
      return
    }
    setBusy(true)
    setError('')
    const { ok, data } = await post('/api/kluis/accounts', { id: account?.id, name, url, logins: logins ?? [], contacts, notes })
    setBusy(false)
    if (!ok) {
      setError(data.error ?? 'Opslaan mislukt')
      return
    }
    onSaved(data.account)
  }

  return (
    <div className={cn(card, 'p-4 space-y-3 border-[#1C1B19]')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-[#6B6560]">
          Naam
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!account} className={cn(input, 'mt-1')} />
        </label>
        <label className="text-xs text-[#6B6560]">
          Website
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={cn(input, 'mt-1')} />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[#6B6560]">Inloggegevens</p>
        {logins === null ? (
          <p className="text-xs text-[#9A948D]">Laden…</p>
        ) : (
          logins.map((l, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_1.4fr_auto] gap-2 items-center">
              <input value={l.label} onChange={(e) => setLogin(i, { label: e.target.value })} placeholder="Omschrijving (optioneel)" className={input} />
              <input value={l.username} onChange={(e) => setLogin(i, { username: e.target.value })} placeholder="Gebruikersnaam" autoComplete="off" className={input} />
              <input value={l.password} onChange={(e) => setLogin(i, { password: e.target.value })} placeholder="Wachtwoord" autoComplete="off" className={cn(input, 'font-mono')} />
              <button
                onClick={() => setLogins(logins.filter((_, j) => j !== i))}
                className={cn(iconButton, 'justify-self-end')}
                aria-label="Inlog verwijderen"
              >
                <X size={15} />
              </button>
            </div>
          ))
        )}
        {logins !== null && (
          <button onClick={() => setLogins([...logins, { label: '', username: '', password: '' }])} className="text-xs text-[#6B6560] hover:text-[#1C1B19]">
            + Inlog toevoegen
          </button>
        )}
      </div>

      <label className="block text-xs text-[#6B6560]">
        Contactpersonen
        <AutoTextarea value={contacts} onChange={setContacts} className={cn(input, 'mt-1')} placeholder="Naam, e-mail, telefoon" />
      </label>
      <label className="block text-xs text-[#6B6560]">
        Notities
        <AutoTextarea value={notes} onChange={setNotes} className={cn(input, 'mt-1')} />
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className={smallButton}>
          Annuleren
        </button>
        <button onClick={save} disabled={busy || logins === null} className={darkButton}>
          Opslaan
        </button>
      </div>
    </div>
  )
}

function AccountCard({
  account,
  unlocked,
  onRequestUnlock,
  onLocked,
  onEdit,
  onDelete,
}: {
  account: Account
  unlocked: boolean
  onRequestUnlock: () => void
  onLocked: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [shown, setShown] = useState<Record<number, string>>({})
  const { copied, copy } = useCopy()

  // Kluis weer dicht: getoonde wachtwoorden meteen weg.
  const revealed = unlocked ? shown : {}

  async function fetchPassword(i: number) {
    if (!unlocked) {
      onRequestUnlock()
      return null
    }
    if (revealed[i] !== undefined) return revealed[i]
    const res = await fetch(`/api/kluis/wachtwoord?id=${account.id}&i=${i}`)
    if (res.status === 423) {
      onLocked()
      return null
    }
    const data = await res.json()
    return typeof data.password === 'string' ? (data.password as string) : null
  }

  async function toggleShow(i: number) {
    if (revealed[i] !== undefined) {
      setShown((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== i)))
      return
    }
    const pw = await fetchPassword(i)
    if (pw !== null) setShown((s) => ({ ...(unlocked ? s : {}), [i]: pw }))
  }

  async function copyPassword(i: number) {
    const pw = await fetchPassword(i)
    if (pw !== null) copy(`pw${i}`, pw)
  }

  return (
    <div className={cn(card, 'p-4 flex flex-col gap-3')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#1C1B19] break-words">{account.name}</h3>
          {account.url && (
            <a
              href={accountHref(account.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#6B6560] hover:text-[#1C1B19] hover:underline break-all"
            >
              {account.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink size={11} className="shrink-0" />
            </a>
          )}
        </div>
        {unlocked && (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={onEdit} className={iconButton} aria-label={`${account.name} bewerken`}>
              <Pencil size={14} />
            </button>
            <button onClick={onDelete} className={cn(iconButton, 'hover:text-red-600')} aria-label={`${account.name} verwijderen`}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {account.logins.length > 0 && (
        <div className="space-y-2">
          {account.logins.map((l, i) => (
            <div key={i} className="rounded-lg bg-[#F7F5F2] px-3 py-2 space-y-1">
              {l.label && <p className="text-[11px] text-[#9A948D]">{l.label}</p>}
              {l.username && (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm text-[#1C1B19] break-all">{l.username}</span>
                  <button onClick={() => copy(`u${i}`, l.username)} className={iconButton} aria-label="Gebruikersnaam kopiëren">
                    <CopyIcon done={copied === `u${i}`} />
                  </button>
                </div>
              )}
              {l.hasSecret && (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 font-mono text-sm text-[#1C1B19] break-all">
                    {revealed[i] !== undefined ? revealed[i] : '••••••••••'}
                  </span>
                  <button
                    onClick={() => toggleShow(i)}
                    className={iconButton}
                    aria-label={revealed[i] !== undefined ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                  >
                    {revealed[i] !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={() => copyPassword(i)} className={iconButton} aria-label="Wachtwoord kopiëren">
                    <CopyIcon done={copied === `pw${i}`} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {account.contacts.trim() && (
        <div>
          <p className="text-[11px] text-[#9A948D] mb-0.5">Contact</p>
          <p className="text-sm text-[#1C1B19] whitespace-pre-line break-words">{account.contacts.trim()}</p>
        </div>
      )}
      {account.notes.trim() && <p className="text-xs text-[#6B6560] whitespace-pre-line break-words">{account.notes.trim()}</p>}
    </div>
  )
}

function Accounts({
  initialAccounts,
  hasPin: initialHasPin,
  initialUnlockedUntil,
}: {
  initialAccounts: Account[]
  hasPin: boolean
  initialUnlockedUntil: number | null
}) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [hasPin, setHasPin] = useState(initialHasPin)
  const [until, setUntil] = useState(initialUnlockedUntil)
  const [pinMode, setPinMode] = useState<'ontgrendel' | 'instellen' | 'wijzigen' | null>(null)
  const [editing, setEditing] = useState<string | 'nieuw' | null>(null)
  const [query, setQuery] = useState('')
  const unlocked = until !== null

  // Na 15 minuten vanzelf weer dicht (de server weigert dan ook).
  useEffect(() => {
    if (until === null) return
    const id = setTimeout(() => {
      setUntil(null)
      setEditing(null)
    }, Math.max(0, until - Date.now()))
    return () => clearTimeout(id)
  }, [until])

  const requestUnlock = useCallback(() => setPinMode(hasPin ? 'ontgrendel' : 'instellen'), [hasPin])
  const locked = useCallback(() => {
    setUntil(null)
    setEditing(null)
    setPinMode('ontgrendel')
  }, [])

  async function lock() {
    await post('/api/kluis/vergrendel')
    setUntil(null)
    setEditing(null)
  }

  async function remove(account: Account) {
    if (!confirm(`Account ${account.name} verwijderen?`)) return
    const res = await fetch(`/api/kluis/accounts?id=${account.id}`, { method: 'DELETE' })
    if (res.status === 423) return locked()
    if (res.ok) setAccounts((list) => list.filter((a) => a.id !== account.id))
  }

  function saved(account: Account) {
    setAccounts((list) =>
      [...list.filter((a) => a.id !== account.id), account].sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }))
    )
    setEditing(null)
  }

  const q = query.trim().toLowerCase()
  const visible = accounts.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      (a.url ?? '').toLowerCase().includes(q) ||
      a.contacts.toLowerCase().includes(q) ||
      a.logins.some((l) => l.username.toLowerCase().includes(q))
  )

  return (
    <section className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-3">
          <h2 className="text-sm font-semibold text-[#1C1B19] mr-auto">
            Accounts <span className="font-normal text-[#9A948D]">({accounts.length})</span>
          </h2>
          <div className="relative w-full sm:w-56 order-last sm:order-none">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A948D]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek account of contact" className={cn(input, 'pl-8 py-1.5')} />
          </div>
          {unlocked ? (
            <>
              <span className="text-xs text-[#5E8A62] flex items-center gap-1">
                <LockOpen size={13} />
                Open tot {formatTime(until)}
              </span>
              <button onClick={lock} className={smallButton}>
                <Lock size={13} />
                Vergrendelen
              </button>
              <button onClick={() => setEditing('nieuw')} className={darkButton}>
                <Plus size={13} />
                Nieuw account
              </button>
            </>
          ) : (
            <button onClick={requestUnlock} className={darkButton}>
              <Lock size={13} />
              {hasPin ? 'Wachtwoorden ontgrendelen' : 'Pincode instellen'}
            </button>
          )}
        </div>
        {pinMode && (
          <PinForm
            mode={pinMode}
            onCancel={() => setPinMode(null)}
            onDone={(u) => {
              setHasPin(true)
              setUntil(u)
              setPinMode(null)
            }}
          />
        )}
        {hasPin && !pinMode && (
          <p className="px-4 md:px-5 pb-3 -mt-1 text-[11px] text-[#9A948D]">
            Wachtwoorden zijn versleuteld opgeslagen en alleen met de pincode te zien.{' '}
            <button onClick={() => setPinMode('wijzigen')} className="underline hover:text-[#1C1B19]">
              Pincode wijzigen
            </button>
          </p>
        )}
      </div>

      {editing === 'nieuw' && <AccountEditor account={null} onSaved={saved} onCancel={() => setEditing(null)} />}

      {!visible.length ? (
        <div className={cn(card, 'py-12 text-center text-sm text-[#6B6560]')}>Geen accounts gevonden</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
          {visible.map((a) =>
            editing === a.id ? (
              <div key={a.id} className="md:col-span-2 xl:col-span-3">
                <AccountEditor account={a} onSaved={saved} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <AccountCard
                key={a.id}
                account={a}
                unlocked={unlocked}
                onRequestUnlock={requestUnlock}
                onLocked={locked}
                onEdit={() => setEditing(a.id)}
                onDelete={() => remove(a)}
              />
            )
          )}
        </div>
      )}
    </section>
  )
}

export default function BedrijfView({
  initialValues,
  initialAccounts,
  hasPin,
  initialUnlockedUntil,
}: {
  initialValues: Record<string, string>
  initialAccounts: Account[]
  hasPin: boolean
  initialUnlockedUntil: number | null
}) {
  return (
    <div className="space-y-6">
      <CompanyInfo initialValues={initialValues} />
      <Accounts initialAccounts={initialAccounts} hasPin={hasPin} initialUnlockedUntil={initialUnlockedUntil} />
    </div>
  )
}
