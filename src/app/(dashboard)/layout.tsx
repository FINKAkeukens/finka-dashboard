import { redirect } from 'next/navigation'
import { getAuthUser, isStaffUser } from '@/lib/portal'
import Sidebar, { MobileNav } from '@/components/Sidebar'
import { TimerProvider } from '@/components/ProjectTimer'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // getAuthUser is per verzoek gecached (zie src/lib/portal.ts), dus dit
  // hergebruikt het rondje dat de proxy al maakte in plaats van een tweede.
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Sinds het klantportaal (/portaal) bestaat, delen staff en klanten
  // dezelfde Supabase Auth-pool — zonder deze check zou een ingelogde klant
  // via de URL zo bij het interne dashboard kunnen komen, want de RLS-
  // policies hier staan overal open voor "authenticated". Zie migratie-
  // sectie 46 (finka_staff_users) + src/lib/portal.ts.
  const staff = await isStaffUser(user.id)
  if (!staff) redirect('/portaal')

  return (
    // TimerProvider hier (en niet per pagina): de projecttimer loopt door
    // bij het wisselen van scherm. Zie src/components/ProjectTimer.tsx.
    <TimerProvider>
      <div className="flex h-full min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        {/* Op de telefoon ruimte laten voor de vaste onderbalk (MobileNav). */}
        <main className="flex-1 min-w-0 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <MobileNav />
      </div>
    </TimerProvider>
  )
}
