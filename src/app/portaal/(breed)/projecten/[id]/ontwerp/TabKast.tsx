'use client'

import { useState } from 'react'
import type { Keuzes, KastKeuze, Pakket, PakketKast } from '@/lib/keuzemodule/types'
import { kastStatus } from '@/lib/keuzemodule/wijzigingen'
import { STATUS_KEUZES, STATUS_LABELS } from '@/lib/keuzemodule/klantlaag'
import { C, STATUS_KLEUR, Chip, Kaart, Vinkje, delta, euro } from './ui'

const NEUTRAAL = { bg: '#FFFFFF', border: '#8A8780', ink: C.ink }

function Plattegrond({
  pakket, keuzes, selId, setSelId,
}: {
  pakket: Pakket
  keuzes: Keuzes
  selId: string | null
  setSelId: (id: string) => void
}) {
  const metPin = pakket.kasten.filter((k) => k.pin)
  if (!pakket.plattegrond || !metPin.length) {
    // Geen plattegrond (of nog geen pins): kasten als lijst per wand.
    const wanden = [...new Set(pakket.kasten.map((k) => k.wand ?? ''))]
    return (
      <div className="flex flex-col gap-4">
        {wanden.map((w) => (
          <div key={w} className="flex flex-col gap-2">
            {w && <div className="text-[13px] font-semibold" style={{ color: C.muted }}>{w}</div>}
            <div className="flex flex-wrap gap-2">
              {pakket.kasten.filter((k) => (k.wand ?? '') === w).map((k) => {
                const st = kastStatus(k, keuzes)
                const c = st ? STATUS_KLEUR[st] : NEUTRAAL
                const sel = k.id === selId
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setSelId(k.id)}
                    className="min-h-11 px-3 rounded-lg text-sm font-semibold cursor-pointer"
                    style={{ background: c.bg, color: c.ink, border: sel ? `3px solid ${C.ink}` : `1.5px solid ${c.border}` }}
                  >
                    {k.positie} · {k.naam}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="relative w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pakket.plattegrond} alt="Plattegrond van je keuken" className="block w-full h-auto rounded-md" />
      {metPin.map((k) => {
        const st = kastStatus(k, keuzes)
        const c = st ? STATUS_KLEUR[st] : NEUTRAAL
        const sel = k.id === selId
        return (
          <button
            key={k.id}
            type="button"
            onClick={() => setSelId(k.id)}
            aria-label={`Kast ${k.positie}, ${k.naam}${st ? ', ' + STATUS_LABELS[st] : ', nog niet bekeken'}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 min-w-9 h-9 px-1.5 rounded-full text-[13px] font-bold cursor-pointer flex items-center justify-center"
            style={{
              left: `${k.pin!.x * 100}%`,
              top: `${k.pin!.y * 100}%`,
              background: c.bg,
              color: c.ink,
              border: sel ? `3px solid ${C.ink}` : `2px solid ${c.border}`,
              boxShadow: sel ? '0 0 0 4px rgba(47,93,80,0.3)' : '0 1px 3px rgba(0,0,0,0.2)',
              zIndex: sel ? 3 : 2,
            }}
          >
            {k.positie}
          </button>
        )
      })}
    </div>
  )
}

function KastPaneel({
  k, keuzes, setKast, onVorige, onVolgende,
}: {
  k: PakketKast
  keuzes: Keuzes
  setKast: (id: string, patch: Partial<KastKeuze>) => void
  onVorige: () => void
  onVolgende: () => void
}) {
  const [alleExtras, setAlleExtras] = useState(false)
  const [cat, setCat] = useState('Alles')
  const st = keuzes.kasten?.[k.id] ?? {}
  const huidig = kastStatus(k, keuzes)
  const voorstel = k.indelingen.find((i) => i.voorstel)
  const gekozenIndeling = st.indeling ?? voorstel?.key
  const ex = st.extras ?? {}
  const cats = ['Alles', ...new Set(k.extras.map((e) => e.cat))]
  const zichtbaar = alleExtras
    ? k.extras.filter((e) => cat === 'Alles' || e.cat === cat)
    : (() => {
        const gekozen = k.extras.filter((e) => ex[e.key])
        const rest = k.extras.filter((e) => !ex[e.key])
        return [...gekozen, ...rest].slice(0, Math.max(3, gekozen.length))
      })()

  return (
    <Kaart className="p-6 flex flex-col gap-[22px]">
      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] font-semibold" style={{ color: C.muted }}>
          Kast {k.positie}{k.wand ? ` · ${k.wand}` : ''}
        </div>
        <h2 className="m-0 text-2xl font-bold">{k.naam}</h2>
        {k.omschrijving && <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>{k.omschrijving}</p>}
        <div className="text-xs" style={{ color: C.zacht }}>Code in ontwerp: {k.code}</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Wat vind je van deze kast?</div>
        <div className="grid grid-cols-3 gap-2">
          {STATUS_KEUZES.map((key) => {
            const c = STATUS_KLEUR[key]
            const aan = huidig === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setKast(k.id, { status: key })}
                aria-pressed={aan}
                className="min-h-12 px-2 py-1.5 rounded-[10px] text-sm font-semibold leading-tight cursor-pointer"
                style={{ background: aan ? c.bg : '#FFFFFF', color: aan ? c.ink : C.ink, border: aan ? `2px solid ${c.border}` : `1px solid ${C.lijnInput}` }}
              >
                {STATUS_LABELS[key]}
              </button>
            )
          })}
        </div>
      </div>

      {k.indelingen.length > 1 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline">
            <div className="text-sm font-semibold">Indeling</div>
            <div className="text-xs" style={{ color: C.zacht }}>prijsverschil t.o.v. ons voorstel</div>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
            {k.indelingen.map((o) => {
              const aan = gekozenIndeling === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setKast(k.id, { indeling: o.key })}
                  aria-pressed={aan}
                  className="flex items-center gap-3 p-2.5 min-h-[76px] rounded-xl cursor-pointer text-left"
                  style={{ background: aan ? C.groenLicht : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : `1px solid ${C.lijnInput}`, color: C.ink }}
                >
                  <span aria-hidden="true" className="relative block w-16 h-14 flex-none rounded" style={{ border: '1.5px solid #8A8780', background: '#FBFAF7' }}>
                    {o.parts.map(([x, y, w, h, soort], i) => (
                      <span
                        key={i}
                        className="absolute box-border"
                        style={{
                          left: x, top: y, width: w,
                          height: soort === 2 ? 0 : h,
                          ...(soort === 0 ? { border: '1.5px solid #5E5B55', borderRadius: 2, background: '#E9E5DD' }
                            : soort === 1 ? { border: `1.5px dashed ${C.groen}`, borderRadius: 2 }
                            : { borderTop: '1.5px dashed #8A8780' }),
                        }}
                      />
                    ))}
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold leading-snug">{o.label}</span>
                    <span className="text-[13px] font-semibold" style={{ color: o.voorstel ? C.groen : C.tekst }}>
                      {o.voorstel ? 'ons voorstel' : delta(o.prijs)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {k.soort === 'apparaat' ? (
        <div className="text-sm leading-normal rounded-[10px] px-3.5 py-3" style={{ color: C.tekst, background: C.vlak }}>
          De indeling van deze kast hangt af van het apparaat. Wil je hier iets anders? Kies &quot;Ik heb een vraag&quot; en
          beschrijf het, of kijk bij Apparatuur.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold">Openen</div>
          {[
            { push: false, label: 'Zoals de hele keuken', sub: 'Met dezelfde greep als de andere kasten', prijs: 'ons voorstel' },
            { push: true, label: 'Push-to-open, zonder greep', sub: 'Even drukken en de lade of deur gaat open', prijs: 'prijs volgt' },
          ].map((o) => {
            const aan = !!st.push === o.push
            return (
              <button
                key={String(o.push)}
                type="button"
                onClick={() => setKast(k.id, { push: o.push })}
                aria-pressed={aan}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-14 rounded-xl cursor-pointer text-left"
                style={{ background: aan ? C.groenLicht : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : `1px solid ${C.lijnInput}`, color: C.ink }}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{o.label}</span>
                  <span className="text-[13px]" style={{ color: C.muted }}>{o.sub}</span>
                </span>
                <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: o.push ? C.muted : C.groen }}>{o.prijs}</span>
              </button>
            )
          })}
        </div>
      )}

      {(k.extras.length > 0 || k.inbegrepen.length > 0) && (
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline gap-2">
            <div className="text-sm font-semibold">{alleExtras ? "Alle extra's voor deze kast" : "Extra's"}</div>
            {!alleExtras && <div className="text-xs" style={{ color: C.zacht }}>aanbevolen voor deze kast</div>}
          </div>
          {k.inbegrepen.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[13px]" style={{ color: C.muted }}>Zit al in je ontwerp:</span>
              {k.inbegrepen.map((i) => (
                <span key={i.key} className="text-[13px] font-semibold px-2.5 py-1 rounded-[14px]" style={{ background: C.groenLicht, color: C.groenDonker }}>
                  ✓ {i.label}
                </span>
              ))}
            </div>
          )}
          {alleExtras && cats.length > 2 && (
            <div role="group" aria-label="Soort extra" className="flex flex-wrap gap-1.5">
              {cats.map((c) => <Chip key={c} aan={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {zichtbaar.map((e) => {
              const aan = !!ex[e.key]
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => setKast(k.id, { extras: { ...ex, [e.key]: !aan } })}
                  aria-pressed={aan}
                  className="flex items-center gap-3 px-3.5 py-2.5 min-h-14 rounded-xl cursor-pointer text-left"
                  style={{ background: aan ? C.groenLicht : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : `1px solid ${C.lijnInput}`, color: C.ink }}
                >
                  <Vinkje aan={aan} />
                  <span className="flex flex-col gap-0.5 flex-auto">
                    <span className="text-sm font-semibold">{e.label}</span>
                    <span className="text-[13px]" style={{ color: C.muted }}>{e.sub}</span>
                  </span>
                  <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: C.tekst }}>
                    {e.prijs === null ? 'prijs volgt' : '+' + euro(e.prijs)}
                  </span>
                </button>
              )
            })}
          </div>
          {k.extras.length > 3 && (
            <button
              type="button"
              onClick={() => { setAlleExtras(!alleExtras); setCat('Alles') }}
              className="self-start min-h-11 px-4 rounded-full text-sm font-semibold cursor-pointer bg-white"
              style={{ border: `1px solid ${C.groen}`, color: C.groenDonker }}
            >
              {alleExtras ? 'Minder tonen' : `Alle extra's voor deze kast (${k.extras.length})`}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="kast-notitie" className="text-sm font-semibold">Opmerking of vraag over deze kast</label>
        <textarea
          id="kast-notitie"
          rows={3}
          value={st.note ?? ''}
          onChange={(e) => setKast(k.id, { note: e.target.value.slice(0, 1000) })}
          placeholder="Bijv. kan deze kast 10 cm smaller?"
          className="w-full box-border rounded-[10px] px-3 py-2.5 text-sm leading-normal resize-y bg-white"
          style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}
        />
      </div>

      <div className="flex justify-between gap-2.5 flex-wrap">
        <button type="button" onClick={onVorige} className="min-h-11 px-4 rounded-[10px] text-sm font-semibold cursor-pointer bg-white" style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}>
          ← Vorige kast
        </button>
        <button type="button" onClick={onVolgende} className="min-h-11 px-[18px] rounded-[10px] text-sm font-semibold cursor-pointer text-white border-0" style={{ background: C.groen }}>
          Volgende kast →
        </button>
      </div>
    </Kaart>
  )
}

export default function TabKast({
  pakket, keuzes, selId, setSelId, setKast, volgende, wijzig,
}: {
  pakket: Pakket
  keuzes: Keuzes
  selId: string | null
  setSelId: (id: string) => void
  setKast: (id: string, patch: Partial<KastKeuze>) => void
  volgende: (id: string) => void
  wijzig: (f: (k: Keuzes) => Keuzes) => void
}) {
  const kasten = pakket.kasten
  if (!kasten.length) {
    return <p className="text-sm" style={{ color: C.muted }}>Er staan nog geen kasten klaar.</p>
  }
  const idx = Math.max(0, kasten.findIndex((k) => k.id === selId))
  const sel = kasten[idx]
  const wanden = [...new Set(kasten.map((k) => k.wand).filter((w): w is string => !!w))]

  const wandAkkoord = (w: string) =>
    wijzig((k) => {
      const nieuw = { ...k.kasten }
      for (const x of kasten.filter((x) => x.wand === w)) {
        if (!kastStatus(x, k)) nieuw[x.id] = { ...nieuw[x.id], status: 'akkoord' }
      }
      return { ...k, kasten: nieuw }
    })

  const kies = (id: string) => {
    setSelId(id)
    if (typeof window !== 'undefined' && window.innerWidth < 1100) {
      document.getElementById('kast-paneel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="flex flex-wrap gap-7 items-start">
      <Kaart className="p-5 pb-4 min-w-0" style={{ flex: '1 1 560px' }}>
        <div className="flex justify-between items-baseline flex-wrap gap-2 mb-3">
          <h2 className="m-0 text-lg font-bold">Plattegrond</h2>
          <span className="text-[13px]" style={{ color: C.muted }}>Tik op een kast om hem te bekijken</span>
        </div>
        <Plattegrond pakket={pakket} keuzes={keuzes} selId={sel.id} setSelId={kies} />
        <div className="flex flex-wrap gap-4 mt-3.5 text-[13px]" style={{ color: C.tekst }}>
          {([['nog bekijken', NEUTRAAL], ['akkoord', STATUS_KLEUR.akkoord], ['wijzigen', STATUS_KLEUR.wijzig], ['vraag', STATUS_KLEUR.vraag]] as const).map(([label, c]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-4 h-4 rounded-full" style={{ background: c.bg, border: `1.5px solid ${c.border}` }} />
              {label}
            </span>
          ))}
        </div>
        {wanden.length > 0 && (
          <div className="mt-[18px] pt-3.5 flex flex-col gap-2" style={{ borderTop: '1px solid #E9E5DD' }}>
            <div className="text-[13px] font-semibold" style={{ color: C.muted }}>Snel per wand</div>
            <div className="flex flex-wrap gap-2">
              {wanden.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => wandAkkoord(w)}
                  className="min-h-11 px-3.5 rounded-full text-sm font-medium cursor-pointer bg-white"
                  style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}
                >
                  {w} akkoord
                </button>
              ))}
            </div>
          </div>
        )}
      </Kaart>

      <section id="kast-paneel" aria-label="Gekozen kast" className="min-w-0 w-full scroll-mt-4" style={{ flex: '1 1 420px', maxWidth: 560 }}>
        <KastPaneel
          key={sel.id}
          k={sel}
          keuzes={keuzes}
          setKast={setKast}
          onVorige={() => setSelId(kasten[(idx - 1 + kasten.length) % kasten.length].id)}
          onVolgende={() => { volgende(sel.id); setSelId(kasten[(idx + 1) % kasten.length].id) }}
        />
      </section>
    </div>
  )
}
