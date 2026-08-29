'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { id: 'configurator', label: 'Configurator' },
  { id: 'offerte', label: 'Offerte' },
  { id: 'financieel', label: 'Financieel' },
  { id: 'klantkeuzes', label: 'Klantkeuzes' },
  { id: 'planning', label: 'Planning' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'vragenlijst', label: 'Vragenlijst' },
  { id: 'aansluitschema', label: 'Aansluitschema' },
  { id: 'facturen', label: 'Facturen' },
  { id: 'documenten', label: 'Documenten' },
  { id: 'notities', label: 'Notities' },
  { id: 'historie', label: 'Historie' },
]

export default function TabBar({ activeTab }: { activeTab: string }) {
  const pathname = usePathname()

  return (
    <div className="flex border-b border-[#DDD8D2] mb-6 overflow-x-auto">
      {tabs.map((tab) => (
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
