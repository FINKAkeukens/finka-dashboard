'use client'

import type { Keuzes, Pakket, WerkbladKeuze } from '@/lib/keuzemodule/types'
import { WERKBLAD_EIGENSCHAPPEN, WERKBLAD_MATERIAAL } from '@/lib/keuzemodule/klantlaag'
import { C, Kaart } from './ui'

// Werkblad: alleen ons voorstel, met akkoord of bespreken en ruimte voor een
// opmerking. Rechts in één oogopslag hoe de materialen zich tot elkaar
// verhouden; het materiaal van het voorstel is gemarkeerd.

// Gevoeligheid als korte meter: hoe meer blokjes, hoe gevoeliger.
const NIVEAU_TEKST = { 1: 'laag', 2: 'gemiddeld', 3: 'hoog' } as const
const NIVEAU_KLEUR = { 1: C.accent, 2: '#B89A6A', 3: '#A65A3A' } as const

function Meter({ niveau }: { niveau: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex gap-[2px]" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className="w-[8px] sm:w-[12px] h-[7px]" style={{ background: i <= niveau ? NIVEAU_KLEUR[niveau] : '#E4E0DA' }} />
      ))}
    </span>
  )
}

export default function TabWerkblad({ pakket, keuzes, wijzig }: { pakket: Pakket; keuzes: Keuzes; wijzig: (f: (k: Keuzes) => Keuzes) => void }) {
  const wbP = pakket.werkblad
  const wb: WerkbladKeuze = keuzes.werkblad ?? {}
  const zet = (patch: Partial<WerkbladKeuze>) => wijzig((k) => ({ ...k, werkblad: { ...k.werkblad, ...patch } }))
  const materiaal = WERKBLAD_MATERIAAL.find((m) => m.key === wbP.materiaal)

  return (
    <section aria-label="Werkblad" className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] gap-6 lg:gap-12 items-start">
      <div className="flex flex-col gap-[18px] min-w-0 max-w-[680px]">
        <div className="flex flex-col gap-1.5">
          <h2 className="kv-kop m-0 text-[30px] sm:text-[36px]">Werkblad</h2>
          <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
            Dit werkblad stellen wij voor bij jouw keuken. Vind je het goed, kies dan Akkoord. Twijfel je of wil je iets
            anders? Kies Bespreken en schrijf erbij wat je wilt; dan nemen we het mee in het gesprek.
          </p>
        </div>

        <Kaart className="px-5 py-[18px] flex flex-col gap-4" style={{ border: `2px solid ${wb.status === 'bespreken' ? '#9A6B2A' : C.groen}` }}>
          <div className="flex flex-col gap-1">
            <div className="kv-label" style={{ color: C.accent }}>Ons voorstel</div>
            <div className="kv-kop text-[28px]">{wbP.voorstel ?? 'Volgt in het gesprek'}</div>
            {materiaal && <div className="text-sm" style={{ color: C.tekst }}>{materiaal.label}: {materiaal.sub.charAt(0).toLowerCase() + materiaal.sub.slice(1)}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {([['akkoord', 'Akkoord'], ['bespreken', 'Bespreken']] as const).map(([s, label]) => {
              const aan = wb.status === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => zet({ status: aan ? undefined : s })}
                  aria-pressed={aan}
                  className="min-h-11 px-5 rounded-[2px] kv-knop cursor-pointer"
                  style={{ background: aan ? C.groen : '#FFFFFF', color: aan ? '#FFFFFF' : C.ink, border: `1px solid ${aan ? C.groen : C.lijnInput}` }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="kv-label" style={{ color: C.muted }}>Opmerking over het werkblad</span>
            <textarea
              value={wb.opmerking ?? ''}
              onChange={(e) => zet({ opmerking: e.target.value })}
              rows={3}
              maxLength={1000}
              placeholder="Bijvoorbeeld: liever een lichtere kleur, of een andere rand"
              className="w-full rounded-[2px] px-3 py-2.5 text-[15px] leading-normal resize-y"
              style={{ border: `1px solid ${C.lijnInput}`, color: C.ink, background: '#FFFFFF' }}
            />
          </label>
        </Kaart>
      </div>

      <Kaart className="min-w-0 px-3 sm:px-6 py-5 flex flex-col gap-3.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="kv-kop m-0 text-[26px]">Materialen vergeleken</h3>
          <div className="text-[13px]" style={{ color: C.muted }}>Algemene indicatie; per steensoort en afwerking verschilt het.</div>
        </div>
        <table className="w-full text-xs sm:text-[13px] border-collapse">
          <thead>
            <tr>
              <th className="text-left font-normal pb-1.5" />
              {WERKBLAD_MATERIAAL.map((m) => {
                const jouw = m.key === wbP.materiaal
                return (
                  <th key={m.key} scope="col" className="pb-2 px-0.5 sm:px-1 font-semibold text-center align-bottom" style={{ background: jouw ? C.groenLicht : undefined, borderRadius: 0 }}>
                    {jouw && <div className="text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.12em] sm:tracking-[0.16em] pt-1.5" style={{ color: C.accent }}>Jouw blad</div>}
                    {m.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {WERKBLAD_EIGENSCHAPPEN.map((e) => (
              <tr key={e.key} style={{ borderTop: '1px solid #EFECE6' }}>
                <th scope="row" className="text-left font-normal py-2.5 pr-1.5 sm:pr-3">
                  <div className="font-semibold" style={{ color: C.ink }}>{e.label}</div>
                  <div className="text-[11px] sm:text-xs leading-snug mt-0.5" style={{ color: C.zacht }}>{e.uitleg}</div>
                </th>
                {WERKBLAD_MATERIAAL.map((m) => {
                  const n = e.gevoelig[m.key]
                  return (
                    <td key={m.key} className="text-center py-2.5 px-0.5 sm:px-1" style={{ background: m.key === wbP.materiaal ? C.groenLicht : undefined }}>
                      <span className="sr-only">{NIVEAU_TEKST[n]}</span>
                      <Meter niveau={n} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: C.muted }}>
          <span>Gevoeligheid:</span>
          {([1, 2, 3] as const).map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5"><Meter niveau={n} />{NIVEAU_TEKST[n]}</span>
          ))}
        </div>
      </Kaart>
    </section>
  )
}
