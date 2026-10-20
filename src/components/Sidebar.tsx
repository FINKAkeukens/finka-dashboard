'use client'

import Link, { useLinkStatus } from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  TrendingUp,
  Scale,
  Receipt,
  ListChecks,
  HelpCircle,
  Ruler,
  FileText,
  Truck,
  FolderOpen,
  NotebookPen,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileTimer, SidebarTimer } from '@/components/ProjectTimer'

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
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/intern', label: 'FINKA intern', icon: NotebookPen },
    ],
  },
  {
    label: 'Klanten',
    items: [{ href: '/klanten', label: 'Klanten', icon: Users }],
  },
  {
    label: 'Projecten',
    items: [
      { href: '/projecten', label: 'Projecten', icon: FolderKanban },
      { href: '/planning', label: 'Planning', icon: CalendarRange },
    ],
  },
  {
    label: 'Financieel',
    items: [
      // Staat al onder de groepskop "Financieel" — voluit ("Financieel
      // overzicht projecten", zoals de paginakop) breekt in de 224px brede
      // zijbalk over drie regels af.
      { href: '/financieel', label: 'Overzicht projecten', icon: TrendingUp },
      { href: '/financieel/balans', label: 'Balans', icon: Scale },
      { href: '/financieel/kosten', label: 'Kosten', icon: Receipt },
    ],
  },
  {
    label: 'Leveranciers',
    items: [{ href: '/leveranciers', label: 'Leveranciers', icon: Truck }],
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
      { href: '/instellingen/draaiboek', label: 'Draaiboek', icon: ListChecks },
      { href: '/instellingen/vragenlijst', label: 'Vragenlijst', icon: HelpCircle },
      { href: '/instellingen/maatformulier', label: 'Ruimte gereed', icon: Ruler },
      { href: '/instellingen/teksten', label: 'Standaardteksten', icon: FileText },
      { href: '/instellingen/documenten', label: 'Standaarddocumenten', icon: FolderOpen },
    ],
  },
]

// Vaste knoppen in de onderbalk op de telefoon — wat je onderweg het meest
// nodig hebt. De rest van het menu zit achter "Meer".
const mobileTabs: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/planning', label: 'Planning', icon: CalendarRange },
  { href: '/projecten', label: 'Projecten', icon: FolderKanban },
  { href: '/klanten', label: 'Klanten', icon: Users },
]

function useNav() {
  const pathname = usePathname()
  const router = useRouter()

  // Actief item = de langste href die bij dit pad past — voorkomt dat bv.
  // zowel "Overzicht projecten" (/financieel) als "Kosten" (/financieel/kosten) allebei
  // actief lijken op /financieel/kosten.
  const activeHref = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0]

  async function handleLogout() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return { pathname, activeHref, handleLogout }
}

function NavGroups({ activeHref, onNavigate }: { activeHref: string | undefined; onNavigate?: () => void }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-[#9A948D] uppercase">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = href === activeHref
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  onClick={onNavigate}
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
    </>
  )
}

export default function Sidebar() {
  const { activeHref, handleLogout } = useNav()

  return (
    <aside className="hidden md:flex w-56 shrink-0 h-screen sticky top-0 flex-col bg-white border-r border-[#DDD8D2]">
      <div className="px-5 py-5 border-b border-[#DDD8D2]">
        <span className="text-base font-semibold tracking-tight text-[#1C1B19]">FINKA</span>
        <span className="text-xs text-[#6B6560] ml-2">Dashboard</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        <NavGroups activeHref={activeHref} />
      </nav>

      <div className="px-3 py-4 border-t border-[#DDD8D2]">
        <SidebarTimer />
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

// Inhoud van een onderbalk-knop. useLinkStatus moet ín de Link zitten: zo
// licht de getikte knop meteen op, ook als de pagina nog onderweg is.
function TabContent({ icon: Icon, label, active }: { icon: NavItem['icon']; label: string; active: boolean }) {
  const { pending } = useLinkStatus()
  const on = active || pending
  return (
    <span className={cn('flex flex-col items-center gap-1 text-[11px]', on ? 'text-[#1C1B19] font-medium' : 'text-[#9A948D]')}>
      <Icon size={20} strokeWidth={on ? 2.2 : 1.8} className={pending ? 'animate-pulse' : undefined} />
      {label}
    </span>
  )
}

// Telefoon (< md): onderbalk zoals in een app, met de vier meest gebruikte
// pagina's en "Meer" voor de rest van het menu. Op desktop onzichtbaar.
export function MobileNav() {
  const { pathname, activeHref, handleLogout } = useNav()
  // Onthoudt op welke pagina het menu open is gezet: na elke navigatie (ook
  // via de terug-knop) klopt dat niet meer en is het menu vanzelf dicht.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)
  const menuOpen = openOnPath === pathname
  const setMenuOpen = (open: boolean) => setOpenOnPath(open ? pathname : null)

  const tabActive = mobileTabs.some((t) => t.href === activeHref)

  return (
    <div className="md:hidden">
      {!menuOpen && <MobileTimer />}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-white flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 border-b border-[#DDD8D2]">
            <div>
              <span className="text-base font-semibold tracking-tight text-[#1C1B19]">FINKA</span>
              <span className="text-xs text-[#6B6560] ml-2">Dashboard</span>
            </div>
            <button onClick={() => setMenuOpen(false)} aria-label="Menu sluiten" className="p-2 -mr-2 text-[#6B6560]">
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
            <NavGroups activeHref={activeHref} onNavigate={() => setMenuOpen(false)} />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#6B6560] w-full"
            >
              <LogOut size={15} />
              Uitloggen
            </button>
          </nav>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#DDD8D2] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-16">
          {mobileTabs.map(({ href, label, icon: Icon }) => {
            const active = !menuOpen && href === activeHref
            return (
              // Wel prefetch (in tegenstelling tot de rest van het menu): haalt
              // alleen het laadscherm vooraf op, zodat een tik direct reageert.
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex flex-col items-center justify-center"
              >
                <TabContent icon={Icon} label={label} active={active} />
              </Link>
            )
          })}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-[11px]',
              menuOpen || (!tabActive && activeHref) ? 'text-[#1C1B19] font-medium' : 'text-[#9A948D]'
            )}
          >
            <Menu size={20} />
            Meer
          </button>
        </div>
      </nav>
    </div>
  )
}
