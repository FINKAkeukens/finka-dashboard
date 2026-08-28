'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EUROLINE_INBEGREPEN } from '@/lib/euroline-calc'

// Klein i-icoontje naast een Euroline-rekentool-veld — toont wat er in die
// categorie altijd al inbegrepen is bij de basisprijs (dus geen aparte optie
// in de rekentool). Zelfde component als voorheen in QuoteEditor.tsx, nu
// gedeeld zodat de Configurator 'm ook kan gebruiken.
export default function EurolineInfoButton({ category }: { category: keyof typeof EUROLINE_INBEGREPEN }) {
  const [open, setOpen] = useState(false)
  const items = EUROLINE_INBEGREPEN[category]
  if (!items.length) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Wat zit hier altijd al in?" className="text-[#9A948D] hover:text-[#1C1B19]">
        <Info size={13} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Altijd inbegrepen</DialogTitle>
          </DialogHeader>
          <ul className="text-sm text-[#1C1B19] space-y-1.5 list-disc pl-4">
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
