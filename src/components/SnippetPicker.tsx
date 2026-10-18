'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileText } from 'lucide-react'
import { QuoteTextSnippet } from '@/lib/types'
import { snippetMenuLabel } from '@/lib/quote-text-snippets'

// Klein "Standaardtekst"-knopje bij een invulveld van de offerte — opent een
// lijstje met de teksten die op /instellingen/teksten voor dit veld zijn
// klaargezet. Wat "invoegen" precies doet bepaalt de aanroeper (onPick).
export default function SnippetPicker({
  snippets,
  onPick,
  label = 'Standaardtekst',
  iconOnly = false,
  align = 'right',
}: {
  snippets: QuoteTextSnippet[]
  onPick: (snippet: QuoteTextSnippet) => void
  label?: string
  iconOnly?: boolean
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={iconOnly ? label : undefined}
        className="inline-flex items-center gap-1 text-xs text-[#9A948D] hover:text-[#1C1B19]"
      >
        <FileText size={11} />
        {!iconOnly && label}
        {!iconOnly && <ChevronDown size={10} />}
      </button>
      {open && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-30 mt-1 w-72 max-h-80 overflow-y-auto bg-white rounded-lg border border-[#DDD8D2] shadow-lg py-1`}>
          {snippets.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#6B6560]">Nog geen standaardteksten voor dit veld.</p>
          ) : (
            snippets.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onPick(s); setOpen(false) }}
                className="block w-full text-left px-3 py-2 hover:bg-[#F7F5F2]"
              >
                <span className="block text-sm text-[#1C1B19]">{snippetMenuLabel(s)}</span>
                {s.title.trim() && (
                  <span className="block text-xs text-[#9A948D] line-clamp-2 whitespace-pre-line">{s.body}</span>
                )}
              </button>
            ))
          )}
          <div className="border-t border-[#DDD8D2] mt-1 pt-1">
            <Link
              href="/instellingen/teksten"
              target="_blank"
              className="block px-3 py-1.5 text-xs text-[#C9A96E] hover:underline"
            >
              Standaardteksten beheren →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
