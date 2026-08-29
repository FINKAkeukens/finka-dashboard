import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isStaffUser } from '@/lib/portal'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Sinds het klantportaal (/portaal) bestaat, delen staff en klanten
  // dezelfde Supabase Auth-pool — zonder deze check zou een ingelogde klant
  // via de URL zo bij het interne dashboard kunnen komen, want de RLS-
  // policies hier staan overal open voor "authenticated". Zie migratie-
  // sectie 46 (finka_staff_users) + src/lib/portal.ts.
  const staff = await isStaffUser(user.id)
  if (!staff) redirect('/portaal')

  return (
    <div className="flex h-full min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
