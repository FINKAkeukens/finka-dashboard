'use client'

import { useState, type ReactNode } from 'react'
import type { GreepKeuze, Keuzes, Pakket, PakketGreep } from '@/lib/keuzemodule/types'
import { C, STATUS_KLEUR, Chip, Kaart, KeuzeKaart, Staal, Tag, Vinkje, delta, euro } from './ui'

type Rij = 'front' | 'corpus' | 'greep' | 'lades' | 'plint' | 'wangen'

const GREEP_SOORTEN: [GreepKeuze['kind'] | PakketGreep['soort'], string][] = [
  ['greep', 'Grepen'],
  ['lang', 'Lange grepen'],
  ['knop', 'Knoppen'],
  ['lijst', 'Greeplijst, greeploos'],
  ['push', 'Push-to-open'],
]

const GREEP_KLEUREN: ['alles' | PakketGreep['kleur'], string][] = [
  ['alles', 'Alle'], ['zwart', 'Zwart'], ['rvs', 'RVS en zilver'], ['brons', 'Brons en goud'], ['hout', 'Hout'], ['wit', 'Wit en overig'],
]

const TOON = 12

function RijKaart({
  label, waarde, sub, staal, keuze, onKeuze, kiesLabel, open, onOpen, children,
}: {
  label: string
  waarde: string
  sub?: string | null
  staal?: ReactNode
  keuze: 'akkoord' | 'bespreken' | undefined
  onKeuze: (k: 'akkoord' | 'bespreken') => void
  kiesLabel?: string
  open?: boolean
  onOpen?: () => void
  children?: ReactNode
}) {
  return (
    <Kaart className="px-5 py-4 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5 min-w-0">
          {staal}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="kv-label" style={{ color: C.muted }}>{label}</div>
            <div className="kv-kop text-[24px]">{waarde}</div>
            {sub && <div className="text-[13px]" style={{ color: C.zacht }}>{sub}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {kiesLabel && onOpen && (
            <button
              type="button"
              onClick={onOpen}
              aria-expanded={!!open}
              className="min-h-11 px-4 rounded-[2px] kv-knop cursor-pointer"
              style={{ background: open ? C.groen : '#FFFFFF', color: open ? '#FFFFFF' : C.groenDonker, border: `1px solid ${C.groen}` }}
            >
              {open ? 'Sluiten' : kiesLabel}
            </button>
          )}
          {(['akkoord', 'bespreken'] as const).map((k) => {
            const c = k === 'akkoord' ? STATUS_KLEUR.akkoord : STATUS_KLEUR.vraag
            const aan = keuze === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => onKeuze(k)}
                aria-pressed={aan}
                className="min-h-11 px-4 rounded-[2px] kv-knop cursor-pointer"
                style={{ background: aan ? c.bg : '#FFFFFF', color: aan ? c.ink : C.ink, border: aan ? `2px solid ${c.border}` : `1px solid ${C.lijnInput}` }}
              >
                {k === 'akkoord' ? 'Akkoord' : 'Bespreken'}
              </button>
            )
          })}
        </div>
      </div>
      {open && <div className="pt-3.5 flex flex-col gap-3" style={{ borderTop: '1px solid #EFECE6' }}>{children}</div>}
    </Kaart>
  )
}

