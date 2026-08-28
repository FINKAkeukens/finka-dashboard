'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Zap,
  Mail,
  LogOut,
  Settings,
  Calculator,
  CalendarRange,
  Euro,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Gegroepeerde navigatie (§6a van het Fase 1-plan). Groepen worden pas
// gevuld zodra de bijbehorende module daadwerkelijk bestaat — geen links
// naar nog niet gebouwde pagina's.
const groups: NavGroup[] = [
  {
    label: 'Overzicht',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Klanten',
    items: [{ href: '/klanten', label: 'Klanten', icon: Users }],
  },
  {
    label: 'Projecten',
    items: [
      { href: '/projecten', label: 'Projecten', icon: FolderKanban },
      { href: '/financieel', label: 'Financieel', icon: Euro },
      { href: '/planning', label: 'Planning', icon: CalendarRange },
    ],
  },
  {
    label: 'Apparatuur',
    items: [
      { href: '/apparatuur', label: 'Bibliotheek', icon: Zap },
      { href: '/apparatuur/inbox', label: 'Offerte inbox', icon: Mail },
    ],
  },
  {
    label: 'Gereedschap',
    items: [{ href: '/gereedschap/werkblad', label: 'Werkblad-rekentool', icon: Calculator }],
  },
  {
    label: 'Instellingen',
    items: [
      { href: '/instellingen/euroline', label: 'Euroline-tarieven', icon: Settings },
      { href: '/instellingen/werkblad', label: 'Werkblad-prijzen', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-[#DDD8D2]">
      <div className="px-5 py-5 border-b border-[#DDD8D2]">
        <span className="text-base font-semibold tracking-tight text-[#1C1B19]">FINKA</span>
        <span className="text-xs text-[#6B6560] ml-2">Dashboard</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-[#9A948D] uppercase">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                      active
                        ? 'bg-[#1C1B19] text-white'
                        : 'text-[#6B6560] hover:bg-[#F7F5F2] hover:text-[#1C1B19]'
                    )}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-[#DDD8D2]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#6B6560] hover:bg-[#F7F5F2] hover:text-[#1C1B19] transition-colors w-full"
        >
          <LogOut size={15} />
          Uitloggen
        </button>
      </div>
    </aside>
  )
}
