import { cn } from '@/lib/utils'
import type { FieldSource } from '@/lib/types'

const SOURCE_LABELS: Record<FieldSource, string> = {
  in: 'IN',
  auto: 'AUTO',
  def: 'DEF',
}

const SOURCE_STYLES: Record<FieldSource, string> = {
  in: 'bg-[#EDE9E4] text-[#1C1B19] border-[#DDD8D2]',
  auto: 'bg-[#C9A96E]/15 text-[#8A6D3B] border-[#C9A96E]/40',
  def: 'bg-transparent text-[#8A8580] border-[#DDD8D2]',
}

// Klein label naast een veldtitel dat aangeeft hoe de waarde tot stand kwam:
// handmatig ingevoerd (IN), automatisch berekend (AUTO) of een standaardwaarde
// (DEF). Een AUTO/DEF-veld blijft altijd overschrijfbaar — zodra de gebruiker
// het aanpast, moet de aanroepende code de source naar 'in' zetten.
export function SourceTag({ source, className }: { source: FieldSource; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
        SOURCE_STYLES[source],
        className
      )}
      title={
        source === 'in'
          ? 'Handmatig ingevoerd'
          : source === 'auto'
          ? 'Automatisch berekend — nog aan te passen'
          : 'Standaardwaarde — nog aan te passen'
      }
    >
      {SOURCE_LABELS[source]}
    </span>
  )
}

interface FieldWithSourceProps {
  label: string
  source: FieldSource
  children: React.ReactNode
  className?: string
}

// Wrapper voor een formulierveld: label + IN/AUTO/DEF-indicator erboven,
// het daadwerkelijke input-element als children.
export function FieldWithSource({ label, source, children, className }: FieldWithSourceProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-[#6B655F]">{label}</label>
        <SourceTag source={source} />
      </div>
      {children}
    </div>
  )
}
