'use client'

import type { Keuzes, KastKeuze, Pakket, PakketKast } from '@/lib/keuzemodule/types'
import { kastStatus } from '@/lib/keuzemodule/wijzigingen'
import { STATUS_KEUZES, STATUS_LABELS } from '@/lib/keuzemodule/klantlaag'
import PlattegrondTekening from '@/components/keuzemodule/PlattegrondTekening'
import KastExtras from './KastExtras'
import { C, STATUS_KLEUR, Kaart, delta } from './ui'

const NEUTRAAL = { bg: '#FFFFFF', border: '#8A8780', ink: C.ink }

function Plattegrond({
  pakket, keuzes, selId, setSelId,
}: {
  pakket: Pakket
  keuzes: Keuzes
  selId: string | null
  setSelId: (id: string) => void
}) {
  const kleurVan = (k: PakketKast) => {
    const st = kastStatus(k, keuzes)
    return st ? STATUS_KLEUR[st] : NEUTRAAL
  }
  const label = (k: PakketKast) => {
    const st = kastStatus(k, keuzes)
    return `Kast ${k.positie}, ${k.naam}${st ? ', ' + STATUS_LABELS[st] : ', nog niet bekeken'}`
  }
  const opTekening = pakket.plattegrond ? pakket.kasten.filter((k) => k.vak) : []
  // Kasten die niet op de tekening staan (of geen tekening): als knoppen,
  // gegroepeerd per wand.
  const los = pakket.kasten.filter((k) => !opTekening.includes(k))
  const wanden = [...new Set(los.map((k) => k.wand ?? ''))]
  const perId = new Map(pakket.kasten.map((k) => [k.id, k]))

  return (
    <div className="flex flex-col gap-4">
      {pakket.plattegrond && opTekening.length > 0 && (
        <PlattegrondTekening
          plattegrond={pakket.plattegrond}
          kasten={opTekening.map((k) => ({ id: k.id, positie: k.positie, vak: k.vak!, label: label(k) }))}
          kleur={(t) => kleurVan(perId.get(t.id)!)}
          selId={selId}
          onKies={setSelId}
        />
      )}
      {wanden.map((w) => (
        <div key={w} className="flex flex-col gap-2">
          {(w || opTekening.length > 0) && (
            <div className="kv-label" style={{ color: C.muted }}>{w || 'Overige kasten'}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {los.filter((k) => (k.wand ?? '') === w).map((k) => {
              const c = kleurVan(k)
              const sel = k.id === selId
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setSelId(k.id)}
                  aria-label={label(k)}
                  aria-pressed={sel}
                  className="min-h-11 px-3 rounded-[2px] kv-knop cursor-pointer"
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

function KastPaneel({
  k, keuzes, setKast, onVorige, onVolgende, prijzen,
}: {
  k: PakketKast
  keuzes: Keuzes
  prijzen: boolean
  setKast: (id: string, patch: Partial<KastKeuze>) => void
  onVorige: () => void
  onVolgende: () => void
}) {
  const st = keuzes.kasten?.[k.id] ?? {}
  const huidig = kastStatus(k, keuzes)
  const voorstel = k.indelingen.find((i) => i.voorstel)
  const gekozenIndeling = st.indeling ?? voorstel?.key

  return (
    <Kaart className="p-6 flex flex-col gap-[22px]">
      <div className="flex gap-4 items-start">
        <div className="flex flex-col gap-1.5 flex-auto min-w-0">
          <div className="kv-label" style={{ color: C.muted }}>
            Kast {k.positie}{k.wand ? ` · ${k.wand}` : ''}
          </div>
          <h2 className="kv-kop m-0 text-[30px]">{k.naam}</h2>
          {k.omschrijving && <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>{k.omschrijving}</p>}
          <div className="text-xs" style={{ color: C.zacht }}>Code in ontwerp: {k.code}</div>
          {k.toelichting && (
            <div className="mt-1 text-sm leading-normal rounded-[2px] px-3 py-2 whitespace-pre-line" style={{ background: C.groenLicht, color: C.ink }}>
              <span className="font-semibold">Van FINKA: </span>{k.toelichting}
            </div>
          )}
        </div>
        {k.afbeelding && (
          // eslint-disable-next-line @next/next/no-img-element -- kortlevende signed URL
          <img src={k.afbeelding} alt={`Tekening van kast ${k.positie}`} className="flex-none w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-[2px] bg-white" style={{ border: `1px solid ${C.lijnInput}` }} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="kv-label" style={{ color: C.muted }}>Wat vind je van deze kast?</div>
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
                className="min-h-12 px-2 py-1.5 rounded-[2px] kv-knop leading-tight cursor-pointer"
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
            <div className="kv-label" style={{ color: C.muted }}>Indeling</div>
            {prijzen && <div className="text-xs" style={{ color: C.zacht }}>prijsverschil t.o.v. ons voorstel</div>}
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
                  className="flex items-center gap-3 p-2.5 min-h-[76px] rounded-[2px] cursor-pointer text-left"
                  style={{ background: aan ? C.groenLicht : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : `1px solid ${C.lijnInput}`, color: C.ink }}
                >
                  <span aria-hidden="true" className="relative block w-16 h-14 flex-none rounded-[2px]" style={{ border: '1.5px solid #8A8780', background: '#FBFAF7' }}>
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
                    {(o.voorstel || prijzen) && (
                      <span className="text-[13px] font-semibold" style={{ color: o.voorstel ? C.accent : C.tekst }}>
                        {o.voorstel ? 'ons voorstel' : delta(o.prijs)}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {k.soort === 'apparaat' ? (
        <div className="text-sm leading-normal rounded-[2px] px-3.5 py-3" style={{ color: C.tekst, background: C.vlak }}>
          De indeling van deze kast hangt af van het apparaat. Wil je hier iets anders? Kies &quot;Ik heb een vraag&quot; en
          beschrijf het, of kijk bij Apparatuur.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="kv-label" style={{ color: C.muted }}>Openen</div>
          {[
            { push: false, label: 'Zoals de hele keuken', sub: 'Met dezelfde greep als de andere kasten', prijs: 'ons voorstel' },
            { push: true, label: 'Push-to-open, zonder greep', sub: 'Even drukken en de lade of deur gaat open', prijs: prijzen ? 'prijs volgt' : '' },
          ].map((o) => {
            const aan = !!st.push === o.push
            return (
              <button
                key={String(o.push)}
                type="button"
                onClick={() => setKast(k.id, { push: o.push })}
                aria-pressed={aan}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-14 rounded-[2px] cursor-pointer text-left"
                style={{ background: aan ? C.groenLicht : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : `1px solid ${C.lijnInput}`, color: C.ink }}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{o.label}</span>
                  <span className="text-[13px]" style={{ color: C.muted }}>{o.sub}</span>
                </span>
                <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: o.push ? C.muted : C.accent }}>{o.prijs}</span>
              </button>
            )
          })}
        </div>
      )}

      <KastExtras k={k} st={st} setKast={setKast} prijzen={prijzen} />

      <div className="flex flex-col gap-2">
        <label htmlFor="kast-notitie" className="kv-label" style={{ color: C.muted }}>Opmerking of vraag over deze kast</label>
        <textarea
          id="kast-notitie"
          rows={3}
          value={st.note ?? ''}
          onChange={(e) => setKast(k.id, { note: e.target.value.slice(0, 1000) })}
          placeholder="Bijv. kan deze kast 10 cm smaller?"
          className="w-full box-border rounded-[2px] px-3 py-2.5 text-sm leading-normal resize-y bg-white"
          style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}
        />
      </div>

      <div className="flex justify-between gap-2.5 flex-wrap">
        <button type="button" onClick={onVorige} className="min-h-11 px-4 rounded-[2px] kv-knop cursor-pointer bg-white" style={{ border: `1px solid ${C.lijnInput}`, color: C.ink }}>
          ← Vorige kast
        </button>
        <button type="button" onClick={onVolgende} className="min-h-11 px-[18px] rounded-[2px] kv-knop cursor-pointer text-white border-0" style={{ background: C.groen }}>
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

  const getekend = !!pakket.plattegrond && pakket.kasten.some((k) => k.vak)

  return (
    <div className="flex flex-wrap gap-7 items-start">
      <Kaart className="p-5 pb-4 min-w-0" style={{ flex: '1 1 560px' }}>
        <div className="flex justify-between items-baseline flex-wrap gap-2 mb-3">
          <h2 className="kv-kop m-0 text-[24px]">Plattegrond</h2>
          <span className="text-[13px]" style={{ color: C.muted }}>Tik op een kast om hem te bekijken</span>
        </div>
        <Plattegrond pakket={pakket} keuzes={keuzes} selId={sel.id} setSelId={kies} />
        <div className="flex flex-wrap gap-4 mt-3.5 text-[13px]" style={{ color: C.tekst }}>
          {([['nog bekijken', NEUTRAAL], ['akkoord', STATUS_KLEUR.akkoord], ['wijzigen', STATUS_KLEUR.wijzig], ['vraag', STATUS_KLEUR.vraag]] as const).map(([label, c]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-4 h-4 rounded-[2px]" style={{ background: c.bg, border: `1.5px solid ${c.border}` }} />
              {label}
            </span>
          ))}
          {getekend && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-4 h-[3px]" style={{ background: C.ink }} />
              voorkant van de kast
            </span>
          )}
          {getekend && pakket.kasten.some((k) => k.vak?.wand) && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-4 h-4 rounded-[2px]" style={{ border: '1.5px dashed #8A8780' }} />
              bovenkast
            </span>
          )}
        </div>
        {wanden.length > 0 && (
          <div className="mt-[18px] pt-3.5 flex flex-col gap-2" style={{ borderTop: '1px solid #E9E5DD' }}>
            <div className="kv-label" style={{ color: C.muted }}>Snel per wand</div>
            <div className="flex flex-wrap gap-2">
              {wanden.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => wandAkkoord(w)}
                  className="min-h-11 px-3.5 rounded-[2px] kv-knop cursor-pointer bg-white"
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
          prijzen={pakket.prijzen}
          onVorige={() => setSelId(kasten[(idx - 1 + kasten.length) % kasten.length].id)}
          onVolgende={() => { volgende(sel.id); setSelId(kasten[(idx + 1) % kasten.length].id) }}
        />
      </section>
    </div>
  )
}
