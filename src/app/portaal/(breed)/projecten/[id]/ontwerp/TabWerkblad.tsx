'use client'

import { useState } from 'react'
import type { Keuzes, Pakket, WerkbladKeuze } from '@/lib/keuzemodule/types'
import { WERKBLAD_MATERIALEN, WERKBLAD_RICHTINGEN } from '@/lib/keuzemodule/klantlaag'
import { C, Chip, Kaart, KeuzeKaart, Staal, Tag } from './ui'

const TOON = 12

export default function TabWerkblad({ pakket, keuzes, wijzig }: { pakket: Pakket; keuzes: Keuzes; wijzig: (f: (k: Keuzes) => Keuzes) => void }) {
  const [filter, setFilter] = useState<'alles' | 'hout' | 'steen' | 'marmer'>('alles')
  const [alles, setAlles] = useState(false)
  const wbP = pakket.werkblad
  const wb: WerkbladKeuze = { mode: 'voorstel', mat: 'laminaat', ...keuzes.werkblad }
  const zet = (patch: Partial<WerkbladKeuze>) => wijzig((k) => ({ ...k, werkblad: { mode: 'voorstel', mat: 'laminaat', ...k.werkblad, ...patch } }))
  const zelf = wb.mode === 'zelf'
  const sachsen = wb.mat === 'laminaat' || wb.mat === 'compact'
  const compact = wb.mat === 'compact'

  const lijst = wbP.decors.filter((d) => d.compact === compact)
  const telGroep = (g: string) => lijst.filter((d) => d.groep === g).length
  let zichtbaar = lijst.filter((d) => filter === 'alles' || d.groep === filter)
  const totaal = zichtbaar.length
  if (!alles) zichtbaar = zichtbaar.slice(0, TOON)
  const gekozen = lijst.find((d) => d.code === wb.code)
  const diktes = compact ? [12] : (gekozen?.diktes.length ? gekozen.diktes : [16, 40, 50])

  const voorstelNaam = wbP.voorstel ? `${wbP.voorstel.naam} (${wbP.voorstel.code})` : wbP.voorstelTekst
  const voorstelSub = wbP.voorstel
    ? `${wbP.voorstel.compact ? 'Compact laminaat' : 'Laminaat'}${wbP.voorstel.dikte ? `, ${wbP.voorstel.dikte} mm dik` : ''}`
    : null

  return (
    <section aria-label="Werkblad" className="max-w-[1040px] flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[22px] font-bold">Werkblad</h2>
        <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
          {voorstelNaam
            ? 'We hebben een werkblad voorgesteld dat past bij je fronten. Vind je het goed, dan ben je klaar. Wil je zelf kiezen, kies dan eerst het materiaal en daarna de kleur.'
            : 'Kies hieronder het materiaal en de kleur van je werkblad, of laat het ons voorstellen in het gesprek.'}
        </p>
      </div>

      <Kaart className="px-5 py-[18px] flex flex-wrap items-center gap-[18px]" style={{ border: zelf ? `1px solid ${C.lijn}` : `2px solid ${C.groen}` }}>
        {wbP.voorstel && <Staal src={wbP.voorstel.img} className="flex-none w-[150px] h-[62px] rounded-lg" />}
        <div className="flex flex-col gap-1 min-w-0" style={{ flex: '1 1 240px' }}>
          <div className="text-[13px] font-semibold" style={{ color: C.groen }}>Ons voorstel</div>
          <div className="text-lg font-bold">{voorstelNaam ?? 'Volgt in het gesprek'}</div>
          {voorstelSub && <div className="text-sm" style={{ color: C.tekst }}>{voorstelSub}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {([['voorstel', voorstelNaam ? 'Akkoord met voorstel' : 'Graag jullie voorstel'], ['zelf', 'Zelf kiezen']] as const).map(([m, label]) => {
            const aan = wb.mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => zet({ mode: m })}
                aria-pressed={aan}
                className="min-h-11 px-4 rounded-[10px] text-sm font-semibold cursor-pointer"
                style={{ background: aan ? C.groen : '#FFFFFF', color: aan ? '#FFFFFF' : C.ink, border: `1px solid ${aan ? C.groen : C.lijnInput}` }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Kaart>

      {zelf && (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2.5">
            <div className="text-[15px] font-bold">1. Materiaal</div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {WERKBLAD_MATERIALEN.map((m) => {
                const aantal = m.key === 'laminaat' ? wbP.decors.filter((d) => !d.compact).length : m.key === 'compact' ? wbP.decors.filter((d) => d.compact).length : null
                return (
                  <KeuzeKaart
                    key={m.key}
                    aan={wb.mat === m.key}
                    onClick={() => { zet({ mat: m.key, code: undefined, dikte: m.key === 'compact' ? 12 : 40 }); setFilter('alles'); setAlles(false) }}
                    className="p-3.5 min-h-[120px]"
                  >
                    <span className="text-[15px] font-bold">{m.label}</span>
                    <span className="text-[13px] leading-snug" style={{ color: C.tekst }}>{m.sub}</span>
                    <span className="text-xs font-semibold" style={{ color: C.muted }}>
                      {aantal !== null ? `${aantal} decors · Sachsenküchen` : 'via onze steenleverancier'}
                    </span>
                  </KeuzeKaart>
                )
              })}
            </div>
          </div>

          {sachsen ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap justify-between items-center gap-2.5">
                <div className="text-[15px] font-bold">2. Kleur en decor</div>
                <div role="group" aria-label="Soort decor" className="flex flex-wrap gap-1.5">
                  <Chip aan={filter === 'alles'} onClick={() => { setFilter('alles'); setAlles(false) }}>Alle ({lijst.length})</Chip>
                  {(['hout', 'steen', 'marmer'] as const).filter((g) => telGroep(g) > 0).map((g) => (
                    <Chip key={g} aan={filter === g} onClick={() => { setFilter(g); setAlles(false) }}>
                      {g === 'hout' ? 'Hout' : g === 'steen' ? 'Steen en beton' : 'Marmer en travertin'} ({telGroep(g)})
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
                {zichtbaar.map((d) => {
                  const aan = wb.code === d.code
                  const voorstel = wbP.voorstel?.code === d.code && wbP.voorstel.compact === d.compact
                  return (
                    <KeuzeKaart
                      key={d.code}
                      aan={aan}
                      onClick={() => zet({ code: d.code, dikte: d.diktes.includes(wb.dikte ?? 0) ? wb.dikte : d.diktes.includes(40) ? 40 : d.diktes[0] })}
                    >
                      <Staal src={d.img} className="w-full aspect-[150/62]" />
                      <span className="text-[13px] font-semibold leading-tight">{d.naam}</span>
                      <Tag soort={voorstel ? 'voorstel' : aan ? 'gekozen' : 'code'}>{voorstel ? 'ons voorstel' : aan ? 'gekozen' : d.code}</Tag>
                    </KeuzeKaart>
                  )
                })}
              </div>
              {!alles && totaal > TOON && (
                <button type="button" onClick={() => setAlles(true)} className="self-start min-h-11 px-4 rounded-full text-sm font-semibold cursor-pointer bg-white" style={{ border: `1px solid ${C.groen}`, color: C.groenDonker }}>
                  Toon alle {totaal}
                </button>
              )}
              <div className="flex flex-col gap-2">
                <div className="text-[15px] font-bold">3. Dikte</div>
                <div role="group" aria-label="Dikte werkblad" className="flex flex-wrap gap-2">
                  {diktes.map((d) => (
                    <Chip key={d} aan={wb.dikte === d} onClick={() => zet({ dikte: d })}>
                      {d} mm{wbP.voorstel?.dikte === d ? ' (voorstel)' : ''}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Kaart className="px-5 py-[18px] flex flex-col gap-3">
              <div className="text-[15px] font-bold">2. Welke kant wil je op?</div>
              <p className="m-0 text-sm leading-normal" style={{ color: C.tekst }}>
                Deze werkbladen kiezen we samen aan de hand van echte stalen in de showroom. Geef je voorkeur aan, dan
                leggen we passende stalen klaar.
              </p>
              <div role="group" aria-label="Kleurrichting" className="flex flex-wrap gap-2">
                {WERKBLAD_RICHTINGEN.map((r) => <Chip key={r} aan={wb.richting === r} onClick={() => zet({ richting: r })}>{r}</Chip>)}
              </div>
            </Kaart>
          )}
        </div>
      )}
    </section>
  )
}
