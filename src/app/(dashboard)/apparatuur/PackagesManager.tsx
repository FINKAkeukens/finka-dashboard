'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Appliance, AppliancePackage } from '@/lib/types'
import { TYPE_LABELS, formatPrice, getSpecSummary, packageAppliances } from '@/lib/appliance-utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import AppliancePickerModal from '../projecten/[id]/offerte/AppliancePickerModal'

// Beheer van apparatuurpakketten op /apparatuur: aanmaken, hernoemen,
// apparaten kiezen (via dezelfde picker als in de Configurator) en
// verwijderen. Haalt de pakketten zelf op bij openen, zodat een pakket dat
// net via "Opslaan als pakket" in de selectiebalk is gemaakt meteen in de
// lijst staat.
export default function PackagesManager({ appliances }: { appliances: Appliance[] }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [packages, setPackages] = useState<AppliancePackage[] | null>(null)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  // Pakket waarvan de apparaten in de picker bewerkt worden — de beheer-
  // dialog gaat zolang dicht, zodat er nooit twee modals over elkaar liggen.
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    const { data, error: loadError } = await supabase
      .from('finka_appliance_packages')
      .select('*')
      .order('name')
    if (loadError) setError(loadError.message)
    else setPackages(data as AppliancePackage[])
  }

  function openManager() {
    setError('')
    setOpen(true)
    load()
  }

  async function createPackage() {
    const name = newName.trim()
    if (!name) return
    setError('')
    const { data, error: insError } = await supabase
      .from('finka_appliance_packages')
      .insert({ name, appliance_ids: [] })
      .select()
      .single()
    if (insError) {
      setError(insError.message)
      return
    }
    setNewName('')
    setPackages((prev) => [...(prev ?? []), data as AppliancePackage])
    // Nieuw pakket is nog leeg — meteen door naar apparaten kiezen.
    setEditingId((data as AppliancePackage).id)
    setOpen(false)
  }

  async function updatePackage(id: string, patch: Partial<Pick<AppliancePackage, 'name' | 'appliance_ids'>>) {
    setError('')
    setPackages((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? prev)
    const { error: updError } = await supabase
      .from('finka_appliance_packages')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updError) setError(updError.message)
  }

  async function deletePackage(pkg: AppliancePackage) {
    if (!confirm(`Pakket "${pkg.name}" verwijderen? De apparaten zelf blijven gewoon in de bibliotheek.`)) return
    setError('')
    const { error: delError } = await supabase.from('finka_appliance_packages').delete().eq('id', pkg.id)
    if (delError) setError(delError.message)
    else setPackages((prev) => prev?.filter((p) => p.id !== pkg.id) ?? prev)
  }

  const editingPackage = packages?.find((p) => p.id === editingId) ?? null

  return (
    <>
      <button
        type="button"
        onClick={openManager}
        className="flex items-center gap-1.5 bg-white text-[#1C1B19] text-sm px-4 py-2 rounded-lg border border-[#DDD8D2] hover:border-[#1C1B19] transition-colors"
      >
        <Package size={15} />
        Pakketten
      </button>

      <AppliancePickerModal
        open={editingPackage !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditingId(null)
            setOpen(true)
          }
        }}
        appliances={appliances}
        initialSelectedIds={editingPackage?.appliance_ids}
        onSelect={(selected) => {
          if (editingPackage) updatePackage(editingPackage.id, { appliance_ids: selected.map((a) => a.id) })
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Apparatuurpakketten</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[#6B6560] -mt-2">
            Een vaste set apparaten onder een eigen naam. In een project voeg je zo&apos;n pakket in de Configurator
            (Apparatuur of Accessoires) met één klik in z&apos;n geheel toe.
          </p>

          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createPackage() }}
              placeholder="Naam nieuw pakket, bijv. Siemens basis"
            />
            <Button onClick={createPackage} disabled={!newName.trim()}>
              <Plus size={14} className="mr-1.5" />
              Aanmaken
            </Button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {packages === null ? (
              <p className="text-sm text-[#6B6560] py-6 text-center">Laden...</p>
            ) : !packages.length ? (
              <p className="text-sm text-[#6B6560] py-6 text-center">Nog geen pakketten</p>
            ) : (
              packages.map((pkg) => {
                const items = packageAppliances(pkg, appliances)
                const total = items.reduce((sum, a) => sum + (a.price ?? 0), 0)
                return (
                  <div key={pkg.id} className="rounded-xl border border-[#DDD8D2] p-3">
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={pkg.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim()
                          if (name && name !== pkg.name) updatePackage(pkg.id, { name })
                          else e.target.value = pkg.name
                        }}
                        className="flex-1 min-w-0 text-sm font-medium text-[#1C1B19] bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                      />
                      <span className="text-sm font-medium text-[#1C1B19] shrink-0">{formatPrice(total)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditingId(pkg.id); setOpen(false) }}
                      >
                        <Pencil size={12} className="mr-1.5" />
                        Apparaten
                      </Button>
                      <button onClick={() => deletePackage(pkg)} title="Pakket verwijderen">
                        <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                      </button>
                    </div>
                    {items.length ? (
                      <ul className="mt-2 space-y-1 px-2">
                        {items.map((a) => (
                          <li key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate">
                              <span className="text-[#9A948D]">{TYPE_LABELS[a.type]} · </span>
                              <span className="text-[#1C1B19]">{a.brand} {a.model}</span>
                              <span className="text-[#9A948D]"> · {getSpecSummary(a)}</span>
                            </span>
                            <span className="text-[#6B6560] shrink-0">{formatPrice(a.price)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 px-2 text-xs text-[#9A948D]">Nog geen apparaten — klik op &ldquo;Apparaten&rdquo;</p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
