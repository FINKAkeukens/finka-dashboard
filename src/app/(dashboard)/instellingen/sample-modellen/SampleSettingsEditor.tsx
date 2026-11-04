'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SampleModel, Supplier } from '@/lib/types'
import { SAMPLE_FIELDS, SampleFieldKey, SampleSettings, sampleFieldLabel } from '@/lib/samples'
import SampleModelsEditor from './SampleModelsEditor'

type Tab = 'velden' | 'soorten' | 'leveranciers' | 'modellen' | 'maten' | 'materialen'

// Hoe vaak een waarde voorkomt in de bestaande samples (en modellen), om te
// laten zien wat een wijziging raakt en verwijderen in gebruik te blokkeren.
export interface SampleUsage {
  categories: Record<string, number>
  suppliers: Record<string, number>
  sizes: Record<string, number>
  materials: Record<string, number>
}

const inputClass =
  'w-full h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded focus:outline-none focus:border-[#1C1B19]'

function DeleteButton({ label, onClick, disabled, title }: { label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className="p-1 text-[#9A948D] hover:text-red-600 disabled:opacity-30 disabled:hover:text-[#9A948D]"
    >
      <Trash2 size={14} />
    </button>
  )
}

function usageText(n: number | undefined) {
  if (!n) return 'niet gebruikt'
  return n === 1 ? '1 sample' : `${n} samples`
}

