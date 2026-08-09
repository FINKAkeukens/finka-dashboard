'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { Appliance } from '@/lib/types'
import { TYPE_LABELS, formatPrice, getSpecSummary } from '@/lib/appliance-utils'

export default function AppliancePickerModal({
  open,
  onOpenChange,
  appliances,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appliances: Appliance[]
  onSelect: (appliance: Appliance) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = appliances.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.brand.toLowerCase().includes(q) ||
      a.model.toLowerCase().includes(q) ||
      TYPE_LABELS[a.type]?.toLowerCase().includes(q)
    )
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Apparaat uit bibliotheek toevoegen</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6560]" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op merk, model of type..."
            className="pl-8"
          />
        </div>

        <div className="overflow-y-auto -mx-6 px-6">
          {!filtered.length ? (
            <p className="text-sm text-[#6B6560] py-8 text-center">Geen apparatuur gevonden</p>
          ) : (
            <div className="divide-y divide-[#DDD8D2]">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    onSelect(a)
                    onOpenChange(false)
                    setSearch('')
                  }}
                  className="w-full flex items-center justify-between gap-4 py-3 text-left hover:bg-[#F7F5F2] transition-colors px-2 -mx-2 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1C1B19] truncate">
                      {a.brand} {a.model}
                    </p>
                    <p className="text-xs text-[#6B6560]">
                      {TYPE_LABELS[a.type]} · {getSpecSummary(a)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-[#1C1B19] shrink-0">{formatPrice(a.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
