import { redirect } from 'next/navigation'
import { getPortalCustomer } from '@/lib/portal'
import PortalHeader from '../PortalHeader'

// Brede portaalpagina's (de keuzemodule: plattegrond naast het kastpaneel).
// Zelfde kop en toegangseis als (authed), maar zonder de smalle kolom en
// zonder de uitgeschakelde fieldset: in "Bekijk als klant" mag staff hier
// rondklikken; opslaan staat dan in de module zelf uit (en de API weigert
// staff sowieso).
export default async function PortalBreedLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalCustomer()
  if (!session) redirect('/portaal/login')

  return (
    <div className="min-h-screen bg-[#F3F1EC]">
      <PortalHeader preview={session.preview} naam={`${session.customer.first_name} ${session.customer.last_name}`} />
      {children}
    </div>
  )
}
