// Gedeelde stijlen en kleine bouwstenen van de keuzemodule — kleuren en
// maten uit het ontwerp "Feedback per kast" (claude.ai-canvas, nov 2026).

import type { CSSProperties, ReactNode } from 'react'

export const C = {
  ink: '#1E1D1B',
  tekst: '#3F3D39',
  muted: '#5E5B55',
  zacht: '#6E6A63',
  lijn: '#E2DED6',
  lijnInput: '#CFCAC0',
  achtergrond: '#F3F1EC',
  vlak: '#F6F4EF',
  groen: '#2F5D50',
  groenDonker: '#1F4038',
  groenLicht: '#EEF4F1',
}

export const STATUS_KLEUR = {
  akkoord: { bg: '#DCEBDD', border: '#2C6B3C', ink: '#1F4D2B' },
  wijzig: { bg: '#F6E3C3', border: '#A8650F', ink: '#6B3F06' },
  vraag: { bg: '#DCE6F4', border: '#3A5F9E', ink: '#203C6B' },
} as const

export function euro(n: number): string {
  return '€' + Math.round(Math.abs(n)).toLocaleString('nl-NL')
}

export function delta(n: number | null): string {
  if (n === null) return 'prijs volgt'
  if (n === 0) return '€0'
  return (n > 0 ? '+' : '−') + euro(n)
}

export function Kaart({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`bg-white border rounded-[14px] ${className}`} style={{ borderColor: C.lijn, ...style }}>
      {children}
    </div>
  )
}

export function Chip({ aan, onClick, children }: { aan: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aan}
      className="min-h-10 px-3.5 rounded-full text-sm cursor-pointer border"
      style={{
        fontWeight: aan ? 700 : 500,
        background: aan ? C.groen : '#FFFFFF',
        color: aan ? '#FFFFFF' : C.ink,
        borderColor: aan ? C.groen : C.lijnInput,
      }}
    >
      {children}
    </button>
  )
}

export function KeuzeKaart({ aan, onClick, children, className = '' }: { aan: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aan}
      className={`flex flex-col items-stretch gap-1.5 p-2.5 rounded-xl cursor-pointer text-left ${className}`}
      style={{
        background: aan ? C.groenLicht : '#FFFFFF',
        border: aan ? `2px solid ${C.groen}` : '1px solid #DDD8CF',
        color: C.ink,
      }}
    >
      {children}
    </button>
  )
}

export function Tag({ soort, children }: { soort: 'voorstel' | 'gekozen' | 'code'; children: ReactNode }) {
  const stijl: CSSProperties =
    soort === 'voorstel'
      ? { background: C.groen, color: '#FFFFFF', padding: '2px 8px' }
      : soort === 'gekozen'
        ? { background: '#F6E3C3', color: '#6B3F06', padding: '2px 8px' }
        : { background: 'transparent', color: C.muted, padding: '2px 0' }
  return (
    <span className="self-start text-xs font-semibold rounded-[10px]" style={stijl}>
      {children}
    </span>
  )
}

export function Vinkje({ aan }: { aan: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex-none w-[22px] h-[22px] rounded-md flex items-center justify-center text-sm font-bold text-white"
      style={{ background: aan ? C.groen : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : '1.5px solid #8A8780' }}
    >
      {aan ? '✓' : ''}
    </span>
  )
}

export function Staal({ src, className = '', style }: { src: string | null; className?: string; style?: CSSProperties }) {
  if (!src) {
    return <span aria-hidden="true" className={`block rounded-md ${className}`} style={{ background: C.vlak, border: `1px solid ${C.lijn}`, ...style }} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" loading="lazy" className={`block rounded-md object-cover ${className}`} style={style} />
}
