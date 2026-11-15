import { redirect } from 'next/navigation'
import { getPortalCustomer } from '@/lib/portal'
import PortalHeader from '../PortalHeader'

// Alles onder deze route-groep vereist een gekoppeld klant-account.
// /portaal/login zit hier bewust buiten (aparte map naast (authed)), anders
// zou de redirect hieronder een oneindige lus veroorzaken.
export default async function PortalAuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <PortalHeader preview={session.preview} naam={`${session.customer.first_name} ${session.customer.last_name}`} />
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
