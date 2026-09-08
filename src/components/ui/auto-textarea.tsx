'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// Tekstveld dat automatisch meegroeit met de inhoud, zodat lange regels
// (bv. de afspraken in het formulier "Voorbereiding ruimte gereed") in één keer leesbaar zijn
// i.p.v. afgekapt op één regel.
export default function AutoTextarea({
  value,
  onChange,
  onBlur,
  className,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cn('resize-none overflow-hidden', className)}
    />
  )
}
