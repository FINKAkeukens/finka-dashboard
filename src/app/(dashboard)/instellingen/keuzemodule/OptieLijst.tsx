'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface OptieRij {
  sleutel: string
  sectie: string
  groep: string
  label: string
  sub: string
  kasten: string[]
  codes: string[]
  controle: { soort: 'ok' | 'geen' | 'los'; tekst: string }
  aan: boolean
  standaardUit: boolean
}

const CONTROLE_STIJL = {
  ok: 'bg-[#E3EADF] text-[#2F3D2B]',
  geen: 'bg-red-50 text-red-700',
  los: 'bg-[#F0ECE7] text-[#5E5B56]',
} as const

export default function OptieLijst({ rijen }: { rijen: OptieRij[] }) {
  const supabase = createClient()
  const [aan, setAan] = useState(() => Object.fromEntries(rijen.map((r) => [r.sleutel, r.aan])))
  const [fout, setFout] = useState('')
  const [filter, setFilter] = useState<'alles' | 'aan' | 'uit' | 'let op'>('alles')

  async function zet(sleutel: string, waarde: boolean) {
    setFout('')
    setAan((a) => ({ ...a, [sleutel]: waarde }))
    const { error } = await supabase
      .from('finka_keuzemodule_opties')
      .upsert({ sleutel, aan: waarde, updated_at: new Date().toISOString() }, { onConflict: 'sleutel' })
    if (error) {
      setAan((a) => ({ ...a, [sleutel]: !waarde }))
      setFout(error.message)
    }
  }

  const zichtbaar = rijen.filter((r) =>
    filter === 'alles' ? true : filter === 'aan' ? aan[r.sleutel] : filter === 'uit' ? !aan[r.sleutel] : r.controle.soort !== 'ok' && aan[r.sleutel]
  )
  const secties = [...new Set(zichtbaar.map((r) => r.sectie))]
  const telLetOp = rijen.filter((r) => r.controle.soort !== 'ok' && aan[r.sleutel]).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(['alles', 'aan', 'uit', 'let op'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg border ${filter === f ? 'bg-[#1C1B19] text-white border-[#1C1B19]' : 'bg-white text-[#1C1B19] border-[#DDD8D2]'}`}
          >
            {f === 'alles' ? `Alles (${rijen.length})` : f === 'aan' ? 'Aan' : f === 'uit' ? 'Uit' : `Let op: aan maar niet uit de catalogus (${telLetOp})`}
          </button>
        ))}
      </div>
      {fout && <p className="text-sm text-red-600">{fout}</p>}

      {secties.map((sectie) => {
        const lijst = zichtbaar.filter((r) => r.sectie === sectie)
        const groepen = [...new Set(lijst.map((r) => r.groep))]
        return (
          <section key={sectie} className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
            <h2 className="px-5 py-3 text-sm font-medium text-[#1C1B19] border-b border-[#EAE6DD]">{sectie}</h2>
            {groepen.map((g) => (
              <div key={g}>
                {g && <div className="px-5 pt-3 pb-1 text-xs font-medium text-[#6B6560] uppercase tracking-wide">{g}</div>}
                <ul className="divide-y divide-[#EAE6DD]">
                  {lijst.filter((r) => r.groep === g).map((r) => (
                    <li key={r.sleutel} className={`px-5 py-3 flex items-start gap-4 ${aan[r.sleutel] ? '' : 'bg-[#FAF9F7]'}`}>
                      <label className="flex items-start gap-3 flex-auto min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={aan[r.sleutel]}
                          onChange={(e) => zet(r.sleutel, e.target.checked)}
                          aria-label={`${r.label} tonen aan klanten`}
                        />
                        <span className="min-w-0">
                          <span className={`block text-sm font-medium ${aan[r.sleutel] ? 'text-[#1C1B19]' : 'text-[#9A948D] line-through'}`}>{r.label}</span>
                          <span className="block text-xs text-[#6B6560]">{r.sub}</span>
                          {r.kasten.length > 0 && <span className="block text-xs text-[#9A948D] mt-0.5">In: {r.kasten.join(', ')}</span>}
                          {r.codes.length > 0 && <span className="block font-mono text-[11px] text-[#9A948D] mt-0.5">{r.codes.join(' · ')}</span>}
                        </span>
                      </label>
                      <span className={`flex-none text-xs px-2 py-1 rounded-md whitespace-nowrap ${CONTROLE_STIJL[r.controle.soort]}`}>
                        {r.controle.tekst}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )
      })}
      {!secties.length && <p className="text-sm text-[#6B6560]">Niets in deze selectie.</p>}
      <p className="text-xs text-[#9A948D]">
        {'{b}'} = kastbreedte, {'{u}'} = houtuitvoering (EN eiken, ES essen zwart, QG OrganiQ). Wijzigingen gelden direct
        voor alle projecten; klanten zien het bij het opnieuw openen van de module.
      </p>
    </div>
  )
}
