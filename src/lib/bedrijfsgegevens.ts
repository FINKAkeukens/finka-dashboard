// Bedrijfsgegevens en accounts op /bedrijf (migratie 90). Wachtwoorden en
// de pincode: zie src/lib/kluis.ts (alleen server).

export interface CompanyField {
  key: string
  label: string
}

// Vaste velden, in deze volgorde op de pagina en bij het kopiëren.
export const COMPANY_FIELDS: CompanyField[] = [
  { key: 'statutaire_naam', label: 'Statutaire naam' },
  { key: 'handelsnaam', label: 'Handelsnaam' },
  { key: 'adres', label: 'Adres' },
  { key: 'postcode_plaats', label: 'Postcode en plaats' },
  { key: 'kvk', label: 'KvK-nummer' },
  { key: 'btw', label: 'Btw-nummer' },
  { key: 'iban', label: 'IBAN' },
  { key: 'iban_naam', label: 'Rekening op naam van' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefoon', label: 'Telefoon' },
  { key: 'website', label: 'Website' },
]

// "Factuurgegevens" kopieert in één keer deze velden.
export const INVOICE_KEYS = ['statutaire_naam', 'handelsnaam', 'adres', 'postcode_plaats', 'kvk', 'btw', 'iban', 'iban_naam']

// Kopieertekst: "Label: waarde" per regel, lege velden overgeslagen.
export function copyText(keys: string[], values: Record<string, string>) {
  return COMPANY_FIELDS.filter((f) => keys.includes(f.key) && values[f.key]?.trim())
    .map((f) => `${f.label}: ${values[f.key].trim()}`)
    .join('\n')
}

// Zo gaat een account naar de browser: zonder (versleutelde) wachtwoorden,
// alleen of er een is.
export interface AccountLogin {
  label: string
  username: string
  hasSecret: boolean
}

export interface Account {
  id: string
  name: string
  url: string | null
  logins: AccountLogin[]
  contacts: string
  notes: string
}

// Zo staat een login in de database.
export interface StoredLogin {
  label: string
  username: string
  secret: string | null
}

// Bewerken (na ontgrendelen): wachtwoord als gewone tekst.
export interface EditableLogin {
  label: string
  username: string
  password: string
}

export function toPublicAccount(row: {
  id: string
  name: string
  url: string | null
  logins: StoredLogin[]
  contacts: string
  notes: string
}): Account {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    logins: (row.logins ?? []).map((l) => ({ label: l.label, username: l.username, hasSecret: !!l.secret })),
    contacts: row.contacts,
    notes: row.notes,
  }
}

// Website als klikbare link, ook als iemand "portal.euroline-logistiek.nl"
// zonder https:// invult.
export function accountHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
