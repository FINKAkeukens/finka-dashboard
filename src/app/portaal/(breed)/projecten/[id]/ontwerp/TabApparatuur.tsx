'use client'

import type { ApparaatKeuze, Keuzes, Pakket } from '@/lib/keuzemodule/types'
import { C, Kaart, KeuzeKaart } from './ui'

export default function TabApparatuur({ pakket, keuzes, wijzig }: { pakket: Pakket; keuzes: Keuzes; wijzig: (f: (k: Keuzes) => Keuzes) => void }) {
  const plekken = pakket.kasten.filter((k) => k.soort === 'apparaat')
  const zet = (id: string, patch: Partial<ApparaatKeuze>) =>
    wijzig((k) => ({ ...k, apparatuur: { ...k.apparatuur, [id]: { ...k.apparatuur?.[id], ...patch } } }))

  return (
    <section aria-label="Apparatuur" className="max-w-[1040px] flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="kv-kop m-0 text-[30px] sm:text-[36px]">Apparatuur</h2>
        <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
          Per plek in je keuken zie je welk apparaat wij voorstellen. Je kunt aangeven dat je een alternatief wilt of je
          eigen apparaat opgeven; wij controleren dan of het past.
        </p>
      </div>
      {plekken.map((k) => {
        const a = keuzes.apparatuur?.[k.id] ?? {}
        const knop = (key: NonNullable<ApparaatKeuze['choice']>, label: string) => {
          const aan = a.choice === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => zet(k.id, { choice: key })}
              aria-pressed={aan}
              className="min-h-11 px-3.5 rounded-[2px] kv-knop cursor-pointer"
              style={{ background: aan ? C.groen : '#FFFFFF', color: aan ? '#FFFFFF' : C.ink, border: `1px solid ${aan ? C.groen : C.lijnInput}` }}
            >
              {label}
            </button>
          )
        }
        return (
          <Kaart key={k.id} className="px-5 py-[18px] flex flex-col gap-3.5">
            <div className="flex flex-wrap justify-between gap-3.5 items-start">
              <div className="flex flex-col gap-1 min-w-0" style={{ flex: '1 1 320px' }}>
                <div className="text-[13px] font-semibold" style={{ color: C.muted }}>
                  {k.apparaat ?? 'Apparaat'} · kast {k.positie}
                </div>
                <div className="text-[17px] font-bold">{k.apparaatVoorstel ?? 'Volgens je offerte'}</div>
                <div className="text-sm" style={{ color: C.tekst }}>{k.naam}{k.omschrijving ? ` · ${k.omschrijving}` : ''}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {knop('akkoord', 'Akkoord')}
                {knop('alt', 'Alternatief gewenst')}
                {knop('eigen', 'Eigen apparaat')}
              </div>
            </div>
            {a.choice === 'alt' && (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {([['instap', 'Eenvoudiger', 'Een voordeliger apparaat met de belangrijkste functies'], ['luxe', 'Luxer', 'Meer functies of een hoger segment']] as const).map(([key, label, sub]) => (
                  <KeuzeKaart key={key} aan={a.alt === key} onClick={() => zet(k.id, { alt: key })} className="p-3.5">
                    <span className="text-[15px] font-bold">{label}</span>
                    <span className="text-[13px]" style={{ color: C.tekst }}>{sub}</span>
                    <span className="text-xs font-semibold" style={{ color: C.muted }}>We stellen een apparaat voor in het aangepaste ontwerp</span>
                  </KeuzeKaart>
                ))}
              </div>
            )}
            {a.choice === 'eigen' && (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1.5" style={{ flex: '1 1 200px' }}>
                  <label htmlFor={`merk-${k.id}`} className="text-[13px] font-semibold">Merk</label>
                  <input
                    id={`merk-${k.id}`}
                    type="text"
                    value={a.merk ?? ''}
                    onChange={(e) => zet(k.id, { merk: e.target.value.slice(0, 100) })}
                    placeholder="Het merk op het typeplaatje"
                    className="min-h-11 box-border rounded-[2px] px-3 text-sm bg-white"
                    style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}
                  />
                </div>
                <div className="flex flex-col gap-1.5" style={{ flex: '1 1 200px' }}>
                  <label htmlFor={`type-${k.id}`} className="text-[13px] font-semibold">Typenummer</label>
                  <input
                    id={`type-${k.id}`}
                    type="text"
                    value={a.type ?? ''}
                    onChange={(e) => zet(k.id, { type: e.target.value.slice(0, 100) })}
                    placeholder="Staat op het typeplaatje"
                    className="min-h-11 box-border rounded-[2px] px-3 text-sm bg-white"
                    style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}
                  />
                </div>
                <div className="text-[13px] basis-full" style={{ color: C.muted }}>Wij zoeken de inbouwmaten op en laten weten of het in de nis past.</div>
              </div>
            )}
          </Kaart>
        )
      })}
    </section>
  )
}
