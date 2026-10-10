import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalCustomer } from '@/lib/portal'
import { Eye } from 'lucide-react'
import PortalLogoutButton from './PortalLogoutButton'

// Alles onder deze route-groep vereist een gekoppeld klant-account.
// /portaal/login zit hier bewust buiten (aparte map naast (authed)), anders
// zou de redirect hieronder een oneindige lus veroorzaken.
export default async function PortalAuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {session.preview && (
        <div className="bg-[#1C1B19] text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-2">
            <Eye size={14} className="shrink-0" />
            Voorbeeld: je bekijkt het portaal als {session.customer.first_name} {session.customer.last_name}. Opslaan is uitgeschakeld.
          </span>
          {/* Gewone <a>: de stop-route is een API-route met redirect. */}
          <a href="/api/portaal/voorbeeld/stop" className="underline underline-offset-2 hover:text-[#E6D3AE] shrink-0">
            Voorbeeld sluiten
          </a>
        </div>
      )}
      <header className="bg-white border-b border-[#DDD8D2] px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/portaal" className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight text-[#1C1B19]">FINKA</span>
          <span className="text-xs text-[#6B6560]">Klantportaal</span>
        </Link>
        {/* In de voorbeeldweergave verborgen: "Uitloggen" zou staff uitloggen
            en "Wachtwoord" het wachtwoord van staff wijzigen. */}
        <div className={`flex items-center gap-4 ${session.preview ? 'invisible' : ''}`}>
          <Link href="/portaal/wachtwoord" className="text-sm text-[#6B6560] hover:text-[#1C1B19] transition-colors">
            Wachtwoord
          </Link>
          <PortalLogoutButton />
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Een uitgeschakelde fieldset schakelt elk invoerveld en elke knop
            erbinnen uit (links/tabs blijven werken) — zo kan staff in de
            voorbeeldweergave niets namens de klant invullen of accorderen.
            De portaal-API's weigeren staff sowieso; dit voorkomt verwarrende
            foutmeldingen. */}
        <fieldset disabled={session.preview} className="min-w-0">
          {children}
        </fieldset>
      </main>
    </div>
  )
}
