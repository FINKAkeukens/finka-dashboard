'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { parseCatalogus, type Catalogus, type ImageRef } from '@/lib/catalogus/parse'
import { knipStalen, leesCatalogus, openPdf, type Voortgang } from '@/lib/catalogus/extract'
import { catalogusNaarItems, staalPad, titelUitBestandsnaam, type CatalogusSoort } from '@/lib/catalogus/items'

export interface CatalogusInfo {
  id: string
  titel: string
  bestandsnaam: string | null
  actief: boolean
  aantallen: Record<string, number>
  waarschuwingen: string[]
  ingelezen_at: string
}

const AANTAL_LABELS: [keyof Omit<Catalogus, 'titel' | 'waarschuwingen'>, string][] = [
  ['corpus', 'binnenkleuren'],
  ['werkbladen', 'werkbladdecors'],
  ['grepen', 'grepen en knoppen'],
  ['modellen', 'modellen'],
  ['kasten', 'kastprijzen'],
  ['accessoires', 'accessoires'],
]

const UPLOAD_PARALLEL = 6

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function CatalogusVernieuwen({ catalogi }: { catalogi: CatalogusInfo[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [bestand, setBestand] = useState<File | null>(null)
  const [titel, setTitel] = useState('')
  const [resultaat, setResultaat] = useState<Catalogus | null>(null)
  const [voortgang, setVoortgang] = useState<Voortgang | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const actief = catalogi.find((c) => c.actief)

  async function kiesBestand(file: File | undefined) {
    if (!file) return
    setFout('')
    setResultaat(null)
    setBestand(file)
    setTitel(titelUitBestandsnaam(file.name))
    setBezig(true)
    try {
      const pdf = await openPdf(file)
      try {
        const { outline, pages } = await leesCatalogus(pdf, setVoortgang)
        setResultaat(parseCatalogus(outline, pages, pdf.numPages))
      } finally {
        pdf.destroy()
      }
    } catch (e) {
      setFout('Inlezen mislukt: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setVoortgang(null)
      setBezig(false)
    }
  }

  async function opslaan() {
    if (!bestand || !resultaat) return
    setFout('')
    setBezig(true)
    const supabase = createClient()
    const id = crypto.randomUUID()
    try {
      // Stalen opnieuw uitknippen uit dezelfde PDF en rechtstreeks naar de
      // bucket uploaden; de route krijgt alleen de URL's.
      const pdf = await openPdf(bestand)
      const urls = new Map<ImageRef, string>()
      try {
        type Staal = { ref: ImageRef | null; soort: CatalogusSoort; code: string; extra: string }
        const alle: Staal[] = [
          ...resultaat.corpus.map((x) => ({ ref: x.img, soort: 'corpus' as const, code: x.code, extra: '' })),
          ...resultaat.werkbladen.map((x) => ({ ref: x.img, soort: 'werkblad' as const, code: x.code, extra: x.compact ? '-compact' : '' })),
          ...resultaat.grepen.map((x) => ({ ref: x.img, soort: 'greep' as const, code: x.code, extra: '' })),
        ]
        const refs = alle.filter((r): r is Staal & { ref: ImageRef } => !!r.ref)
        const blobs = await knipStalen(pdf, refs.map((r) => r.ref), setVoortgang)
        let klaar = 0
        const queue = refs.slice()
        const werker = async () => {
          for (let r = queue.shift(); r; r = queue.shift()) {
            const blob = blobs.get(r.ref)
            if (!blob) continue
            const pad = staalPad(id, r.soort, r.code, r.extra)
            const { error } = await supabase.storage.from('catalogus').upload(pad, blob, { contentType: 'image/webp' })
            if (error) throw new Error(`Staal ${r.code} uploaden mislukt: ${error.message}`)
            urls.set(r.ref, supabase.storage.from('catalogus').getPublicUrl(pad).data.publicUrl)
            setVoortgang({ stap: 'Stalen uploaden', klaar: ++klaar, totaal: refs.length })
          }
        }
        await Promise.all(Array.from({ length: UPLOAD_PARALLEL }, werker))
      } finally {
        pdf.destroy()
      }

      setVoortgang({ stap: 'Opslaan', klaar: 0, totaal: 1 })
      const items = catalogusNaarItems(resultaat, (ref) => (ref ? urls.get(ref) ?? null : null))
      const res = await fetch('/api/instellingen/catalogus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          titel,
          bestandsnaam: bestand.name,
          aantallen: Object.fromEntries(AANTAL_LABELS.map(([k]) => [k, resultaat[k].length])),
          waarschuwingen: resultaat.waarschuwingen,
          items,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      setBestand(null)
      setResultaat(null)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e))
    } finally {
      setVoortgang(null)
      setBezig(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[#6B6560]" />
          <h2 className="text-sm font-medium text-[#1C1B19]">Actieve catalogus</h2>
        </div>
        {actief ? (
          <div className="text-sm space-y-1">
            <p className="text-[#1C1B19] font-medium">{actief.titel}</p>
            <p className="text-[#6B6560]">Ingelezen op {formatDatum(actief.ingelezen_at)}{actief.bestandsnaam ? ` uit ${actief.bestandsnaam}` : ''}</p>
            <p className="text-[#6B6560]">
              {AANTAL_LABELS.map(([k, label]) => `${actief.aantallen[k] ?? 0} ${label}`).join(' · ')}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#6B6560]">Nog geen catalogus ingelezen.</p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-[#DDD8D2] p-5 space-y-4">
        <h2 className="text-sm font-medium text-[#1C1B19]">Catalogus vernieuwen</h2>
        <p className="text-sm text-[#6B6560]">
          Kies de PDF van het dealer-verkoophandboek (bijv. SK130_2027_NL.pdf). Het inlezen gebeurt in je browser en
          duurt een paar minuten; laat dit tabblad openstaan. Projecten die al feedback hebben, houden hun ingestuurde
          keuzes.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={bezig}
          onChange={(e) => kiesBestand(e.target.files?.[0])}
          className="block text-sm"
        />

        {voortgang && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[#6B6560]">
              <span>{voortgang.stap}</span>
              <span>{voortgang.klaar} / {voortgang.totaal}</span>
            </div>
            <div className="h-1.5 bg-[#EAE6DD] rounded-full overflow-hidden">
              <div className="h-full bg-[#1C1B19] transition-all" style={{ width: `${Math.round((voortgang.klaar / Math.max(1, voortgang.totaal)) * 100)}%` }} />
            </div>
          </div>
        )}

        {resultaat && (
          <div className="space-y-3 border-t border-[#EAE6DD] pt-4">
            <ul className="text-sm text-[#1C1B19] space-y-0.5">
              {AANTAL_LABELS.map(([k, label]) => (
                <li key={k}>{resultaat[k].length} {label}</li>
              ))}
            </ul>
            {resultaat.waarschuwingen.length > 0 && (
              <ul className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 space-y-1">
                {resultaat.waarschuwingen.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="catalogus-titel" className="text-xs text-[#6B6560]">Naam</label>
                <Input id="catalogus-titel" value={titel} onChange={(e) => setTitel(e.target.value)} className="w-48" />
              </div>
              <Button size="sm" onClick={opslaan} disabled={bezig || !titel.trim()}>
                <Upload size={13} className="mr-1.5" />
                {bezig ? 'Bezig...' : 'Opslaan en actief maken'}
              </Button>
            </div>
          </div>
        )}

        {fout && <p className="text-sm text-red-600">{fout}</p>}
      </section>

      {catalogi.filter((c) => !c.actief).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-[#1C1B19]">Eerder ingelezen</h2>
          <ul className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2] text-sm">
            {catalogi.filter((c) => !c.actief).map((c) => (
              <li key={c.id} className="px-5 py-3 flex justify-between gap-3">
                <span className="text-[#1C1B19]">{c.titel}</span>
                <span className="text-[#6B6560]">{formatDatum(c.ingelezen_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
