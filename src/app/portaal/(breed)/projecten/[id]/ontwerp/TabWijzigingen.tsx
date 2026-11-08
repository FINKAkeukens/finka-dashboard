'use client'

import { useState } from 'react'
import type { Wijziging } from '@/lib/keuzemodule/types'
import { totaalVan } from '@/lib/keuzemodule/wijzigingen'
import { C, Kaart, delta } from './ui'

export default function TabWijzigingen({
  wijzigingen, nietBekeken, onInsturen, ingestuurd, voorbeeld, fout, prijzen,
}: {
  wijzigingen: Wijziging[]
  prijzen: boolean
  nietBekeken: number
  onInsturen: () => Promise<void>
  ingestuurd: boolean
  voorbeeld: boolean
  fout: string
}) {
  const [bezig, setBezig] = useState(false)
  const { totaal, open } = totaalVan(wijzigingen)

  async function insturen() {
    if (!window.confirm('Feedback insturen? Daarna kun je niets meer wijzigen tot wij het aangepaste ontwerp klaar hebben.')) return
    setBezig(true)
    await onInsturen()
    setBezig(false)
  }

  return (
    <section aria-label="Wijzigingen" className="max-w-[920px] flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="kv-kop m-0 text-[30px] sm:text-[36px]">Je wijzigingen op een rij</h2>
        <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
          Controleer alles en stuur het in één keer naar ons. Dit is je feedbackronde: wij verwerken alles in één
          aangepast ontwerp.
        </p>
      </div>
      <Kaart className="overflow-hidden">
        {wijzigingen.length === 0 && <div className="p-6 text-[15px]" style={{ color: C.muted }}>Nog geen wijzigingen of vragen.</div>}
        {wijzigingen.map((w, i) => (
          <div key={i} className="px-5 py-3.5 flex justify-between items-start gap-4" style={{ borderBottom: '1px solid #EFECE6' }}>
            <div className="flex gap-3.5 items-start min-w-0">
              <span
                className="flex-none text-xs font-bold px-2 py-1 rounded-[2px]"
                style={w.soort === 'vraag' ? { background: '#DCE6F4', color: '#203C6B' } : { background: '#F6E3C3', color: '#6B3F06' }}
              >
                {w.tag}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="text-[15px] font-semibold">{w.titel}</div>
                <div className="text-sm leading-snug" style={{ color: C.tekst }}>{w.tekst}</div>
              </div>
            </div>
            <div className="text-[15px] font-semibold whitespace-nowrap">
              {w.bedrag ? delta(w.bedrag) : ''}
              {w.prijsVolgt ? `${w.bedrag ? ' + ' : ''}prijs volgt` : ''}
            </div>
          </div>
        ))}
        {prijzen && <div className="px-5 py-4 flex justify-between items-center" style={{ background: C.vlak }}>
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-bold">Prijsverschil (indicatie)</div>
            <div className="text-[13px]" style={{ color: C.muted }}>
              {open ? `plus ${open} ${open === 1 ? 'post' : 'posten'} waarvan we de prijs nog berekenen` : 'alle posten zijn doorgerekend'}
            </div>
          </div>
          <div className="text-xl font-bold">{delta(totaal)}</div>
        </div>}
      </Kaart>
      {!ingestuurd && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm" style={{ color: C.tekst }}>
            {nietBekeken > 0
              ? `Nog ${nietBekeken} ${nietBekeken === 1 ? 'kast' : 'kasten'} niet bekeken. Je kunt toch insturen; die beschouwen we als akkoord.`
              : 'Alle kasten bekeken.'}
          </div>
          <button
            type="button"
            onClick={insturen}
            disabled={bezig || voorbeeld}
            className="min-h-12 px-7 rounded-[2px] border-0 text-white kv-knop cursor-pointer disabled:opacity-50"
            style={{ background: C.groen }}
          >
            {bezig ? 'Bezig…' : 'Feedback insturen'}
          </button>
        </div>
      )}
      {fout && <p className="text-sm text-red-600">{fout}</p>}
    </section>
  )
}
