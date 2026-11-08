// Gedeelde stijlen en kleine bouwstenen van de keuzemodule, in de FINKA-
// huisstijl van de website (warm gebroken wit, inkt, rechte hoeken; koppen
// in Cormorant Garamond via .kv-kop, zie globals.css).

import type { CSSProperties, ReactNode } from 'react'

export const C = {
  ink: '#1D1A15',
  tekst: '#4F4D48',
  muted: '#5E5B56',
  zacht: '#6E6B66',
  lijn: '#D9D7D3',
  lijnInput: '#C0BDB9',
  achtergrond: '#F8F6F3',
  vlak: '#F0ECE7',
  // Gekozen en primair: inkt, zoals de knoppen op de website. Het gedempte
  // groen van de website alleen als accent ("ons voorstel").
  groen: '#1D1A15',
  groenDonker: '#1D1A15',
  groenLicht: '#F0EAE3',
  accent: '#4A5B46',
}

export const STATUS_KLEUR = {
  akkoord: { bg: '#E3EADF', border: '#4A5B46', ink: '#2F3D2B' },
  wijzig: { bg: '#F2E5CF', border: '#9A6B2A', ink: '#5A3D12' },
  vraag: { bg: '#E2E6EB', border: '#5A6A7E', ink: '#2E3A4A' },
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
    <div className={`bg-white border rounded-[2px] ${className}`} style={{ borderColor: C.lijn, ...style }}>
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
      className="min-h-10 px-3.5 rounded-[2px] text-sm cursor-pointer border"
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
      className={`flex flex-col items-stretch gap-1.5 p-2.5 rounded-[2px] cursor-pointer text-left ${className}`}
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
      ? { background: C.accent, color: '#FFFFFF', padding: '2px 8px' }
      : soort === 'gekozen'
        ? { background: C.ink, color: '#FFFFFF', padding: '2px 8px' }
        : { background: 'transparent', color: C.muted, padding: '2px 0' }
  return (
    <span className="self-start text-xs font-semibold rounded-[2px]" style={stijl}>
      {children}
    </span>
  )
}

export function Vinkje({ aan }: { aan: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex-none w-[22px] h-[22px] rounded-[2px] flex items-center justify-center text-sm font-bold text-white"
      style={{ background: aan ? C.groen : '#FFFFFF', border: aan ? `2px solid ${C.groen}` : '1.5px solid #8A8780' }}
    >
      {aan ? '✓' : ''}
    </span>
  )
}

export function Staal({ src, className = '', style }: { src: string | null; className?: string; style?: CSSProperties }) {
  if (!src) {
    return <span aria-hidden="true" className={`block rounded-[2px] ${className}`} style={{ background: C.vlak, border: `1px solid ${C.lijn}`, ...style }} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" loading="lazy" className={`block rounded-[2px] object-cover ${className}`} style={style} />
}
