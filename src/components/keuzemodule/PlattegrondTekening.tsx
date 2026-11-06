'use client'

import type { Plattegrond, Vak } from '@/lib/keuzemodule/plattegrond'

// Getekende plattegrond van de keukenmodule: muren in grijs, elke kast als
// vak met zijn positienummer, het front als donkere streep. Bovenkasten
// staan er gestippeld overheen (zoals in Winner Flex), alleen hun rand en
// nummer zijn aanklikbaar zodat de onderkast eronder bereikbaar blijft.

export interface TekenKast {
  id: string
  positie: string
  vak: Vak
  label: string // voor schermlezers
}

export interface VakKleur {
  bg: string
  border: string
  ink: string
}

export default function PlattegrondTekening({
  plattegrond, kasten, kleur, selId, onKies, titel = 'Plattegrond van je keuken',
}: {
  plattegrond: Plattegrond
  kasten: TekenKast[]
  kleur: (k: TekenKast) => VakKleur
  selId: string | null
  onKies?: (id: string) => void
  titel?: string
}) {
  const [kx, ky, kw, kh] = plattegrond.kader
  // Lettergrootte en lijndikte meeschalen met de tekening, zodat ze op elk
  // scherm even groot ogen als in het ontwerp (~12 px bij 640 px breed).
  const eenheid = Math.max(kw, kh) / 180
  const fs = 3.4 * eenheid
  const onder = kasten.filter((k) => !k.vak.wand)
  const boven = kasten.filter((k) => k.vak.wand)

  const kies = (id: string) => onKies?.(id)
  const toets = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      kies(id)
    }
  }

  const front = (v: Vak, d: number) => {
    const m = 0.6 * eenheid
    switch (v.front) {
      case 'up': return { x: v.x + m, y: v.y + m, width: v.w - 2 * m, height: d }
      case 'down': return { x: v.x + m, y: v.y + v.h - m - d, width: v.w - 2 * m, height: d }
      case 'left': return { x: v.x + m, y: v.y + m, width: d, height: v.h - 2 * m }
      case 'right': return { x: v.x + v.w - m - d, y: v.y + m, width: d, height: v.h - 2 * m }
      default: return null
    }
  }

  return (
    <svg viewBox={`${kx} ${ky} ${kw} ${kh}`} role="group" aria-label={titel} className="block w-full h-auto rounded-md" style={{ background: '#F3F1EC' }}>
      <style>{`.kv-vak:focus-visible > :first-child { stroke: #2F5D50; stroke-width: ${1.4 * eenheid}px; }`}</style>
      {plattegrond.muren.map((d, i) => <path key={i} d={d} fill="#CFCAC0" fillRule="evenodd" />)}
      {onder.map((k) => {
        const c = kleur(k)
        const sel = k.id === selId
        const v = k.vak
        const f = front(v, 0.9 * eenheid)
        return (
          <g
            key={k.id}
            role={onKies ? 'button' : undefined}
            tabIndex={onKies ? 0 : undefined}
            aria-label={onKies ? k.label : undefined}
            aria-pressed={onKies ? sel : undefined}
            onClick={() => kies(k.id)}
            onKeyDown={toets(k.id)}
            className={onKies ? 'kv-vak cursor-pointer outline-none' : undefined}
          >
            <rect x={v.x} y={v.y} width={v.w} height={v.h} rx={0.6 * eenheid} fill={c.bg} stroke={sel ? '#1E1D1B' : c.border} strokeWidth={(sel ? 1 : 0.45) * eenheid} />
            {f && <rect {...f} fill="#1E1D1B" pointerEvents="none" />}
            <text x={v.x + v.w / 2} y={v.y + v.h / 2} fontSize={fs} fontWeight={700} fill={c.ink} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
              {k.positie}
            </text>
          </g>
        )
      })}
      {boven.map((k) => {
        const c = kleur(k)
        const sel = k.id === selId
        const v = k.vak
        const r = fs * 0.75
        return (
          <g
            key={k.id}
            role={onKies ? 'button' : undefined}
            tabIndex={onKies ? 0 : undefined}
            aria-label={onKies ? k.label : undefined}
            aria-pressed={onKies ? sel : undefined}
            onClick={() => kies(k.id)}
            onKeyDown={toets(k.id)}
            className={onKies ? 'kv-vak cursor-pointer outline-none' : undefined}
          >
            <rect
              x={v.x} y={v.y} width={v.w} height={v.h}
              fill="none" pointerEvents="stroke"
              stroke={sel ? '#1E1D1B' : c.border} strokeWidth={(sel ? 1 : 0.6) * eenheid} strokeDasharray={`${1.6 * eenheid} ${1 * eenheid}`}
            />
            <circle cx={v.lx} cy={v.ly} r={r} fill={c.bg} stroke={sel ? '#1E1D1B' : c.border} strokeWidth={(sel ? 0.8 : 0.45) * eenheid} />
            <text x={v.lx} y={v.ly} fontSize={fs * 0.8} fontWeight={700} fill={c.ink} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
              {k.positie}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
