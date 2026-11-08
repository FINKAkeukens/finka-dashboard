'use client'

import { useState } from 'react'
import type { KastKeuze, PakketExtra, PakketKast } from '@/lib/keuzemodule/types'
import { GROEPEN, UITVOERINGEN, type OptieGroep } from '@/lib/keuzemodule/klantlaag'
import { uitvoeringVan } from '@/lib/keuzemodule/wijzigingen'
import { C, Vinkje, euro } from './ui'

// Alle toebehoren die in deze kast passen, per groep één regel met een
// samenvatting. Eén groep tegelijk open, zodat het paneel kort blijft.

function prijsTekst(p: number | null, aftrek = 0): string {
  if (p === null) return 'prijs volgt'
  const d = p - aftrek
  if (d === 0) return 'geen meerprijs'
  return (d > 0 ? '+' : '−') + euro(Math.abs(d))
}

export default function KastExtras({
  k, st, setKast, prijzen,
}: {
  k: PakketKast
  prijzen: boolean
  st: KastKeuze
  setKast: (id: string, patch: Partial<KastKeuze>) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const ex = st.extras ?? {}
  const groepen = GROEPEN
    .map((g) => ({ g, opties: k.extras.filter((e) => e.groep === g.key) }))
    .filter((x) => x.opties.length > 0)
  if (!groepen.length) return null

  const zet = (e: PakketExtra, g: OptieGroep) => {
    if (e.inOntwerp) return
    if (g.keuze === 'een') {
      const nieuw = { ...ex }
      for (const o of k.extras.filter((o) => o.groep === g.key)) nieuw[o.key] = false
      nieuw[e.key] = !ex[e.key]
      setKast(k.id, { extras: nieuw })
    } else {
      setKast(k.id, { extras: { ...ex, [e.key]: !ex[e.key] } })
    }
  }
  const geenInGroep = (g: OptieGroep) => {
    const nieuw = { ...ex }
    for (const o of k.extras.filter((o) => o.groep === g.key)) nieuw[o.key] = false
    setKast(k.id, { extras: nieuw })
  }

  // Houtuitvoering: alleen tonen als er iets van hout gekozen is of in het ontwerp zit.
  const houten = k.extras.filter((e) => e.uitvoeringen && (ex[e.key] || e.inOntwerp))
  const beschikbaar = UITVOERINGEN.filter((u) => houten.some((e) => e.uitvoeringen!.includes(u.key)))
  const huidigeU = houten.length ? uitvoeringVan(houten[0], st, k.uitvoering) : null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-between items-baseline gap-2">
        <div className="kv-label" style={{ color: C.muted }}>Extra&apos;s voor deze kast</div>
        {prijzen && <div className="text-xs" style={{ color: C.zacht }}>indicatie, catalogusprijs</div>}
      </div>
      <div className="rounded-[2px] overflow-hidden" style={{ border: `1px solid ${C.lijnInput}` }}>
        {groepen.map(({ g, opties }, gi) => {
          const isOpen = open === g.key
          const inOntwerp = opties.filter((e) => e.inOntwerp)
          const gekozen = opties.filter((e) => ex[e.key] && !e.inOntwerp)
          const vervangen = g.keuze === 'een' ? inOntwerp[0] : undefined
          const som = gekozen.reduce((s, e) => s + (e.prijs ?? 0), 0) - (gekozen.length && vervangen?.prijs ? vervangen.prijs : 0)
          let samenvatting: string
          if (g.keuze === 'een') {
            samenvatting = gekozen[0]?.label ?? (inOntwerp[0] ? `${inOntwerp[0].label} (in je ontwerp)` : 'Geen')
          } else {
            const n = gekozen.length
            samenvatting = n ? `${n} gekozen` : inOntwerp.length ? `${inOntwerp.length} in je ontwerp` : g.sub
          }
          const paneelId = `groep-${k.id}-${g.key}`
          return (
            <div key={g.key} style={{ borderTop: gi ? '1px solid #EFECE6' : 'none' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : g.key)}
                aria-expanded={isOpen}
                aria-controls={paneelId}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-14 cursor-pointer text-left bg-white border-0"
                style={{ color: C.ink, background: isOpen ? C.vlak : '#FFFFFF' }}
              >
                <span className="flex flex-col gap-0.5 flex-auto min-w-0">
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="text-[13px] truncate" style={{ color: gekozen.length ? C.groenDonker : C.muted, fontWeight: gekozen.length ? 600 : 400 }}>
                    {samenvatting}
                  </span>
                </span>
                {prijzen && gekozen.length > 0 && (
                  <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: C.tekst }}>
                    {gekozen.some((e) => e.prijs === null) ? (som ? `${prijsTekst(som)} + p.v.` : 'prijs volgt') : prijsTekst(som)}
                  </span>
                )}
                <span aria-hidden="true" className="text-base leading-none flex-none" style={{ color: C.muted, transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>
              {isOpen && (
                <div id={paneelId} role={g.keuze === 'een' ? 'radiogroup' : 'group'} aria-label={g.label} className="flex flex-col gap-1.5 px-2.5 pb-3 pt-1" style={{ background: C.vlak }}>
                  {g.keuze === 'een' && (
                    <Optie
                      soort="radio"
                      aan={!gekozen.length}
                      onClick={() => geenInGroep(g)}
                      label={vervangen ? vervangen.label : 'Geen'}
                      sub={vervangen ? 'Zit al in je ontwerp' : 'Geen bestekindeling'}
                      prijs={vervangen && prijzen ? 'ons voorstel' : ''}
                      voorstel={!!vervangen}
                    />
                  )}
                  {opties.filter((e) => !(g.keuze === 'een' && e.inOntwerp)).map((e) => (
                    <Optie
                      key={e.key}
                      soort={g.keuze === 'een' ? 'radio' : 'check'}
                      aan={!!ex[e.key] || !!e.inOntwerp}
                      vast={!!e.inOntwerp}
                      onClick={() => zet(e, g)}
                      label={e.label}
                      sub={e.inOntwerp ? 'Zit al in je ontwerp' : e.sub}
                      prijs={e.inOntwerp ? 'in je ontwerp' : prijzen ? prijsTekst(e.prijs, vervangen?.prijs ?? 0) : ''}
                      voorstel={!!e.inOntwerp}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {beschikbaar.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px]" style={{ color: C.muted }}>Uitvoering houten inzetten:</span>
          {beschikbaar.map((u) => {
            const aan = huidigeU === u.key
            return (
              <button
                key={u.key}
                type="button"
                onClick={() => setKast(k.id, { uitvoering: u.key })}
                aria-pressed={aan}
                className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-[2px] text-[13px] font-semibold cursor-pointer"
                style={{ background: aan ? C.groenLicht : '#FFFFFF', border: `1px solid ${aan ? C.groen : C.lijnInput}`, color: C.ink }}
              >
                <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full" style={{ background: u.kleur }} />
                {u.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Optie({
  soort, aan, vast = false, onClick, label, sub, prijs, voorstel,
}: {
  soort: 'radio' | 'check'
  aan: boolean
  vast?: boolean
  onClick: () => void
  label: string
  sub: string
  prijs: string
  voorstel: boolean
}) {
  return (
    <button
      type="button"
      role={soort === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={aan}
      aria-disabled={vast || undefined}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 min-h-12 rounded-[2px] text-left"
      style={{
        background: aan ? C.groenLicht : '#FFFFFF',
        border: aan ? `1.5px solid ${C.groen}` : `1px solid ${C.lijnInput}`,
        color: C.ink,
        cursor: vast ? 'default' : 'pointer',
      }}
    >
      {soort === 'check' ? (
        <Vinkje aan={aan} />
      ) : (
        <span aria-hidden="true" className="flex-none w-[18px] h-[18px] rounded-full box-border flex items-center justify-center" style={{ border: `1.5px solid ${aan ? C.groen : '#8A8780'}`, background: '#FFFFFF' }}>
          {aan && <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.groen }} />}
        </span>
      )}
      <span className="flex flex-col flex-auto min-w-0">
        <span className="text-sm font-semibold leading-snug">{label}</span>
        {sub && <span className="text-[13px] leading-snug" style={{ color: C.muted }}>{sub}</span>}
      </span>
      {prijs && (
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: voorstel ? C.accent : C.tekst }}>{prijs}</span>
      )}
    </button>
  )
}
