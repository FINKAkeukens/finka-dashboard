'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Zelfde patroon als src/app/(dashboard)/projecten/[id]/TabBar.tsx —
// klikbare tabjes bovenaan, huidige tab via ?tab= in de URL.
const tabs = [
  { id: 'vragenlijst', label: 'Vragenlijst' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'maatformulier', label: 'Ruimte gereed' },
  { id: 'documenten', label: 'Documenten' },
]

export default function PortalTabBar({
  activeTab,
  // Het formulier verschijnt pas in het portaal zodra staff 'm heeft
  // klaargezet (automatisch bij de status "Akkoord", of handmatig) — een
  // leeg tabblad met "er staat nog niets klaar" is voor de klant alleen maar
  // verwarrend. Daarna blijft 'ie staan tot staff het formulier verwijdert.
  hasMaatformulier,
}: {
  activeTab: string
  hasMaatformulier: boolean
}) {
  const pathname = usePathname()
  const visibleTabs = tabs.filter((tab) => tab.id !== 'maatformulier' || hasMaatformulier)

  return (
    <div className="flex border-b border-[#DDD8D2] mb-6">
      {visibleTabs.map((tab) => (
        <Link
          key={tab.id}
          href={`${pathname}?tab=${tab.id}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
            activeTab === tab.id
              ? 'border-[#1C1B19] text-[#1C1B19]'
              : 'border-transparent text-[#6B6560] hover:text-[#1C1B19]'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
