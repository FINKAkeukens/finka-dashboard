'use client'

import { useState } from 'react'
import { Globe, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SPEC_LABELS, TYPE_LABELS } from '@/lib/appliance-utils'
import type { VerifyResult } from '@/lib/appliance-verify'
import type { ApplianceSpecs } from '@/lib/types'

export interface VerifiableAppliance {
  type: string
  brand: string
  model: string
  category: string
  specs: ApplianceSpecs
  notes: string
}

interface Change {
  key: string
  label: string
  current: string
  proposed: string
  apply: (a: VerifiableAppliance) => VerifiableAppliance
}

const show = (v: unknown) =>
  v === undefined || v === null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'ja' : 'nee') : String(v)

// Velden die de controle niet kent maar die bewust bewaard moeten blijven.
const KEEP_SPEC_KEYS = new Set(['product_line'])

export function computeChanges(current: VerifiableAppliance, r: VerifyResult): Change[] {
  const changes: Change[] = []
  if (r.type !== current.type) {
    changes.push({ key: 'type', label: 'Type', current: TYPE_LABELS[current.type] ?? current.type, proposed: TYPE_LABELS[r.type] ?? r.type, apply: (a) => ({ ...a, type: r.type }) })
  }
  if (r.brand && r.brand !== current.brand) {
    changes.push({ key: 'brand', label: 'Merk', current: current.brand, proposed: r.brand, apply: (a) => ({ ...a, brand: r.brand }) })
  }
  if (r.model && r.model !== current.model) {
    changes.push({ key: 'model', label: 'Model', current: current.model, proposed: r.model, apply: (a) => ({ ...a, model: r.model }) })
  }
  if (r.category && r.category !== current.category) {
    changes.push({ key: 'category', label: 'Prijsklasse', current: show(current.category), proposed: r.category, apply: (a) => ({ ...a, category: r.category! }) })
  }
  // Specs: alles wat de controle opgeeft en anders is, plus oude sleutels
  // die niet meer in het nieuwe schema horen (bv. "breedte_cm", "geluid_db").
  const keys = new Set([...Object.keys(r.specs), ...Object.keys(current.specs)])
  for (const key of keys) {
    const cur = current.specs[key]
    const next = r.specs[key]
    if (next === undefined) {
      if (cur === undefined || cur === null || cur === '' || KEEP_SPEC_KEYS.has(key) || key in SPEC_LABELS) continue
      changes.push({ key: `spec:${key}`, label: `${key} (verouderd veld)`, current: show(cur), proposed: '— verwijderen', apply: (a) => { const s = { ...a.specs }; delete s[key]; return { ...a, specs: s } } })
      continue
    }
    if (show(cur) === show(next)) continue
    changes.push({ key: `spec:${key}`, label: SPEC_LABELS[key] ?? key, current: show(cur), proposed: show(next), apply: (a) => ({ ...a, specs: { ...a.specs, [key]: next } }) })
  }
  if (r.description && !current.notes) {
    changes.push({ key: 'notes', label: 'Omschrijving', current: '—', proposed: r.description, apply: (a) => ({ ...a, notes: r.description }) })
  }
  return changes
}

// Knop "Controleer online" + verschillenlijst met per regel een vinkje.
// Overnemen past alleen de formulier-state aan; opslaan blijft een bewuste
// klik op "Opslaan" in het formulier zelf.
export default function ApplianceVerifyPanel({
  current,
  onApply,
}: {
  current: VerifiableAppliance
  onApply: (next: VerifiableAppliance, result: VerifyResult) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState(false)

  async function run() {
    if (!current.brand || !current.model) {
      setError('Vul eerst merk en model in')
      return
    }
    setLoading(true)
    setError(null)
    setApplied(false)
    try {
      const res = await fetch('/api/apparatuur/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Controle mislukt')
      const r = data as VerifyResult
      const c = r.found ? computeChanges(current, r) : []
      setResult(r)
      setChanges(c)
      setSelected(new Set(c.map((x) => x.key)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function apply() {
    if (!result) return
    const next = changes.filter((c) => selected.has(c.key)).reduce((a, c) => c.apply(a), current)
    onApply(next, result)
    setApplied(true)
  }

  return (
    <div className="rounded-xl border border-[#DDD8D2] bg-[#FAF9F7] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#1C1B19]">Online controle</p>
          <p className="text-xs text-[#6B6560]">Zoekt de officiële specificaties en maten op en toont wat afwijkt.</p>
        </div>
        <Button type="button" variant="outline" onClick={run} disabled={loading}>
          {loading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Globe size={13} className="mr-1.5" />}
          {loading ? 'Bezig (±30 s)…' : result ? 'Opnieuw controleren' : 'Controleer online'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && !result.found && (
        <p className="text-sm text-amber-700">Niet gevonden online — controleer merk en modelnummer.</p>
      )}

      {result?.found && (
        <>
          <p className="text-xs text-[#6B6560]">
            Gevonden: <span className="text-[#1C1B19]">{result.official_name}</span> · zekerheid {result.confidence}
            {result.sources.length > 0 && (
              <> · bron: {result.sources.slice(0, 2).map((s, i) => (
                <a key={s} href={s} target="_blank" rel="noreferrer" className="underline">{i > 0 ? ', ' : ''}{new URL(s).hostname.replace('www.', '')}</a>
              ))}</>
            )}
          </p>
          {changes.length === 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-green-700"><Check size={14} /> Alles klopt</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#6B6560]">
                      <th className="w-6" />
                      <th className="py-1 pr-3 font-medium">Veld</th>
                      <th className="py-1 pr-3 font-medium">Nu</th>
                      <th className="py-1 font-medium">Voorstel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.key} className="border-t border-[#EDE9E4] align-top">
                        <td className="py-1.5">
                          <input type="checkbox" checked={selected.has(c.key)} onChange={() => setSelected((prev) => {
                            const n = new Set(prev)
                            if (n.has(c.key)) n.delete(c.key)
                            else n.add(c.key)
                            return n
                          })} />
                        </td>
                        <td className="py-1.5 pr-3 text-[#6B6560]">{c.label}</td>
                        <td className="py-1.5 pr-3 text-red-700 line-through decoration-red-300">{c.current}</td>
                        <td className="py-1.5 text-green-800">{c.proposed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={apply} disabled={selected.size === 0 || applied}>
                  {applied ? 'Overgenomen — vergeet niet op te slaan' : `${selected.size} wijziging${selected.size === 1 ? '' : 'en'} overnemen`}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
