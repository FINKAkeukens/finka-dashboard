'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Eye, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import type { KeuzemoduleInstelling, KeuzemoduleKast } from '@/lib/keuzemodule/pakket'
import type { Wijziging } from '@/lib/keuzemodule/types'
import { KAST_SOORT_LABELS, WERKBLAD_MATERIAAL, extrasVoor, werkbladMateriaalUit, type KastSoort, type WerkbladMateriaal } from '@/lib/keuzemodule/klantlaag'
import PlattegrondTekening from '@/components/keuzemodule/PlattegrondTekening'
import Wijzigingsrapport from './Wijzigingsrapport'
import { fileHref } from '@/lib/storage-url'
import { TYPE_LABELS, getSpecSummary } from '@/lib/appliance-utils'
import type { Appliance } from '@/lib/types'

export interface UitdraaiBron {
  url: string
  naam: string
}

export interface FeedbackRonde {
  ronde: number
  status: 'concept' | 'ingestuurd'
  ingestuurd_at: string | null
  updated_at: string
  wijzigingen: Wijziging[]
}

const veld = 'w-full rounded-lg border border-[#DDD8D2] bg-white px-2.5 py-1.5 text-sm text-[#1C1B19]'

// Suggesties voor het apparaat per kast; vrij invullen mag ook.
const APPARATEN = ['Koelkast', 'Vriezer', 'Koel-vriescombinatie', 'Oven', 'Combimagnetron', 'Stoomoven', 'Oven en combimagnetron', 'Vaatwasser', 'Kookplaat', 'Afzuigkap', 'Koffiemachine', 'Warmhoudlade', 'Wijnklimaatkast']

function euro(n: number) {
  return (n < 0 ? '−' : '+') + '€' + Math.abs(Math.round(n)).toLocaleString('nl-NL')
}

