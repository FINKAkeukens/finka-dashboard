import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Ontvangt het contactformulier van finkakeukens.nl (contact.html). De website
// stuurt elke aanvraag naar Formspree (mail naar contact@) én tegelijk hierheen,
// zodat er direct een klantkaart (status prospect) klaarstaat met alle
// antwoorden in de notities. Publieke route zonder login, dus:
// - alleen browsers vanaf de eigen website (Origin-check + CORS),
// - honeypot-veld `_gotcha` (onzichtbaar; alleen bots vullen het in),
// - zelfde verplichte velden als de website zelf controleert, met lengtelimiet,
// - bestaat er al een (niet-gearchiveerde) klant met dit e-mailadres, dan
//   wordt de aanvraag aan diens notities toegevoegd i.p.v. een dubbele klant.

const ALLOWED_ORIGINS = ['https://finkakeukens.nl', 'https://www.finkakeukens.nl']

const MAX_FIELD = 1000

const LABELS: Record<string, Record<string, string>> = {
  layout: {
    'een-wand': 'Eén wand',
    hoek: 'Hoek',
    parallel: 'Parallel',
    eiland: 'Met kookeiland',
    open: 'Open keuken',
    onbepaald: 'Nog niet bepaald',
  },
  stijl: {
    shaker: 'Shaker / klassiek',
    strak: 'Strak greeploos',
    hout: 'Hout-warm',
    landelijk: 'Landelijk',
    monochroom: 'Monochroom',
    open: 'Nog open voor advies',
  },
  mat: {
    hout: 'Hout',
    shaker: 'Shaker',
    gelakt: 'Gelakt',
    fineer: 'Fineer',
    combinatie: 'Combinatie',
    advies: 'Open voor advies',
  },
  blad: {
    natuursteen: 'Natuursteen',
    dekton: 'Dekton',
    keramiek: 'Keramiek',
    composiet: 'Composiet',
    hout: 'Hout',
    rvs: 'RVS',
    advies: 'Open voor advies',
  },
  func: {
    eiland: 'Kookeiland',
    spoelbak: 'Grote spoelbak',
    lades: 'Veel lades',
    open: 'Open kasten',
    stoom: 'Stoomoven',
    wijn: 'Wijnklimaatkast',
    bar: 'Bar / zitplek',
    thuiswerk: 'Thuiswerk-hoek',
    huisdier: 'Plek voor huisdier',
  },
  budget: {
    '25-35': '€25–35k',
    '35-50': '€35–50k',
    '50-75': '€50–75k',
    '75+': '€75k+',
    open: 'Liever bespreken',
  },
  contactvoorkeur: {
    video: 'Videogesprek',
    telefoon: 'Telefoon',
    mail: 'E-mail',
    whatsapp: 'WhatsApp',
  },
  moment: {
    'weekdag-dag': 'Door de weeks overdag',
    'weekdag-avond': "Door de weeks 's avonds",
    'weekend-dag': 'In het weekend overdag',
    'weekend-avond': "In het weekend 's avonds",
  },
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : ''
}

function labels(form: FormData, name: string): string {
  return form
    .getAll(name)
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => LABELS[name]?.[v] ?? v.slice(0, 100))
    .join(', ')
}

// "Anna de Vries" -> voornaam "Anna", achternaam "de Vries". Eén woord: alleen
// voornaam (achternaam is NOT NULL, dus lege string).
function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.split(/\s+/).filter(Boolean)
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') }
}

function buildNotes(form: FormData): string {
  const date = new Date().toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam' })
  const woning = [text(form, 'woningtype'), text(form, 'bouwjaar') && `bouwjaar ${text(form, 'bouwjaar')}`]
    .filter(Boolean)
    .join(', ')
  const maten = [
    text(form, 'oppervlak') && `${text(form, 'oppervlak')} m²`,
    text(form, 'afmetingen') && `${text(form, 'afmetingen')} cm`,
  ]
    .filter(Boolean)
    .join(' · ')

  const rows: [string, string][] = [
    ['Hoe gevonden', text(form, 'bron')],
    ['Woning', woning],
    ['Fase', text(form, 'status')],
    ['Ruimte', maten],
    ['Indeling', labels(form, 'layout')],
    ['Stijl', labels(form, 'stijl')],
    ['Materiaal', labels(form, 'mat')],
    ['Werkblad', labels(form, 'blad')],
    ['Wensen', labels(form, 'func')],
    ['Budget', labels(form, 'budget')],
    ['Oplevering', text(form, 'oplevering')],
    ['Contactvoorkeur', labels(form, 'contactvoorkeur')],
    ['Beste moment', labels(form, 'moment')],
  ]

  const lines = [`Aanvraag via website (${date})`]
  for (const [label, value] of rows) {
    if (value) lines.push(`${label}: ${value}`)
  }
  const bericht = text(form, 'bericht')
  if (bericht) lines.push('', 'Bericht:', bericht)
  return lines.join('\n')
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'Niet toegestaan' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Ongeldig formulier' }, { status: 400, headers })
  }

  // Honeypot ingevuld: doe alsof het gelukt is, zodat de bot niets leert.
  if (text(form, '_gotcha')) return NextResponse.json({ ok: true }, { headers })

  const naam = text(form, 'naam')
  const email = text(form, 'email').toLowerCase()
  const phone = text(form, 'tel')
  const city = text(form, 'plaats')
  if (!naam || !phone || !city || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400, headers })
  }

  const notes = buildNotes(form)
  const service = createServiceClient()

  const { data: existing } = await service
    .from('finka_customers')
    .select('id, notes')
    // ilike voor hoofdletter-ongevoelig vergelijken; % en _ escapen, anders
    // zijn het jokertekens (a_b@x.nl zou dan ook axb@x.nl vinden).
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const merged = existing.notes ? `${existing.notes}\n\n---\n\n${notes}` : notes
    const { error } = await service.from('finka_customers').update({ notes: merged }).eq('id', existing.id)
    if (error) {
      console.error('Aanvraag: notities bijwerken mislukt', error)
      return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500, headers })
    }
    await logAudit(service, {
      tableName: 'finka_customers',
      recordId: existing.id,
      fieldName: 'notes',
      oldValue: existing.notes,
      newValue: merged,
      action: 'update',
      changedBy: 'Websiteformulier',
    })
    return NextResponse.json({ ok: true }, { headers })
  }

  const { data: customer, error } = await service
    .from('finka_customers')
    .insert({
      ...splitName(naam),
      email,
      phone,
      city,
      notes,
      status: 'prospect',
      customer_type: 'consument',
      reference_number: '',
    })
    .select('id')
    .single()

  if (error || !customer) {
    console.error('Aanvraag: klant aanmaken mislukt', error)
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500, headers })
  }

  await logAudit(service, {
    tableName: 'finka_customers',
    recordId: customer.id,
    action: 'create',
    changedBy: 'Websiteformulier',
  })

  return NextResponse.json({ ok: true }, { headers })
}
