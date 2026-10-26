import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret, encryptSecret, requireUnlocked } from '@/lib/kluis'
import { type EditableLogin, type StoredLogin, toPublicAccount } from '@/lib/bedrijfsgegevens'

// Accounts bewerken gaat helemaal via de server: wachtwoorden worden hier
// versleuteld en ontsleuteld. Alles alleen met open kluis.

const SELECT = 'id, name, url, logins, contacts, notes'

// Eén account met leesbare wachtwoorden, voor het bewerkformulier.
export async function GET(request: Request) {
  const auth = await requireUnlocked()
  if ('error' in auth) return auth.error
  const id = new URL(request.url).searchParams.get('id')
  const { data } = await createServiceClient().from('finka_accounts').select(SELECT).eq('id', id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  const logins: EditableLogin[] = (data.logins as StoredLogin[]).map((l) => ({
    label: l.label,
    username: l.username,
    password: l.secret ? decryptSecret(l.secret) : '',
  }))
  return NextResponse.json({ logins }, { headers: { 'Cache-Control': 'no-store' } })
}

function text(value: unknown, max = 5000) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

// Nieuw (zonder id) of bijwerken (met id).
export async function POST(request: Request) {
  const auth = await requireUnlocked()
  if ('error' in auth) return auth.error
  const body = await request.json()
  const name = text(body.name, 200).trim()
  if (!name) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })

  const logins: StoredLogin[] = (Array.isArray(body.logins) ? body.logins : [])
    .map((l: EditableLogin) => ({ label: text(l?.label, 200).trim(), username: text(l?.username, 500).trim(), password: text(l?.password, 2000) }))
    .filter((l: EditableLogin) => l.label || l.username || l.password)
    .map((l: EditableLogin) => ({ label: l.label, username: l.username, secret: l.password ? encryptSecret(l.password) : null }))

  const row = {
    name,
    url: text(body.url, 500).trim() || null,
    logins,
    contacts: text(body.contacts),
    notes: text(body.notes),
    updated_at: new Date().toISOString(),
  }
  const service = createServiceClient()
  const { data, error } = body.id
    ? await service.from('finka_accounts').update(row).eq('id', body.id).select(SELECT).single()
    : await service.from('finka_accounts').insert(row).select(SELECT).single()
  if (error || !data) return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  return NextResponse.json({ account: toPublicAccount(data) })
}

export async function DELETE(request: Request) {
  const auth = await requireUnlocked()
  if ('error' in auth) return auth.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  const { error } = await createServiceClient().from('finka_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Verwijderen mislukt' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