export default function KeuzemoduleBeheer({
  projectId, customerId, actief, instelling, kasten, bronnen, catalogusTitel, modellen, rondes,
}: {
  projectId: string
  customerId: string
  actief: boolean
  instelling: KeuzemoduleInstelling | null
  kasten: KeuzemoduleKast[]
  bronnen: UitdraaiBron[]
  catalogusTitel: string | null
  modellen: Record<string, number | null>
  rondes: FeedbackRonde[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [fout, setFout] = useState('')
  const [bezig, setBezig] = useState('')
  // Bron = url van een bijlage bij de Kasten-opties, of een gekozen bestand.
  // Tekening '' = het bovenaanzicht in de artikel-PDF zelf proberen.
  const [bron, setBron] = useState<string | File>(bronnen[0]?.url ?? '')
  const [tekenBron, setTekenBron] = useState<string | File>('')
  const [melding, setMelding] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [voorstel, setVoorstel] = useState(instelling?.voorstel ?? {})
  const [pg, setPg] = useState<number | null>(instelling?.prijsgroep ?? null)
  const [lokaleKasten, setLokaleKasten] = useState(kasten)
  const [prijzenTonen, setPrijzenTonen] = useState(instelling?.prijzen_tonen ?? true)

  const laatste = rondes[0]
  const huidigeRonde = instelling?.ronde ?? 1

  async function zetActief(aan: boolean) {
    setFout('')
    const { error } = await supabase.from('finka_projects').update({ keuzemodule_actief: aan }).eq('id', projectId)
    if (error) setFout(error.message)
    else router.refresh()
  }

  const naamVan = (b: string | File) => (typeof b === 'string' ? bronnen.find((x) => x.url === b)?.naam ?? 'uitdraai' : b.name)

  async function inlezen() {
    if (!bron) return
    setFout('')
    setMelding('')
    setBezig('Uitdraai lezen…')
    try {
      const { leesUitdraai } = await import('@/lib/keuzemodule/winnerflex-browser')
      const { uitdraai, tekening, plaatjes } = await leesUitdraai(bron, tekenBron || null)
      if (!uitdraai.kasten.length) throw new Error('Geen kasten gevonden in deze uitdraai. Is het een Winner Flex-offerte of -order?')

      // Kastafbeeldingen (alleen uit een elementenlijst) naar de afgeschermde
      // bucket; elke keer een nieuwe naam, zodat er niets overschreven wordt.
      const afbeeldingen: Record<string, string> = {}
      const teUploaden = Object.entries(plaatjes)
      if (teUploaden.length) setBezig('Kastafbeeldingen opslaan…')
      const stempel = new Date().getTime()
      for (const [pos, blob] of teUploaden) {
        const pad = `${projectId}/keuzemodule/${stempel}-${pos.replace(/[^\w.-]/g, '_')}.webp`
        const { error } = await supabase.storage.from('project-documenten').upload(pad, blob, { contentType: 'image/webp' })
        if (error) throw new Error(`Afbeelding kast ${pos} opslaan mislukt: ${error.message}`)
        afbeeldingen[pos] = supabase.storage.from('project-documenten').getPublicUrl(pad).data.publicUrl
      }

      setBezig('Kasten opslaan…')
      const v = uitdraai.voorstel
      const nieuwVoorstel = {
        ...instelling?.voorstel,
        front: v.front, frontkleur: v.frontkleur, corpus: v.corpus, greep: v.greep,
        greep_aantal: v.greep_aantal, lades: v.lades, plint: v.plint,
      }
      const prijsgroep = (v.model && modellen[v.model]) || instelling?.prijsgroep || null
      const { error: insError } = await supabase.from('finka_keuzemodule').upsert({
        project_id: projectId,
        bron_url: typeof bron === 'string' ? bron : null,
        bron_naam: tekenBron ? `${naamVan(bron)} + ${naamVan(tekenBron)}` : naamVan(bron),
        model: v.model,
        prijsgroep,
        voorstel: nieuwVoorstel,
        // Geen tekening gevonden: de vorige plattegrond blijft staan.
        plattegrond: tekening?.plattegrond ?? instelling?.plattegrond ?? null,
        ronde: huidigeRonde,
        updated_at: new Date().toISOString(),
      })
      if (insError) throw new Error(insError.message)

      // Kasten per positie bijwerken i.p.v. vervangen: wand en gemaakte
      // aanpassingen blijven staan, en ingestuurde feedback blijft aan
      // dezelfde kast hangen.
      const bestaand = new Map(kasten.map((k) => [k.positie, k]))
      const rows = uitdraai.kasten.map((k, i) => {
        const oud = bestaand.get(k.positie)
        return {
          ...(oud ? { id: oud.id } : {}),
          project_id: projectId,
          positie: k.positie,
          code: k.code,
          omschrijving: oud?.code === k.code && oud.omschrijving ? oud.omschrijving : k.omschrijving,
          soort: k.soort,
          breedte: k.breedte,
          wand: oud?.wand ?? null,
          vak: tekening ? tekening.vakken[k.positie] ?? null : oud?.vak ?? null,
          inbegrepen: k.inbegrepen,
          data: { ...oud?.data, naam: oud?.code === k.code && oud.data?.naam ? oud.data.naam : k.naam, apparaat: k.apparaat ?? undefined, uitvoering: k.uitvoering ?? undefined, afbeelding: afbeeldingen[k.positie] ?? (oud?.code === k.code ? oud.data?.afbeelding : undefined) },
          zichtbaar: oud?.zichtbaar ?? true,
          volgorde: i,
        }
      })
      const nieuw = rows.filter((r) => !('id' in r))
      const bij = rows.filter((r) => 'id' in r)
      if (bij.length) {
        const { error } = await supabase.from('finka_keuzemodule_kasten').upsert(bij)
        if (error) throw new Error(error.message)
      }
      if (nieuw.length) {
        const { error } = await supabase.from('finka_keuzemodule_kasten').insert(nieuw)
        if (error) throw new Error(error.message)
      }
      const weg = kasten.filter((k) => !uitdraai.kasten.some((n) => n.positie === k.positie)).map((k) => k.id)
      if (weg.length) {
        const { error } = await supabase.from('finka_keuzemodule_kasten').delete().in('id', weg)
        if (error) throw new Error(error.message)
      }

      const missend = uitdraai.kasten.filter((k) => !tekening?.vakken[k.positie]).map((k) => k.positie)
      setMelding(
        !tekening
          ? `${uitdraai.kasten.length} kasten ingelezen. Geen bovenaanzicht met positienummers gevonden${instelling?.plattegrond ? '; de vorige plattegrond blijft staan' : ''}.`
          : `${uitdraai.kasten.length} kasten ingelezen, ${uitdraai.kasten.length - missend.length} op de plattegrond.` +
              (missend.length ? ` Niet op de tekening: ${missend.join(', ')} (de klant ziet die als knop onder de plattegrond).` : '')
      )
      router.refresh()
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e))
    } finally {
      setBezig('')
    }
  }

  // Accessoireregels (spoelbak, kraan…) uit de nieuwste offerte van dit
  // project, met de omschrijving uit de apparatuurbibliotheek.
  async function accessoiresUitOfferte(): Promise<Accessoire[]> {
    const { data: offerte } = await supabase
      .from('finka_quotes').select('id').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (!offerte) throw new Error('Dit project heeft nog geen offerte.')
    const { data, error } = await supabase
      .from('finka_quote_items')
      .select('id, description, brand, model, appliance:finka_appliances(*)')
      .eq('quote_id', offerte.id)
      .eq('type', 'accessoire')
      .order('sort_order')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => {
      const app = (Array.isArray(r.appliance) ? r.appliance[0] : r.appliance) as Appliance | null
      const naam = [r.brand, r.model].filter(Boolean).join(' ') || (r.description as string)
      return {
        id: r.id as string,
        soort: app ? TYPE_LABELS[app.type] ?? 'Accessoire' : 'Accessoire',
        naam,
        omschrijving: app ? getSpecSummary(app) || null : null,
      }
    })
  }

  async function bewaarVoorstel() {
    setFout('')
    setBezig('Opslaan…')
    const { error } = await supabase
      .from('finka_keuzemodule')
      .update({ voorstel, prijsgroep: pg, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
    setBezig('')
    if (error) setFout(error.message)
    else router.refresh()
  }

  async function bewaarKast(id: string, patch: Partial<KeuzemoduleKast>) {
    setLokaleKasten((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch } : k)))
    const { error } = await supabase.from('finka_keuzemodule_kasten').update(patch).eq('id', id)
    if (error) setFout(error.message)
  }

  async function zetPrijzen(aan: boolean) {
    setFout('')
    setPrijzenTonen(aan)
    const { error } = await supabase.from('finka_keuzemodule').update({ prijzen_tonen: aan }).eq('project_id', projectId)
    if (error) {
      setPrijzenTonen(!aan)
      setFout(error.message)
    }
  }

  async function nieuweRonde() {
    if (!confirm(`Ronde ${huidigeRonde + 1} starten? De klant kan dan opnieuw feedback geven; de feedback van ronde ${huidigeRonde} blijft bewaard.`)) return
    const { error } = await supabase.from('finka_keuzemodule').update({ ronde: huidigeRonde + 1 }).eq('project_id', projectId)
    if (error) setFout(error.message)
    else router.refresh()
  }

  const opTekening = lokaleKasten.filter((k) => k.zichtbaar && k.vak)
  const wanden = [...new Set(lokaleKasten.map((k) => k.wand).filter(Boolean))] as string[]

  return (
    <div className="space-y-6 max-w-5xl">
      {!catalogusTitel && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
          Er is nog geen catalogus ingelezen. Doe dat eerst onder Instellingen → Catalogus; zonder catalogus kan de
          module niet getoond worden.
        </p>
      )}

      <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-[#1C1B19]">Keuzemodule in het klantportaal</h2>
          <p className="text-sm text-[#6B6560] mt-0.5">
            {actief
              ? `Aan: de klant ziet "Jouw ontwerp" in het portaal (ronde ${huidigeRonde}).`
              : 'Uit: de klant ziet niets. Zet aan zodra het ontwerp klaarstaat.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/portaal/voorbeeld?klant=${customerId}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><Eye size={13} className="mr-1.5" />Bekijk als klant</Button>
          </a>
          <Button size="sm" variant={actief ? 'outline' : 'default'} onClick={() => zetActief(!actief)} disabled={!instelling && !actief}>
            {actief ? 'Uitzetten' : 'Aanzetten voor deze klant'}
          </Button>
        </div>
        {instelling && (
          <label className="w-full flex items-start gap-2.5 text-sm border-t border-[#EAE6DD] pt-3">
            <input type="checkbox" className="mt-0.5" checked={prijzenTonen} onChange={(e) => zetPrijzen(e.target.checked)} />
            <span>
              <span className="font-medium text-[#1C1B19]">Meer- en minderprijzen tonen aan de klant</span>
              <span className="block text-xs text-[#6B6560]">
                Uit: de klant ziet nergens bedragen of &quot;prijs volgt&quot;; ze worden ook niet naar de browser van de klant
                gestuurd. In het rapport hieronder zie je ze wel.
              </span>
            </span>
          </label>
        )}
      </section>

      <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-3">
        <h2 className="text-sm font-medium text-[#1C1B19]">Ontwerp inlezen uit Winner Flex</h2>
        <p className="text-sm text-[#6B6560]">
          Kasten, model, binnenkleur en greep komen uit de elementenlijst (daaruit ook de kastafbeeldingen); de
          getekende plattegrond uit het bovenaanzicht met positienummers. Opnieuw inlezen werkt kasten per positie bij; wand en aanpassingen blijven staan.
          {instelling?.bron_naam ? ` Laatst ingelezen: ${instelling.bron_naam}.` : ''}
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <BronKiezer
            label="Elementenlijst met posities (of offerte/order)"
            waarde={bron}
            onChange={setBron}
            bronnen={bronnen}
            leeg={bronnen.length ? null : 'Kies een PDF…'}
            disabled={!!bezig}
          />
          <BronKiezer
            label="Bovenaanzicht met positienummers"
            waarde={tekenBron}
            onChange={setTekenBron}
            bronnen={bronnen}
            leeg="Zit in de artikellijst-PDF"
            disabled={!!bezig}
          />
        </div>
        <Button size="sm" disabled={!!bezig || !bron} onClick={inlezen}>
          <RefreshCw size={13} className="mr-1.5" />Inlezen
        </Button>
        {melding && <p className="text-sm text-[#2F5D50]">{melding}</p>}
        {bezig && <p className="text-sm text-[#6B6560]">{bezig}</p>}
        {fout && <p className="text-sm text-red-600">{fout}</p>}
      </section>

      {instelling && (
        <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-4">
          <h2 className="text-sm font-medium text-[#1C1B19]">Ons voorstel (wat de klant als uitgangspunt ziet)</h2>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-[#6B6560]">Bericht aan de klant (bovenaan de module, optioneel)</span>
            <textarea
              className={`${veld} min-h-[64px]`}
              placeholder="Bijv. Dit is het ontwerp na ons gesprek van 4 november. De bestekbakken zijn in zwart essen, zoals besproken."
              value={voorstel.toelichting ?? ''}
              onChange={(e) => setVoorstel({ ...voorstel, toelichting: e.target.value })}
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Model en front</span>
              <Input value={voorstel.front ?? ''} onChange={(e) => setVoorstel({ ...voorstel, front: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Frontkleur</span>
              <Input value={voorstel.frontkleur ?? ''} onChange={(e) => setVoorstel({ ...voorstel, frontkleur: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Prijsgroep {instelling.model ? `(${instelling.model})` : ''}</span>
              <select className={veld} value={pg ?? ''} onChange={(e) => setPg(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Kies…</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>PG {n}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Binnenkleur (code) en greep (code × aantal)</span>
              <div className="flex gap-2">
                <Input className="w-24" value={voorstel.corpus ?? ''} onChange={(e) => setVoorstel({ ...voorstel, corpus: e.target.value.toUpperCase() })} />
                <Input className="w-24" value={voorstel.greep ?? ''} onChange={(e) => setVoorstel({ ...voorstel, greep: e.target.value.toUpperCase() })} />
                <Input className="w-20" type="number" min={1} value={voorstel.greep_aantal ?? ''} onChange={(e) => setVoorstel({ ...voorstel, greep_aantal: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Lades</span>
              <Input value={voorstel.lades ?? ''} onChange={(e) => setVoorstel({ ...voorstel, lades: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Plint</span>
              <Input value={voorstel.plint ?? ''} onChange={(e) => setVoorstel({ ...voorstel, plint: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Zijpanelen (leeg = niet tonen)</span>
              <Input value={voorstel.wangen ?? ''} onChange={(e) => setVoorstel({ ...voorstel, wangen: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#6B6560]">Werkblad: materiaal en omschrijving</span>
              <div className="flex gap-2">
                <select
                  className={`${veld} w-36 flex-none`}
                  value={voorstel.werkblad?.materiaal ?? ''}
                  onChange={(e) => setVoorstel({ ...voorstel, werkblad: { ...voorstel.werkblad, materiaal: (e.target.value || null) as WerkbladMateriaal | null } })}
                  aria-label="Materiaal werkblad"
                >
                  <option value="">{werkbladMateriaalUit(voorstel.werkblad?.tekst) ? `Automatisch (${werkbladMateriaalUit(voorstel.werkblad?.tekst)})` : 'Materiaal…'}</option>
                  {WERKBLAD_MATERIAAL.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <Input placeholder="Bijv. Composiet Calacatta Bettogli, 20 mm" value={voorstel.werkblad?.tekst ?? ''} onChange={(e) => setVoorstel({ ...voorstel, werkblad: { ...voorstel.werkblad, tekst: e.target.value || null } })} />
              </div>
            </label>
          </div>
          <Accessoires
            lijst={voorstel.accessoires ?? []}
            onChange={(accessoires) => setVoorstel({ ...voorstel, accessoires })}
            overnemen={accessoiresUitOfferte}
          />
          <Button size="sm" onClick={bewaarVoorstel} disabled={!!bezig}>Voorstel opslaan</Button>
        </section>
      )}

      {lokaleKasten.length > 0 && (
        <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-[#1C1B19]">Kasten en plattegrond</h2>
            <p className="text-xs text-[#6B6560]">Klik op een kast in de tekening om hem in de lijst te vinden.</p>
          </div>
          <div className="grid lg:grid-cols-[1fr_minmax(0,1.1fr)] gap-5 items-start">
            <div className="overflow-x-auto">
              <datalist id="wanden">{wanden.map((w) => <option key={w} value={w} />)}</datalist>
              <datalist id="apparaten">{APPARATEN.map((a) => <option key={a} value={a} />)}</datalist>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#6B6560]">
                    <th className="py-1.5 pr-2">Pos.</th>
                    <th className="py-1.5 pr-2">Kast</th>
                    <th className="py-1.5 pr-2">Wand</th>
                    <th className="py-1.5 pr-2">Tonen</th>
                    <th className="py-1.5">Tekening</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE6DD]">
                  {lokaleKasten.map((k) => (
                    <tr key={k.id} id={`kast-${k.id}`} className={`align-top ${selId === k.id ? 'bg-[#EEF4F1]' : ''}`}>
                      <td className="py-2 pr-2 font-medium">
                        {k.positie}
                        {k.data?.afbeelding && (
                          // eslint-disable-next-line @next/next/no-img-element -- afgeschermd bestand via /api/bestand
                          <img src={fileHref(k.data.afbeelding)} alt="" className="mt-1 w-12 h-12 object-contain" />
                        )}
                      </td>
                      <td className="py-2 pr-2 space-y-1 min-w-[220px]">
                        <input className={veld} defaultValue={k.data?.naam ?? ''} onBlur={(e) => e.target.value !== (k.data?.naam ?? '') && bewaarKast(k.id, { data: { ...k.data, naam: e.target.value } })} />
                        <input className={veld} defaultValue={k.omschrijving ?? ''} placeholder="Omschrijving voor de klant" onBlur={(e) => e.target.value !== (k.omschrijving ?? '') && bewaarKast(k.id, { omschrijving: e.target.value })} />
                        <select
                          className={veld}
                          value={k.soort}
                          onChange={(e) => bewaarKast(k.id, { soort: e.target.value as KastSoort })}
                          aria-label={`Soort kast ${k.positie}`}
                        >
                          {(Object.keys(KAST_SOORT_LABELS) as KastSoort[]).map((s) => <option key={s} value={s}>{KAST_SOORT_LABELS[s]}</option>)}
                        </select>
                        {k.soort === 'apparaat' && (
                          <div className="flex gap-2">
                            <input
                              className={`${veld} w-40 flex-none`}
                              list="apparaten"
                              defaultValue={k.data?.apparaat ?? ''}
                              placeholder="Welk apparaat"
                              aria-label={`Apparaat in kast ${k.positie}`}
                              onBlur={(e) => e.target.value !== (k.data?.apparaat ?? '') && bewaarKast(k.id, { data: { ...k.data, apparaat: e.target.value || undefined } })}
                            />
                            <input className={veld} defaultValue={k.data?.apparaat_voorstel ?? ''} placeholder="Merk en type uit de offerte" aria-label={`Merk en type in kast ${k.positie}`} onBlur={(e) => e.target.value !== (k.data?.apparaat_voorstel ?? '') && bewaarKast(k.id, { data: { ...k.data, apparaat_voorstel: e.target.value || undefined } })} />
                          </div>
                        )}
                        <textarea
                          className={`${veld} min-h-[34px]`}
                          rows={1}
                          defaultValue={k.data?.toelichting ?? ''}
                          placeholder="Toelichting voor de klant (optioneel)"
                          aria-label={`Toelichting bij kast ${k.positie}`}
                          onBlur={(e) => e.target.value !== (k.data?.toelichting ?? '') && bewaarKast(k.id, { data: { ...k.data, toelichting: e.target.value || undefined } })}
                        />
                        <InOntwerp kast={k} onChange={(inbegrepen) => bewaarKast(k.id, { inbegrepen })} />
                        <div className="text-xs text-[#9A948D]">{k.code}{k.breedte ? ` · ${k.breedte} cm` : ''}</div>
                      </td>
                      <td className="py-2 pr-2 min-w-[110px]">
                        <input className={veld} list="wanden" defaultValue={k.wand ?? ''} placeholder="Bijv. Eiland" onBlur={(e) => (e.target.value || null) !== k.wand && bewaarKast(k.id, { wand: e.target.value || null })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="checkbox" checked={k.zichtbaar} onChange={(e) => bewaarKast(k.id, { zichtbaar: e.target.checked })} aria-label={`Kast ${k.positie} tonen`} />
                      </td>
                      <td className="py-2 text-xs">
                        {k.vak ? <Check size={14} className="text-[#2F5D50]" aria-label="Op de tekening" /> : <span className="text-[#9A948D]">niet gevonden</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              {instelling?.plattegrond && opTekening.length > 0 ? (
                <div className="rounded-lg border border-[#DDD8D2] overflow-hidden">
                  <PlattegrondTekening
                    plattegrond={instelling.plattegrond}
                    titel="Plattegrond"
                    kasten={opTekening.map((k) => ({ id: k.id, positie: k.positie, vak: k.vak!, label: `Kast ${k.positie}, ${k.data?.naam ?? k.code}` }))}
                    kleur={(t) => (t.id === selId ? { bg: '#EEF4F1', border: '#2F5D50', ink: '#1E1D1B' } : { bg: '#FFFFFF', border: '#8A8780', ink: '#1E1D1B' })}
                    selId={selId}
                    onKies={(id) => {
                      setSelId(id)
                      document.getElementById(`kast-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-[#6B6560]">
                  Nog geen plattegrond. Lees een bovenaanzicht met positienummers in; tot die tijd ziet de klant de
                  kasten als knoppen per wand.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[#1C1B19]">Feedback van de klant</h2>
          {laatste?.status === 'ingestuurd' && laatste.ronde === huidigeRonde && (
            <Button size="sm" variant="outline" onClick={nieuweRonde}>Ronde {huidigeRonde + 1} starten</Button>
          )}
        </div>
        {!rondes.length && <p className="text-sm text-[#6B6560]">Nog geen feedback.</p>}
        {rondes.map((r) => {
          const totaal = r.wijzigingen.reduce((s, w) => s + (w.bedrag ?? 0), 0)
          return (
            <details key={r.ronde} open={r.ronde === laatste?.ronde} className="border border-[#EAE6DD] rounded-lg">
              <summary className="px-4 py-2.5 cursor-pointer text-sm">
                <span className="font-medium">Ronde {r.ronde}</span>{' · '}
                {r.status === 'ingestuurd'
                  ? `ingestuurd op ${new Date(r.ingestuurd_at!).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : `nog bezig (laatst bijgewerkt ${new Date(r.updated_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})`}
                {' · '}{r.wijzigingen.length} punten{totaal ? ` · ${euro(totaal)} (catalogusprijzen)` : ''}
              </summary>
              <Wijzigingsrapport titel={`Keuzemodule ronde ${r.ronde}`} wijzigingen={r.wijzigingen} />
            </details>
          )
        })}
      </section>
    </div>
  )
}

type Accessoire = { id: string; soort: string; naam: string; omschrijving?: string | null }

// Accessoires voor de klant (eigen tabblad in het portaal). Overnemen uit de
// offerte vult de lijst; daarna vrij aan te passen. Opslaan gaat mee met
// "Voorstel opslaan".
function Accessoires({
  lijst, onChange, overnemen,
}: {
  lijst: Accessoire[]
  onChange: (lijst: Accessoire[]) => void
  overnemen: () => Promise<Accessoire[]>
}) {
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState('')
  const zet = (i: number, patch: Partial<Accessoire>) => onChange(lijst.map((a, j) => (j === i ? { ...a, ...patch } : a)))

  async function haal() {
    if (lijst.length && !confirm('De huidige accessoires vervangen door die uit de offerte?')) return
    setBezig(true)
    setMelding('')
    try {
      const nieuw = await overnemen()
      onChange(nieuw)
      setMelding(nieuw.length ? `${nieuw.length} overgenomen. Vergeet niet op "Voorstel opslaan" te klikken.` : 'Geen accessoires gevonden in de offerte.')
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e))
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[#6B6560]">Accessoires (spoelbak, kraan…) — eigen tabblad voor de klant, zonder prijzen</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={haal} disabled={bezig}>{bezig ? 'Ophalen…' : 'Uit de offerte overnemen'}</Button>
          <Button size="sm" variant="outline" onClick={() => onChange([...lijst, { id: crypto.randomUUID(), soort: '', naam: '', omschrijving: '' }])}>Toevoegen</Button>
        </div>
      </div>
      {melding && <p className="text-xs text-[#2F5D50]">{melding}</p>}
      {lijst.map((a, i) => (
        <div key={a.id} className="grid grid-cols-[8rem_1fr_1.4fr_auto] gap-2 items-center">
          <input className={veld} value={a.soort} placeholder="Soort" aria-label="Soort accessoire" onChange={(e) => zet(i, { soort: e.target.value })} />
          <input className={veld} value={a.naam} placeholder="Merk en type" aria-label="Merk en type" onChange={(e) => zet(i, { naam: e.target.value })} />
          <input className={veld} value={a.omschrijving ?? ''} placeholder="Omschrijving voor de klant" aria-label="Omschrijving" onChange={(e) => zet(i, { omschrijving: e.target.value })} />
          <button type="button" className="text-xs text-[#9B3B2E] underline" onClick={() => onChange(lijst.filter((_, j) => j !== i))}>Verwijderen</button>
        </div>
      ))}
      {!lijst.length && <p className="text-xs text-[#9A948D]">Geen accessoires; het tabblad wordt dan niet getoond.</p>}
    </div>
  )
}

// Wat er volgens het ontwerp al in de kast zit (wordt bij inlezen herkend).
// De klant ziet die opties als "in je ontwerp"; hier aan te passen.
function InOntwerp({ kast, onChange }: { kast: KeuzemoduleKast; onChange: (inbegrepen: string[]) => void }) {
  const opties = extrasVoor(kast.code, kast.soort)
  if (!opties.length) return null
  const aan = new Set(kast.inbegrepen)
  const namen = opties.filter((o) => aan.has(o.key)).map((o) => o.label)
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-[#6B6560]">In het ontwerp: {namen.length ? namen.join(', ') : 'geen extra\'s'}</summary>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5">
        {opties.map((o) => (
          <label key={o.key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={aan.has(o.key)}
              onChange={(e) => onChange(e.target.checked ? [...kast.inbegrepen, o.key] : kast.inbegrepen.filter((x) => x !== o.key))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  )
}

// Kiest een PDF: een bijlage bij de Kasten-opties van de offerte, of een
// bestand van de computer.
function BronKiezer({
  label, waarde, onChange, bronnen, leeg, disabled,
}: {
  label: string
  waarde: string | File
  onChange: (v: string | File) => void
  bronnen: UitdraaiBron[]
  leeg: string | null
  disabled: boolean
}) {
  const bestand = typeof waarde === 'string' ? null : waarde
  return (
    <div className="space-y-1">
      <span className="text-xs text-[#6B6560]">{label}</span>
      <select
        className={veld}
        disabled={disabled}
        value={typeof waarde === 'string' ? waarde : '__bestand'}
        onChange={(e) => e.target.value !== '__bestand' && onChange(e.target.value)}
      >
        {leeg !== null && <option value="">{leeg}</option>}
        {bronnen.map((b) => <option key={b.url} value={b.url}>{b.naam}</option>)}
        {bestand && <option value="__bestand">{bestand.name}</option>}
      </select>
      <label className="inline-block text-xs text-[#1C1B19] underline underline-offset-2 cursor-pointer">
        andere PDF kiezen
        <input type="file" accept="application/pdf" className="hidden" disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f) }} />
      </label>
    </div>
  )
}