export default function TabKeuken({ pakket, keuzes, wijzig }: { pakket: Pakket; keuzes: Keuzes; wijzig: (f: (k: Keuzes) => Keuzes) => void }) {
  const [open, setOpen] = useState<Rij | null>(null)
  const [cFilter, setCFilter] = useState<'alles' | 'hout' | 'effen'>('alles')
  const [gSoort, setGSoort] = useState<(typeof GREEP_SOORTEN)[number][0]>('greep')
  const [gKleur, setGKleur] = useState<(typeof GREEP_KLEUREN)[number][0]>('alles')
  const [gAlles, setGAlles] = useState(false)

  const kk = pakket.keuken
  const keuken = keuzes.keuken ?? {}
  const rijKeuze = (r: Rij) => keuken.rijen?.[r]
  const zetRij = (r: Rij, v: 'akkoord' | 'bespreken') =>
    wijzig((k) => ({ ...k, keuken: { ...k.keuken, rijen: { ...k.keuken?.rijen, [r]: v } } }))

  // Binnenkleur
  const corpusCode = keuken.corpus ?? kk.corpus.voorstel
  const corpus = kk.corpus.opties.find((o) => o.code === corpusCode)
  const corpusVoorstel = kk.corpus.opties.find((o) => o.code === kk.corpus.voorstel)
  const corpusOpties = kk.corpus.opties.filter((o) => cFilter === 'alles' || (cFilter === 'hout' ? o.hout : !o.hout))

  // Grepen
  const greep: GreepKeuze = keuken.greep ?? { kind: 'greep', code: kk.greep.voorstel ?? undefined }
  const gekozenGreep = greep.kind === 'greep' ? kk.greep.opties.find((g) => g.code === greep.code) : null
  let greepWaarde = '—'
  let greepSub = ''
  if (greep.kind === 'greep' && gekozenGreep) {
    greepWaarde = `${gekozenGreep.soort === 'knop' ? 'Knop' : 'Greep'} ${gekozenGreep.code}, ${gekozenGreep.naam}`
    greepSub = `${gekozenGreep.lengte ? (gekozenGreep.soort === 'knop' ? 'Doorsnede ' : 'Lengte ') + gekozenGreep.lengte + ' mm · ' : ''}${!pakket.prijzen ? '' : gekozenGreep.prijs ? delta(gekozenGreep.prijs) + ` voor ${kk.greep.aantal} grepen` : 'inbegrepen'}`.replace(/ · $/, '')
  } else if (greep.kind === 'lijst') {
    greepWaarde = 'Greeplijst (greeploos)'
    greepSub = 'Verzonken lijst in de kast; we passen het ontwerp aan'
  } else if (greep.kind === 'push') {
    greepWaarde = 'Push-to-open, zonder grepen'
    greepSub = 'Even drukken en de lade of deur gaat open'
  }
  const zetGreep = (g: GreepKeuze) => wijzig((k) => ({ ...k, keuken: { ...k.keuken, greep: g } }))
  let greepLijst = kk.greep.opties.filter((g) => g.soort === gSoort && (gKleur === 'alles' || g.kleur === gKleur))
  greepLijst = [...greepLijst.filter((g) => g.code === kk.greep.voorstel), ...greepLijst.filter((g) => g.code !== kk.greep.voorstel)]
  const greepTotaal = greepLijst.length
  if (!gAlles) greepLijst = greepLijst.slice(0, TOON)
  const telSoort = (s: string) => kk.greep.opties.filter((g) => g.soort === s).length

  const vlakStaal = (kleur: string) => (
    <span aria-hidden="true" className="flex-none w-11 h-11 rounded-[2px]" style={{ background: kleur, border: '1px solid rgba(0,0,0,0.12)' }} />
  )

  return (
    <section aria-label="Hele keuken" className="max-w-[920px] flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="kv-kop m-0 text-[30px] sm:text-[36px]">Keuzes voor de hele keuken</h2>
        <p className="m-0 text-[15px] leading-normal" style={{ color: C.tekst }}>
          Deze keuzes gelden voor alle kasten. Bij kleur binnenkant en grepen kun je alle mogelijkheden bekijken.
          Twijfel je? Kies &quot;Bespreken&quot;; dan nemen we het mee in het gesprek.
        </p>
      </div>

      <RijKaart label="Model en front" waarde={kk.front ?? '—'} sub={kk.frontkleur} keuze={rijKeuze('front')} onKeuze={(v) => zetRij('front', v)} staal={vlakStaal('#B8A48A')} />

      <RijKaart
        label="Kleur binnenkant kasten"
        waarde={corpus ? `${corpus.naam} (${corpus.code})` : '—'}
        sub={keuken.corpus && keuken.corpus !== kk.corpus.voorstel
          ? `Jouw keuze · ons voorstel was ${corpusVoorstel?.naam ?? kk.corpus.voorstel}`
          : `Ons voorstel · kies uit ${kk.corpus.opties.length} kleuren`}
        staal={<Staal src={corpus?.img ?? null} className="flex-none w-[54px] h-[35px] rounded-[2px]" style={{ border: '1px solid rgba(0,0,0,0.12)' }} />}
        keuze={rijKeuze('corpus')}
        onKeuze={(v) => zetRij('corpus', v)}
        kiesLabel="Andere kleur kiezen"
        open={open === 'corpus'}
        onOpen={() => setOpen(open === 'corpus' ? null : 'corpus')}
      >
        <div role="group" aria-label="Soort kleur" className="flex flex-wrap gap-1.5">
          <Chip aan={cFilter === 'alles'} onClick={() => setCFilter('alles')}>Alle kleuren ({kk.corpus.opties.length})</Chip>
          <Chip aan={cFilter === 'hout'} onClick={() => setCFilter('hout')}>Houtdecor ({kk.corpus.opties.filter((o) => o.hout).length})</Chip>
          <Chip aan={cFilter === 'effen'} onClick={() => setCFilter('effen')}>Effen kleur ({kk.corpus.opties.filter((o) => !o.hout).length})</Chip>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
          {corpusOpties.map((o) => {
            const aan = corpusCode === o.code
            const voorstel = o.code === kk.corpus.voorstel
            return (
              <KeuzeKaart key={o.code} aan={aan} onClick={() => wijzig((k) => ({ ...k, keuken: { ...k.keuken, corpus: o.code } }))}>
                <Staal src={o.img} className="w-full aspect-[120/78]" />
                <span className="text-[13px] font-semibold leading-tight">{o.naam}</span>
                <Tag soort={voorstel ? 'voorstel' : aan ? 'gekozen' : 'code'}>{voorstel ? 'ons voorstel' : aan ? 'gekozen' : o.code}</Tag>
              </KeuzeKaart>
            )
          })}
        </div>
      </RijKaart>

      <RijKaart
        label="Grepen"
        waarde={greepWaarde}
        sub={greepSub}
        staal={gekozenGreep
          ? <Staal src={gekozenGreep.img} className="flex-none w-[70px] h-6 bg-white" style={{ border: `1px solid ${C.lijn}`, objectFit: 'contain' }} />
          : vlakStaal('#FFFFFF')}
        keuze={rijKeuze('greep')}
        onKeuze={(v) => zetRij('greep', v)}
        kiesLabel="Alle grepen bekijken"
        open={open === 'greep'}
        onOpen={() => setOpen(open === 'greep' ? null : 'greep')}
      >
        <div role="group" aria-label="Manier van openen" className="flex flex-wrap gap-1.5">
          {GREEP_SOORTEN.map(([s, label]) => (
            <Chip key={s} aan={gSoort === s} onClick={() => { setGSoort(s); setGAlles(false); setGKleur('alles') }}>
              {label}{s === 'greep' || s === 'lang' || s === 'knop' ? ` (${telSoort(s)})` : ''}
            </Chip>
          ))}
        </div>
        {(gSoort === 'greep' || gSoort === 'lang' || gSoort === 'knop') && (
          <>
            <div role="group" aria-label="Kleur greep" className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[13px] mr-1" style={{ color: C.muted }}>Kleur:</span>
              {GREEP_KLEUREN.map(([k, label]) => (
                <Chip key={k} aan={gKleur === k} onClick={() => { setGKleur(k); setGAlles(false) }}>{label}</Chip>
              ))}
            </div>
            {gSoort === 'lang' && (
              <div className="text-[13px] leading-normal rounded-[2px] px-3 py-2.5" style={{ color: C.tekst, background: C.vlak }}>
                Lange grepen komen op brede lades en deuren. Op smalle fronten komt automatisch dezelfde greep in een kortere maat.
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
              {greepLijst.map((g) => {
                const aan = greep.kind === 'greep' && greep.code === g.code
                const voorstel = g.code === kk.greep.voorstel
                return (
                  <KeuzeKaart key={g.code} aan={aan} onClick={() => zetGreep({ kind: 'greep', code: g.code })}>
                    <Staal src={g.img} className="w-full h-12 bg-white" style={{ objectFit: 'contain' }} />
                    <span className="text-[13px] font-semibold leading-tight">{g.naam}</span>
                    <span className="text-xs" style={{ color: C.zacht }}>
                      {g.code}{g.lengte ? ` · ${g.lengte} mm` : ''}{pakket.prijzen ? ` · ${g.prijs ? `${delta(g.prijs)} voor ${kk.greep.aantal} grepen` : 'inbegrepen'}` : ''}
                    </span>
                    {(voorstel || aan) && <Tag soort={voorstel ? 'voorstel' : 'gekozen'}>{voorstel ? 'ons voorstel' : 'gekozen'}</Tag>}
                  </KeuzeKaart>
                )
              })}
            </div>
            {!gAlles && greepTotaal > TOON && (
              <button type="button" onClick={() => setGAlles(true)} className="self-start min-h-11 px-4 rounded-[2px] kv-knop cursor-pointer bg-white" style={{ border: `1px solid ${C.groen}`, color: C.groenDonker }}>
                Toon alle {greepTotaal}
              </button>
            )}
          </>
        )}
        {gSoort === 'lijst' && (
          <>
            <div className="text-[13px] leading-normal rounded-[2px] px-3 py-2.5" style={{ color: C.tekst, background: C.vlak }}>
              Een greeplijst is een verzonken profiel in plaats van grepen. Dat verandert de opbouw van de kasten, dus we
              passen het ontwerp hierop aan. De kleur van de lijst en eventuele verlichting bespreken we samen.
            </div>
            <KeuzeKaart aan={greep.kind === 'lijst'} onClick={() => zetGreep({ kind: 'lijst' })} className="max-w-sm">
              <span className="text-[13px] font-semibold">Greeploos met greeplijst</span>
              {(greep.kind === 'lijst' || pakket.prijzen) && <Tag soort={greep.kind === 'lijst' ? 'gekozen' : 'code'}>{greep.kind === 'lijst' ? 'gekozen' : 'prijs volgt'}</Tag>}
            </KeuzeKaart>
          </>
        )}
        {gSoort === 'push' && (
          <>
            <div className="text-[13px] leading-normal rounded-[2px] px-3 py-2.5" style={{ color: C.tekst, background: C.vlak }}>
              Geen grepen in zicht. Let op: niet mogelijk op binnenlades en op de koelkastdeur; daar zoeken we samen een oplossing voor.
            </div>
            <KeuzeKaart aan={greep.kind === 'push'} onClick={() => zetGreep({ kind: 'push' })} className="max-w-sm">
              <span className="text-[13px] font-semibold">Push-to-open op alle lades en deuren</span>
              {(greep.kind === 'push' || pakket.prijzen) && <Tag soort={greep.kind === 'push' ? 'gekozen' : 'code'}>{greep.kind === 'push' ? 'gekozen' : 'prijs volgt'}</Tag>}
            </KeuzeKaart>
          </>
        )}
      </RijKaart>

      {kk.lades && <RijKaart label="Lades" waarde={kk.lades} sub="Zacht sluitend" keuze={rijKeuze('lades')} onKeuze={(v) => zetRij('lades', v)} staal={vlakStaal('#4A4A4C')} />}
      {kk.plint && <RijKaart label="Plint" waarde={kk.plint} keuze={rijKeuze('plint')} onKeuze={(v) => zetRij('plint', v)} staal={vlakStaal('#B8A48A')} />}
      {kk.wangen && <RijKaart label="Zijpanelen" waarde={kk.wangen} keuze={rijKeuze('wangen')} onKeuze={(v) => zetRij('wangen', v)} staal={vlakStaal('#8C6E4E')} />}

      {pakket.wand.length > 0 && (
        <Kaart className="px-5 py-[18px] flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="kv-kop m-0 text-[22px]">Extra&apos;s aan de wand en verlichting</h3>
            <div className="text-[13px]" style={{ color: C.muted }}>Niet aan één kast gebonden. Waar het precies komt, bespreken we samen.</div>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {pakket.wand.map((e) => {
              const aan = !!keuzes.wand?.[e.key]
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => wijzig((k) => ({ ...k, wand: { ...k.wand, [e.key]: !aan } }))}
                  aria-pressed={aan}
                  className="flex items-center gap-3 px-3.5 py-2.5 min-h-14 rounded-[2px] cursor-pointer text-left"
                  style={{ background: aan ? C.groenLicht : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : `1px solid ${C.lijnInput}`, color: C.ink }}
                >
                  <Vinkje aan={aan} />
                  <span className="flex flex-col gap-0.5 flex-auto">
                    <span className="text-sm font-semibold">{e.label}</span>
                    <span className="text-[13px]" style={{ color: C.muted }}>{e.sub}</span>
                  </span>
                  {pakket.prijzen && (
                    <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: C.tekst }}>
                      {e.prijs === null ? 'prijs volgt' : '+' + euro(e.prijs)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Kaart>
      )}
    </section>
  )
}
