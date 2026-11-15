import Link from 'next/link'
import { Eye } from 'lucide-react'
import PortalLogoutButton from './(authed)/PortalLogoutButton'

// Kop van het klantportaal (en de voorbeeldbalk voor staff), gedeeld door de
// gewone portaalpagina's en de brede keuzemodule-pagina.
export default function PortalHeader({ preview, naam }: { preview: boolean; naam: string }) {
  return (
    <>
      {preview && (
        <div className="bg-[#1C1B19] text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-2">
            <Eye size={14} className="shrink-0" />
            Voorbeeld: je bekijkt het portaal als {naam}. Opslaan is uitgeschakeld.
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
        <div className={`flex items-center gap-4 ${preview ? 'invisible' : ''}`}>
          <Link href="/portaal/wachtwoord" className="text-sm text-[#6B6560] hover:text-[#1C1B19] transition-colors">
            Wachtwoord
          </Link>
          <PortalLogoutButton />
        </div>
      </header>
    </>
  )
}
