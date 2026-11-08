'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Keuzes, KastKeuze, Pakket } from '@/lib/keuzemodule/types'
import { berekenWijzigingen, kastGewijzigd, kastStatus } from '@/lib/keuzemodule/wijzigingen'
import { C } from './ui'
import TabKast from './TabKast'
import TabKeuken from './TabKeuken'
import TabWerkblad from './TabWerkblad'
import TabApparatuur from './TabApparatuur'
import TabWijzigingen from './TabWijzigingen'

type Tab = 'kast' | 'keuken' | 'werkblad' | 'app' | 'wijz'

// Na een wijziging zo lang wachten voor het tussentijds bewaren, zodat
// snel achter elkaar klikken één verzoek oplevert.
const BEWAAR_NA_MS = 1500

export default function KeuzemoduleApp({
  projectId,
  projectTitel,
  pakket,
  beginKeuzes,
  ingestuurdAt: beginIngestuurd,
  voorbeeld,
}: {
  projectId: string
  projectTitel: string
  pakket: Pakket
  beginKeuzes: Keuzes
  ingestuurdAt: string | null
  voorbeeld: boolean
}) {
  const [keuzes, setKeuzes] = useState<Keuzes>(beginKeuzes)
  const [tab, setTab] = useState<Tab>('kast')
  const [selId, setSelId] = useState<string | null>(pakket.kasten[0]?.id ?? null)
  const [ingestuurdAt, setIngestuurdAt] = useState<string | null>(beginIngestuurd)
  const [bewaarStatus, setBewaarStatus] = useState<'' | 'bezig' | 'ok' | 'fout'>('')
  const [fout, setFout] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const laatste = useRef<Keuzes>(beginKeuzes)
  const alleenLezen = voorbeeld || !!ingestuurdAt

  const bewaar = useCallback(async (k: Keuzes) => {
    setBewaarStatus('bezig')
    try {
      const res = await fetch('/api/portaal/keuzemodule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, keuzes: k }),
      })
      setBewaarStatus(res.ok ? 'ok' : 'fout')
    } catch {
      setBewaarStatus('fout')
    }
  }, [projectId])

  const wijzig = useCallback((f: (k: Keuzes) => Keuzes) => {
    if (alleenLezen) return
    setKeuzes((oud) => {
      const nieuw = f(oud)
      laatste.current = nieuw
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => bewaar(nieuw), BEWAAR_NA_MS)
      return nieuw
    })
  }, [alleenLezen, bewaar])

  // Bij weggaan van de pagina nog openstaande wijzigingen meesturen.
  useEffect(() => {
    const flush = () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = null
      navigator.sendBeacon?.('/api/portaal/keuzemodule', new Blob([JSON.stringify({ projectId, keuzes: laatste.current })], { type: 'application/json' }))
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [projectId])

  const setKast = useCallback((id: string, patch: Partial<KastKeuze>) => {
    wijzig((k) => ({ ...k, kasten: { ...k.kasten, [id]: { ...k.kasten?.[id], ...patch } } }))
  }, [wijzig])

  const wijzigingen = useMemo(() => berekenWijzigingen(pakket, keuzes), [pakket, keuzes])
  const bekeken = pakket.kasten.filter((k) => kastStatus(k, keuzes)).length
  const pct = pakket.kasten.length ? Math.round((bekeken / pakket.kasten.length) * 100) : 0

  async function insturen() {
    if (alleenLezen) return
    setFout('')
    if (timer.current) clearTimeout(timer.current)
    const res = await fetch('/api/portaal/keuzemodule/insturen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, keuzes }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setFout(data.error ?? 'Insturen mislukt, probeer het opnieuw.')
      return
    }
    setIngestuurdAt(data.ingestuurd_at)
    window.scrollTo({ top: 0 })
  }

  const volgende = (id: string) => {
    const k = pakket.kasten.find((x) => x.id === id)
    if (k && !keuzes.kasten?.[id]?.status && !kastGewijzigd(k, keuzes)) setKast(id, { status: 'akkoord' })
  }

  const tabs: [Tab, string][] = [
    ['kast', 'Per kast'],
    ['keuken', 'Hele keuken'],
    ['werkblad', 'Werkblad'],
    ...(pakket.kasten.some((k) => k.soort === 'apparaat') ? [['app', 'Apparatuur'] as [Tab, string]] : []),
    ['wijz', `Wijzigingen (${wijzigingen.length})`],
  ]

  return (
    <div style={{ color: C.ink }}>
      <header className="border-b" style={{ borderColor: C.lijn, background: C.achtergrond }}>
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 pt-5 pb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Link href={`/portaal/projecten/${projectId}`} className="flex items-center gap-1.5 text-sm hover:underline" style={{ color: C.muted }}>
              <ArrowLeft size={14} />
              {projectTitel}
            </Link>
            <div className="kv-label" style={{ color: C.muted }}>
              Jouw keukenontwerp · ronde {pakket.ronde}
            </div>
            <h1 className="kv-kop m-0 text-[32px] sm:text-[44px]">Bekijk je keuken en geef je feedback</h1>
            {pakket.toelichting && (
              <p className="m-0 mt-1 max-w-[680px] text-[15px] leading-normal whitespace-pre-line" style={{ color: C.tekst }}>{pakket.toelichting}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 min-w-[240px]">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{bekeken} van {pakket.kasten.length} kasten bekeken</span>
              <span style={{ color: C.muted }}>{pct}%</span>
            </div>
            <div className="h-2 rounded-[2px] overflow-hidden" style={{ background: '#E9E5DD' }}>
              <div className="h-full rounded-[2px]" style={{ width: `${pct}%`, background: C.groen }} />
            </div>
            <div className="text-xs h-4" style={{ color: bewaarStatus === 'fout' ? '#B42318' : C.zacht }}>
              {voorbeeld ? 'Voorbeeld: niets wordt opgeslagen'
                : ingestuurdAt ? ''
                : bewaarStatus === 'bezig' ? 'Opslaan…'
                : bewaarStatus === 'ok' ? 'Opgeslagen; je kunt later verder'
                : bewaarStatus === 'fout' ? 'Opslaan mislukt; controleer je verbinding'
                : 'Je keuzes worden automatisch bewaard'}
            </div>
          </div>
        </div>
        <nav aria-label="Onderdelen" className="max-w-[1360px] mx-auto px-4 sm:px-8 flex overflow-x-auto [scrollbar-width:none]">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className="kv-knop shrink-0 min-h-12 px-4 bg-transparent border-0 cursor-pointer"
              style={{
                borderBottom: `1px solid ${tab === key ? C.ink : 'transparent'}`,
                color: tab === key ? C.ink : C.muted,
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 pt-7 pb-12">
        {ingestuurdAt && (
          <div className="mb-6 rounded-[2px] px-5 py-4 text-[15px]" style={{ background: '#E3EADF', color: '#2F3D2B' }}>
            <strong>Je feedback is verstuurd</strong> op{' '}
            {new Date(ingestuurdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.
            We verwerken alles in één aangepast ontwerp en laten het je hier weten zodra het klaarstaat. Je keuzes kun je
            hieronder nog bekijken.
          </div>
        )}

        <fieldset disabled={!!ingestuurdAt} className="min-w-0 border-0 p-0 m-0">
          {tab === 'kast' && (
            <TabKast pakket={pakket} keuzes={keuzes} selId={selId} setSelId={setSelId} setKast={setKast} volgende={volgende} wijzig={wijzig} />
          )}
          {tab === 'keuken' && <TabKeuken pakket={pakket} keuzes={keuzes} wijzig={wijzig} />}
          {tab === 'werkblad' && <TabWerkblad pakket={pakket} keuzes={keuzes} wijzig={wijzig} />}
          {tab === 'app' && <TabApparatuur pakket={pakket} keuzes={keuzes} wijzig={wijzig} />}
        </fieldset>
        {tab === 'wijz' && (
          <TabWijzigingen
            wijzigingen={wijzigingen}
            nietBekeken={pakket.kasten.length - bekeken}
            onInsturen={insturen}
            ingestuurd={!!ingestuurdAt}
            voorbeeld={voorbeeld}
            fout={fout}
            prijzen={pakket.prijzen}
          />
        )}

      </main>
    </div>
  )
}
