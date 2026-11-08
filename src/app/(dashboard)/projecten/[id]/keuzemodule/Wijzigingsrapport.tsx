'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Wijziging } from '@/lib/keuzemodule/types'

// Wijzigingsrapport van één ronde: per positie wat de klant wil, met de
// codes die er in Winner Flex bij komen en af gaan. Daaronder de punten
// voor de hele keuken. "Kopiëren" geeft dezelfde lijst als platte tekst.

function bedragTekst(w: Wijziging) {
  const b = w.bedrag ? (w.bedrag < 0 ? '−' : '+') + '€' + Math.abs(Math.round(w.bedrag)).toLocaleString('nl-NL') : ''
  return b + (w.prijsVolgt ? (b ? ' + ' : '') + 'prijs volgt' : '')
}

const sorteer = (a: Wijziging, b: Wijziging) =>
  (a.positie ?? '').localeCompare(b.positie ?? '', 'nl', { numeric: true })

function alsTekst(titel: string, kasten: Wijziging[], algemeen: Wijziging[]) {
  const regels = [titel, '']
  for (const w of kasten) {
    regels.push(`Pos. ${w.positie}  ${w.codeInOntwerp ?? ''}  ${w.kast}`)
    regels.push(`  ${w.soort === 'vraag' ? 'Vraag' : 'Wens'}: ${w.tekst}`)
    if (w.codes.length) regels.push(`  Erbij: ${w.codes.join(', ')}`)
    if (w.codesWeg?.length) regels.push(`  Eraf: ${w.codesWeg.join(', ')}`)
    if (bedragTekst(w)) regels.push(`  Indicatie: ${bedragTekst(w)}`)
    regels.push('')
  }
  if (algemeen.length) {
    regels.push('Hele keuken')
    for (const w of algemeen) {
      regels.push(`  ${w.tag} · ${w.titel}: ${w.tekst}${w.codes.length ? ` [${w.codes.join(', ')}]` : ''}${bedragTekst(w) ? ` (${bedragTekst(w)})` : ''}`)
    }
  }
  return regels.join('\n').trim()
}

export default function Wijzigingsrapport({ titel, wijzigingen }: { titel: string; wijzigingen: Wijziging[] }) {
  const [gekopieerd, setGekopieerd] = useState(false)
  const kasten = wijzigingen.filter((w) => w.positie).sort(sorteer)
  const algemeen = wijzigingen.filter((w) => !w.positie)
  if (!wijzigingen.length) return <p className="px-4 py-3 text-sm text-[#6B6560]">Geen wijzigingen of vragen.</p>

  async function kopieer() {
    await navigator.clipboard.writeText(alsTekst(titel, kasten, algemeen))
    setGekopieerd(true)
    setTimeout(() => setGekopieerd(false), 2000)
  }

  const codes = (lijst: string[] | undefined, teken: string, kleur: string) =>
    lijst?.length ? (
      <div className={`font-mono text-xs ${kleur}`}>
        {lijst.map((c) => <div key={c}>{teken} {c}</div>)}
      </div>
    ) : null

  return (
    <div className="text-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-[#6B6560] border-b border-[#EAE6DD]">
              <th className="px-4 py-2 w-14">Pos.</th>
              <th className="px-2 py-2">Kast</th>
              <th className="px-2 py-2">Wens van de klant</th>
              <th className="px-2 py-2">Codes</th>
              <th className="px-4 py-2 text-right">Indicatie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAE6DD]">
            {kasten.map((w, i) => (
              <tr key={i} className="align-top">
                <td className="px-4 py-2 font-semibold">{w.positie}</td>
                <td className="px-2 py-2 min-w-[140px]">
                  <div>{w.kast}</div>
                  <div className="font-mono text-xs text-[#9A948D]">{w.codeInOntwerp}</div>
                </td>
                <td className="px-2 py-2 min-w-[200px]">
                  {w.soort === 'vraag' && <span className="text-xs font-semibold px-1.5 py-0.5 rounded mr-1.5 bg-[#DCE6F4] text-[#203C6B]">Vraag</span>}
                  {w.tekst}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {codes(w.codes, '+', 'text-[#2F5D50]')}
                  {codes(w.codesWeg, '−', 'text-[#9B3B2E]')}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{bedragTekst(w)}</td>
              </tr>
            ))}
            {algemeen.length > 0 && (
              <tr><td colSpan={5} className="px-4 pt-3 pb-1 text-xs font-medium text-[#6B6560]">Hele keuken</td></tr>
            )}
            {algemeen.map((w, i) => (
              <tr key={`a${i}`} className="align-top">
                <td className="px-4 py-2" />
                <td className="px-2 py-2">{w.tag}</td>
                <td className="px-2 py-2">
                  {w.soort === 'vraag' && <span className="text-xs font-semibold px-1.5 py-0.5 rounded mr-1.5 bg-[#DCE6F4] text-[#203C6B]">Vraag</span>}
                  <span className="font-medium">{w.titel}</span> · {w.tekst}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{codes(w.codes, '+', 'text-[#2F5D50]')}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{bedragTekst(w)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center gap-3 px-4 py-2.5 border-t border-[#EAE6DD] bg-[#F7F5F2]">
        <span className="text-xs text-[#6B6560]">+ = toevoegen in Winner Flex, − = vervalt. Bedragen zijn indicaties incl. btw.</span>
        <Button size="sm" variant="outline" onClick={kopieer}>
          {gekopieerd ? <Check size={13} /> : <Copy size={13} />}
          {gekopieerd ? 'Gekopieerd' : 'Kopiëren als tekst'}
        </Button>
      </div>
    </div>
  )
}
