'use client'

import type { AccessoireKeuze, Keuzes, Pakket } from '@/lib/keuzemodule/types'
import { C, Kaart } from './ui'

// Accessoires uit de offerte (spoelbak, kraan…): per stuk akkoord of
// bespreken, met ruimte voor een opmerking.
export default function TabAccessoires({ pakket, keuzes, wijzig }: { pakket: Pakket; keuzes: Keuzes; wijzig: (f: (k: Keuzes) => Keuzes) => void }) {
  const zet = (id: string, patch: Partial<AccessoireKeuze>) =>
    wijzig((k) => ({ ...k, accessoires: { ...k.accessoires, [id]: { ...k.accessoires?.[id], ...patch } } }))

  return (
    <section aria-label="Accessoires" className="max-w-[1040px] flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="kv-kop m-0 text-[30px] sm:text-[36px]">Accessoires</h2>
        <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
          Dit hebben we voor je keuken uitgekozen. Vind je het goed, kies dan Akkoord. Wil je iets anders of heb je een
          vraag? Kies Bespreken en schrijf erbij wat je wilt.
        </p>
      </div>
      {pakket.accessoires.map((a) => {
        const x = keuzes.accessoires?.[a.id] ?? {}
        return (
          <Kaart key={a.id} className="px-5 py-[18px] flex flex-col gap-3.5">
            <div className="flex flex-wrap justify-between gap-3.5 items-start">
              <div className="flex flex-col gap-1 min-w-0" style={{ flex: '1 1 320px' }}>
                <div className="kv-label" style={{ color: C.muted }}>{a.soort}</div>
                <div className="kv-kop text-[24px]">{a.naam}</div>
                {a.omschrijving && <div className="text-sm" style={{ color: C.tekst }}>{a.omschrijving}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {([['akkoord', 'Akkoord'], ['bespreken', 'Bespreken']] as const).map(([s, label]) => {
                  const aan = x.status === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => zet(a.id, { status: aan ? undefined : s })}
                      aria-pressed={aan}
                      className="min-h-11 px-4 rounded-[2px] kv-knop cursor-pointer"
                      style={{ background: aan ? C.groen : '#FFFFFF', color: aan ? '#FFFFFF' : C.ink, border: `1px solid ${aan ? C.groen : C.lijnInput}` }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`acc-${a.id}`} className="kv-label" style={{ color: C.muted }}>Opmerking of vraag</label>
              <textarea
                id={`acc-${a.id}`}
                value={x.opmerking ?? ''}
                onChange={(e) => zet(a.id, { opmerking: e.target.value.slice(0, 1000) })}
                rows={2}
                placeholder="Een wens of vraag over dit accessoire"
                className="w-full box-border rounded-[2px] px-3 py-2.5 text-sm leading-normal resize-y bg-white"
                style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}
              />
            </div>
          </Kaart>
        )
      })}
    </section>
  )
}