// Instellingen → Sample instellingen: alles van het sampleformulier op één
// plek. Wijzigingen slaan direct op zodra je uit een veld klikt.
export default function SampleSettingsEditor({
  settings: initialSettings,
  models,
  suppliers,
  usage,
}: {
  settings: SampleSettings
  models: SampleModel[]
  suppliers: Supplier[]
  usage: SampleUsage
}) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('velden')
  const [settings, setSettings] = useState(initialSettings)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const label = (key: SampleFieldKey) => sampleFieldLabel(settings, key)

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError('')
    setSaved(false)
    const { error } = await action
    setBusy(false)
    if (error) {
      setError(error.message)
      return false
    }
    setSaved(true)
    router.refresh()
    return true
  }

  async function saveSettings(patch: Partial<SampleSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    return run(
      supabase.from('finka_sample_settings').upsert({ id: 1, ...next, updated_at: new Date().toISOString() })
    )
  }

  // ---- Velden ----
  function setFieldText(kind: 'labels' | 'placeholders', key: SampleFieldKey, value: string) {
    const field = SAMPLE_FIELDS.find((f) => f.key === key)!
    const current = { ...settings[kind] }
    const fallback = kind === 'labels' ? field.label : field.placeholder ?? ''
    const trimmed = value.trim()
    if (kind === 'labels' && !trimmed) return
    if ((current[key] ?? fallback) === trimmed) return
    if (trimmed === fallback) delete current[key]
    else current[key] = trimmed
    saveSettings({ [kind]: current })
  }

  // ---- Soorten ----
  function renameCategory(key: string, value: string) {
    const trimmed = value.trim()
    const current = settings.categories.find((c) => c.key === key)
    if (!trimmed || !current || current.label === trimmed) return
    saveSettings({ categories: settings.categories.map((c) => (c.key === key ? { ...c, label: trimmed } : c)) })
  }

  async function addCategory(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return false
    if (settings.categories.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" staat al in de lijst.`)
      return false
    }
    const key = `soort-${crypto.randomUUID().slice(0, 8)}`
    return saveSettings({ categories: [...settings.categories, { key, label: trimmed }] })
  }

  function removeCategory(key: string) {
    if (settings.categories.length <= 1) return
    saveSettings({ categories: settings.categories.filter((c) => c.key !== key) })
  }

  // ---- Maten en materialen: de waarde staat als tekst in de samples, dus
  // hernoemen werkt de bestaande samples ook bij. ----
  async function renameValue(kind: 'sizes' | 'materials', from: string, value: string) {
    const to = value.trim()
    if (!to || to === from) return
    if (settings[kind].some((v) => v !== from && v.toLowerCase() === to.toLowerCase())) {
      setError(`"${to}" staat al in de lijst.`)
      return
    }
    const column = kind === 'sizes' ? 'size' : 'material'
    const ok = await run(supabase.from('finka_samples').update({ [column]: to }).eq(column, from))
    if (!ok) return
    const patch: Partial<SampleSettings> = { [kind]: settings[kind].map((v) => (v === from ? to : v)) }
    if (kind === 'materials' && settings.veneer_material === from) patch.veneer_material = to
    saveSettings(patch)
  }

  async function addValue(kind: 'sizes' | 'materials', value: string) {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (settings[kind].some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" staat al in de lijst.`)
      return false
    }
    return saveSettings({ [kind]: [...settings[kind], trimmed] })
  }

  function removeValue(kind: 'sizes' | 'materials', value: string) {
    const patch: Partial<SampleSettings> = { [kind]: settings[kind].filter((v) => v !== value) }
    if (kind === 'materials' && settings.veneer_material === value) patch.veneer_material = null
    saveSettings(patch)
  }

  function moveValue(kind: 'sizes' | 'materials', index: number, dir: -1 | 1) {
    const list = [...settings[kind]]
    const target = index + dir
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    saveSettings({ [kind]: list })
  }

  // ---- Leveranciers (gedeelde lijst met Leveranciers) ----
  function renameSupplier(s: Supplier, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === s.name) return
    run(supabase.from('finka_suppliers').update({ name: trimmed }).eq('id', s.id))
  }

  async function addSupplier(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return false
    if (suppliers.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" staat al in de lijst.`)
      return false
    }
    return run(supabase.from('finka_suppliers').insert({ name: trimmed }))
  }

  const tabs: { key: Tab; label: string; count: number | null; note: string }[] = [
    { key: 'velden', label: 'Velden', count: SAMPLE_FIELDS.length, note: 'De namen van de velden en de voorbeeldtekst die in een leeg veld staat.' },
    { key: 'soorten', label: label('category'), count: settings.categories.length, note: `De keuzes bij "${label('category')}". Hernoemen verandert ook de bestaande samples mee.` },
    { key: 'leveranciers', label: label('supplier_id'), count: suppliers.length, note: 'Dezelfde lijst als onder Leveranciers. Daar vul je ook contactgegevens in of verwijder je een leverancier.' },
    { key: 'modellen', label: label('model'), count: models.length, note: `Modellen per ${label('supplier_id').toLowerCase()} en ${label('category').toLowerCase()}. Dan wordt ${label('model')} een keuzelijst en vult de PG zich vanzelf in.` },
    { key: 'maten', label: label('size'), count: settings.sizes.length, note: `De keuzes bij "${label('size')}". Hernoemen past de bestaande samples mee aan.` },
    { key: 'materialen', label: label('material'), count: settings.materials.length, note: `De keuzes bij "${label('material')}". Via "Anders…" ingevuld komt hier vanzelf bij. Hernoemen past de bestaande samples mee aan.` },
  ]
  const tabInfo = tabs.find((t) => t.key === tab)!

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-5 items-start">
        <nav aria-label="Onderdelen" className="w-full sm:w-56 shrink-0 bg-white border border-[#DDD8D2] rounded-xl p-2 flex flex-col gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setError('') }}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                tab === t.key ? 'bg-[#1C1B19] text-white' : 'text-[#1C1B19] hover:bg-[#F7F5F2]'
              )}
            >
              <span className="truncate">{t.label}</span>
              {t.count !== null && <span className={cn('text-xs', tab === t.key ? 'text-[#DDD8D2]' : 'text-[#6B6560]')}>{t.count}</span>}
            </button>
          ))}
        </nav>

        <section className="flex-1 min-w-0 basis-[560px] min-h-[480px] flex flex-col bg-white border border-[#DDD8D2] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DDD8D2]">
            <h2 className="text-base font-semibold text-[#1C1B19]">{tabInfo.label}</h2>
            <p className="text-xs text-[#6B6560] mt-0.5">{tabInfo.note}</p>
          </div>

          {tab === 'velden' && (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm min-w-[640px]">
                <colgroup>
                  <col className="w-[180px]" />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-[#FAF9F7] text-[11px] uppercase tracking-wide text-[#6B6560]">
                    <th className="text-left font-medium px-5 py-2.5">Standaard</th>
                    <th className="text-left font-medium px-2 py-2.5">Naam in het formulier</th>
                    <th className="text-left font-medium px-2 pr-5 py-2.5">Voorbeeldtekst</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_FIELDS.map((f) => (
                    <tr key={f.key} className="border-t border-[#EFEBE6]">
                      <td className="px-5 py-2 text-xs text-[#6B6560]">{f.label}</td>
                      <td className="px-2 py-2">
                        <input
                          key={`l-${f.key}-${label(f.key)}`}
                          defaultValue={label(f.key)}
                          aria-label={`Naam van ${f.label}`}
                          onBlur={(e) => setFieldText('labels', f.key, e.target.value)}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 pr-5 py-2">
                        {f.placeholder !== undefined ? (
                          <input
                            key={`p-${f.key}-${settings.placeholders[f.key] ?? ''}`}
                            defaultValue={settings.placeholders[f.key] ?? f.placeholder}
                            aria-label={`Voorbeeldtekst van ${f.label}`}
                            placeholder="Geen voorbeeldtekst"
                            onBlur={(e) => setFieldText('placeholders', f.key, e.target.value)}
                            className={inputClass}
                          />
                        ) : (
                          <span className="text-xs text-[#9A948D]">{f.key === 'photo' ? 'Upload' : 'Keuzelijst, zie het tabblad'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'soorten' && (
            <ValueList
              rows={settings.categories.map((c) => ({ id: c.key, value: c.label, usage: usage.categories[c.key] }))}
              onRename={(id, v) => renameCategory(id, v)}
              onRemove={(id) => removeCategory(id)}
              canRemove={(row) => !row.usage && settings.categories.length > 1}
              removeBlockedTitle="In gebruik bij samples of modellen, kan niet weg"
              onAdd={addCategory}
              addPlaceholder={`Nieuwe ${label('category').toLowerCase()}`}
              busy={busy}
            />
          )}

          {tab === 'leveranciers' && (
            <ValueList
              rows={suppliers.map((s) => ({ id: s.id, value: s.name, usage: usage.suppliers[s.id] }))}
              onRename={(id, v) => { const s = suppliers.find((x) => x.id === id); if (s) renameSupplier(s, v) }}
              extra={(row) => (
                <Link href={`/leveranciers/${row.id}`} className="text-xs text-[#8A6A2E] hover:underline whitespace-nowrap">
                  Details
                </Link>
              )}
              onAdd={addSupplier}
              addPlaceholder={`Nieuwe ${label('supplier_id').toLowerCase()}`}
              busy={busy}
            />
          )}

          {tab === 'modellen' && (
            <div className="p-5">
              <SampleModelsEditor models={models} suppliers={suppliers} categories={settings.categories} />
            </div>
          )}

          {(tab === 'maten' || tab === 'materialen') && (() => {
            const kind = tab === 'maten' ? 'sizes' : 'materials'
            const counts = kind === 'sizes' ? usage.sizes : usage.materials
            return (
              <>
                {kind === 'materials' && (
                  <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#EFEBE6] bg-[#FBF7EF]">
                    <label htmlFor="veneer_material" className="text-sm text-[#1C1B19]">
                      Extra veld &ldquo;{label('veneer_execution')}&rdquo; tonen bij
                    </label>
                    <select
                      id="veneer_material"
                      value={settings.veneer_material ?? ''}
                      onChange={(e) => saveSettings({ veneer_material: e.target.value || null })}
                      className="h-8 px-2 text-sm bg-white border border-[#DDD8D2] rounded focus:outline-none focus:border-[#1C1B19]"
                    >
                      <option value="">geen materiaal</option>
                      {settings.materials.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                <ValueList
                  rows={settings[kind].map((v) => ({ id: v, value: v, usage: counts[v] }))}
                  onRename={(id, v) => renameValue(kind, id, v)}
                  onRemove={(id) => removeValue(kind, id)}
                  canRemove={() => true}
                  removeTitle={(row) => row.usage ? `Uit de lijst halen. ${usageText(row.usage)} houden deze waarde.` : 'Uit de lijst halen'}
                  onMove={(index, dir) => moveValue(kind, index, dir)}
                  onAdd={(v) => addValue(kind, v)}
                  addPlaceholder={`Nieuwe ${label(kind === 'sizes' ? 'size' : 'material').toLowerCase()}`}
                  busy={busy}
                />
              </>
            )
          })()}
        </section>
      </div>

      <div className="min-h-5 text-sm">
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : saved ? (
          <p className="text-[#6B6560]">Opgeslagen.</p>
        ) : (
          <p className="text-xs text-[#9A948D]">Wijzigingen worden opgeslagen zodra je uit een veld klikt.</p>
        )}
      </div>
    </div>
  )
}

interface ValueRow {
  id: string
  value: string
  usage?: number
}

// Bewerkbare lijst: naam aanpassen (opslaan bij uit het veld klikken),
// verwijderen, optioneel volgorde, en onderaan een regel om toe te voegen.
function ValueList({
  rows,
  onRename,
  onRemove,
  canRemove,
  removeBlockedTitle,
  removeTitle,
  onMove,
  extra,
  onAdd,
  addPlaceholder,
  busy,
}: {
  rows: ValueRow[]
  onRename: (id: string, value: string) => void
  onRemove?: (id: string) => void
  canRemove?: (row: ValueRow) => boolean
  removeBlockedTitle?: string
  removeTitle?: (row: ValueRow) => string
  onMove?: (index: number, dir: -1 | 1) => void
  extra?: (row: ValueRow) => React.ReactNode
  onAdd: (value: string) => Promise<boolean>
  addPlaceholder: string
  busy: boolean
}) {
  const [newValue, setNewValue] = useState('')

  return (
    <div className="flex-1 flex flex-col">
      <ul className="divide-y divide-[#EFEBE6]">
        {rows.map((row, index) => {
          const removable = !!onRemove && (canRemove?.(row) ?? true)
          return (
            <li key={`${row.id}-${row.value}`} className="flex items-center gap-3 px-5 py-2">
              {onMove && (
                <span className="flex flex-col -my-1">
                  <button type="button" onClick={() => onMove(index, -1)} disabled={busy || index === 0} aria-label="Omhoog" className="text-[10px] leading-none px-1 text-[#9A948D] hover:text-[#1C1B19] disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => onMove(index, 1)} disabled={busy || index === rows.length - 1} aria-label="Omlaag" className="text-[10px] leading-none px-1 text-[#9A948D] hover:text-[#1C1B19] disabled:opacity-30">▼</button>
                </span>
              )}
              <input
                defaultValue={row.value}
                aria-label="Naam"
                onBlur={(e) => onRename(row.id, e.target.value)}
                className={cn(inputClass, 'flex-1 min-w-0')}
              />
              <span className="w-24 text-right text-xs text-[#6B6560] shrink-0">{usageText(row.usage)}</span>
              {extra?.(row)}
              {onRemove && (
                <DeleteButton
                  label={`${row.value} verwijderen`}
                  onClick={() => onRemove(row.id)}
                  disabled={busy || !removable}
                  title={removable ? removeTitle?.(row) : removeBlockedTitle}
                />
              )}
            </li>
          )
        })}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (await onAdd(newValue)) setNewValue('')
        }}
        className="mt-auto flex items-center gap-2 px-5 py-3 border-t border-[#DDD8D2] bg-[#FAF9F7]"
      >
        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={addPlaceholder} className="h-8 flex-1" />
        <Button type="submit" size="sm" disabled={busy || !newValue.trim()}>Toevoegen</Button>
      </form>
    </div>
  )
}
