import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalCustomer } from '@/lib/portal'
import PortalLogoutButton from './PortalLogoutButton'

// Alles onder deze route-groep vereist een gekoppeld klant-account.
// /portaal/login zit hier bewust buiten (aparte map naast (authed)), anders
// zou de redirect hieronder een oneindige lus veroorzaken.
export default async function PortalAuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <header className="bg-white border-b border-[#DDD8D2] px-6 py-4 flex items-center justify-between">
        <Link href="/portaal" className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight text-[#1C1B19]">FINKA</span>
          <span className="text-xs text-[#6B6560]">Klantportaal</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/portaal/wachtwoord" className="text-sm text-[#6B6560] hover:text-[#1C1B19] transition-colors">
            Wachtwoord
          </Link>
          <PortalLogoutButton />
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-6">{children}</main>
    </div>
  )
}
