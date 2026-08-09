'use client'

import { useState } from 'react'
import { StickyNote, X } from 'lucide-react'
import NotesPanel from './NotesPanel'

// Overal beschikbaar terwijl je aan een project werkt — ongeacht welke tab
// actief is — zodat je een aantekening kunt maken/bekijken zonder weg te
// navigeren van waar je mee bezig bent (bv. midden in de offerte-editor).
//
// Bewust GEEN modale Dialog: dat blokkeert de rest van het scherm en sluit
// bij een klik ernaast. Dit is een los zwevend paneel rechtsonder dat open
// blijft staan terwijl je in de rest van de pagina scrolt en werkt.
export default function ProjectNotesButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-[#1C1B19] text-white text-sm px-4 py-3 rounded-full shadow-lg hover:bg-[#2D2C2A] transition-colors"
      >
        <StickyNote size={16} />
        Notities
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-xl border border-[#DDD8D2] shadow-2xl flex flex-col max-h-[70vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDD8D2] shrink-0">
        <span className="text-sm font-medium text-[#1C1B19] flex items-center gap-2">
          <StickyNote size={14} />
          Aantekeningen
        </span>
        <button onClick={() => setOpen(false)} title="Sluiten">
          <X size={16} className="text-[#9A948D] hover:text-[#1C1B19]" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">
        <NotesPanel projectId={projectId} />
      </div>
    </div>
  )
}
