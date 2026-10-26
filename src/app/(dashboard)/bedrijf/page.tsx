export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser } from '@/lib/portal'
import { unlockedUntil, vaultSettings } from '@/lib/kluis'
import { type StoredLogin, toPublicAccount } from '@/lib/bedrijfsgegevens'
import BedrijfView from './BedrijfView'

// Bedrijfsgegevens (KvK, btw, IBAN, ...) en accounts van leveranciers en
// diensten. Wachtwoorden gaan nooit mee naar de browser; die komen pas los
// na de pincode, per stuk, via /api/kluis. Zie src/lib/kluis.ts.
export default async function BedrijfPage() {
  const user = await getAuthUser()
  const supabase = await createClient()
  const [{ data: info }, { data: accounts }, settings, until] = await Promise.all([
    supabase.from('finka_company_info').select('key, value'),
    // Alleen via de service role te lezen (migratie 90); de staff-check zit
    // in de dashboard-layout.
    createServiceClient().from('finka_accounts').select('id, name, url, logins, contacts, notes'),
    vaultSettings(),
    user ? unlockedUntil(user.id) : null,
  ])

  const values = Object.fromEntries((info ?? []).map((r) => [r.key as string, r.value as string]))
  const list = (accounts ?? [])
    .map((a) => toPublicAccount({ ...a, logins: a.logins as StoredLogin[] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }))

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Bedrijfsgegevens</h1>
        <p className="text-sm text-[#6B6560] mt-0.5">Bedrijfsinformatie, accounts en contactpersonen.</p>
      </div>
      <BedrijfView
        initialValues={values}
        initialAccounts={list}
        hasPin={!!settings?.pin_hash}
        initialUnlockedUntil={until}
      />
    </div>
  )
}
