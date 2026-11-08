'use client'

import type { Keuzes, Pakket, WerkbladKeuze } from '@/lib/keuzemodule/types'
import { WERKBLAD_EIGENSCHAPPEN, WERKBLAD_MATERIAAL } from '@/lib/keuzemodule/klantlaag'
import { C, Kaart } from './ui'

// Werkblad: alleen ons voorstel, met akkoord of bespreken en ruimte voor een
// opmerking. Rechts in één oogopslag hoe de materialen zich tot elkaar
// verhouden; het materiaal van het voorstel is gemarkeerd.

const SCORE_TEKST = { 3: 'goed', 2: 'redelijk', 1: 'gevoelig' } as const
const SCORE_KLEUR = { 3: C.groen, 2: '#8FB3A6', 1: '#D08A3C' } as const

function Stippen({ score }: { score: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className="w-[7px] h-[7px] rounded-full" style={{ background: i <= score ? SCORE_KLEUR[score] : '#E3DFD7' }} />
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
    <section aria-label="Werkblad" className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start max-w-[1180px]">
      <div className="flex flex-col gap-[18px] min-w-0">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[22px] font-bold">Werkblad</h2>
          <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
            Dit werkblad stellen wij voor bij jouw keuken. Vind je het goed, kies dan Akkoord. Twijfel je of wil je iets
            anders? Kies Bespreken en schrijf erbij wat je wilt; dan nemen we het mee in het gesprek.
          </p>
        </div>

        <Kaart className="px-5 py-[18px] flex flex-col gap-4" style={{ border: `2px solid ${wb.status === 'bespreken' ? '#D08A3C' : C.groen}` }}>
          <div className="flex flex-col gap-1">
            <div className="text-[13px] font-semibold" style={{ color: C.groen }}>Ons voorstel</div>
            <div className="text-lg font-bold">{wbP.voorstel ?? 'Volgt in het gesprek'}</div>
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
                  className="min-h-11 px-5 rounded-[10px] text-sm font-semibold cursor-pointer"
                  style={{ background: aan ? C.groen : '#FFFFFF', color: aan ? '#FFFFFF' : C.ink, border: `1px solid ${aan ? C.groen : C.lijnInput}` }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Opmerking over het werkblad</span>
            <textarea
              value={wb.opmerking ?? ''}
              onChange={(e) => zet({ opmerking: e.target.value })}
              rows={3}
              maxLength={1000}
              placeholder="Bijvoorbeeld: liever een lichtere kleur, of een andere rand"
              className="w-full rounded-[10px] px-3 py-2.5 text-[15px] leading-normal resize-y"
              style={{ border: `1px solid ${C.lijnInput}`, color: C.ink, background: '#FFFFFF' }}
            />
          </label>
        </Kaart>
      </div>

      <Kaart className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 text-[15px] font-bold">Materialen vergeleken</h3>
          <div className="text-xs" style={{ color: C.muted }}>Algemene indicatie; per steensoort en afwerking verschilt het.</div>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left font-normal pb-1.5" />
              {WERKBLAD_MATERIAAL.map((m) => {
                const jouw = m.key === wbP.materiaal
                return (
                  <th key={m.key} scope="col" className="pb-1.5 px-0.5 font-semibold text-center align-bottom" style={{ background: jouw ? C.groenLicht : undefined, borderRadius: '8px 8px 0 0' }}>
                    {jouw && <div className="text-[10px] font-bold uppercase tracking-wide pt-1" style={{ color: C.groen }}>Jouw blad</div>}
                    {m.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {WERKBLAD_EIGENSCHAPPEN.map((e) => (
              <tr key={e.key} style={{ borderTop: '1px solid #EFECE6' }}>
                <th scope="row" className="text-left font-normal py-1.5 pr-1.5">
                  <div className="font-semibold" style={{ color: C.ink }}>{e.label}</div>
                  <div className="text-[11px] leading-tight" style={{ color: C.zacht }}>{e.uitleg}</div>
                </th>
                {WERKBLAD_MATERIAAL.map((m) => {
                  const s = e.score[m.key]
                  return (
                    <td key={m.key} className="text-center py-1.5" style={{ background: m.key === wbP.materiaal ? C.groenLicht : undefined }}>
                      <span className="sr-only">{SCORE_TEKST[s]}</span>
                      <Stippen score={s} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: C.muted }}>
          {([3, 2, 1] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><Stippen score={s} />{SCORE_TEKST[s]}</span>
          ))}
        </div>
      </Kaart>
    </section>
  )
}
