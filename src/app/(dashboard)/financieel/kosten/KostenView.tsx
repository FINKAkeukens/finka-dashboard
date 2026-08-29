'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import { formatPrice } from '@/lib/appliance-utils'
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from '@/lib/operating-expenses'
import { ASSET_CATEGORIES, assetCategoryLabel } from '@/lib/assets'
import { ASSIGNEE_OPTIONS } from '@/lib/planning'
import { selectOnFocus } from '@/lib/utils'
import { Asset, OperatingExpense } from '@/lib/types'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// Nieuwe regel start op vandaag als dat al in het juiste jaar valt, anders
// 1 januari van dat jaar — zodat 'm meteen in de sectie verschijnt waar de
// knop is aangeklikt, i.p.v. onder het verkeerde jaar te belanden.
function defaultDate(year: number) {
  const today = new Date()
  return today.getFullYear() === year ? today.toISOString().slice(0, 10) : `${year}-01-01`
}

interface RowItem {
  id: string
  category: string
  label: string | null
  bedrag: number
  betaald_door: string | null
  ingeboekt_moneybird: boolean
  verrekend: boolean
}

export default function KostenView({
  initialExpenses,
  initialAssets,
}: {
  initialExpenses: OperatingExpense[]
  initialAssets: Asset[]
}) {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<OperatingExpense[]>(initialExpenses)
  const [assets, setAssets] = useState<Asset[]>(initialAssets)
  const [error, setError] = useState('')

  const expensesGrandTotal = round2(expenses.reduce((sum, e) => sum + e.bedrag, 0))
  const assetsGrandTotal = round2(assets.reduce((sum, a) => sum + a.bedrag, 0))

  // --- Kosten (finka_operating_expenses) ---

  async function addExpense(year: number) {
    const { data, error: insError } = await supabase
      .from('finka_operating_expenses')
      .insert({ expense_date: defaultDate(year), category: EXPENSE_CATEGORIES[0], bedrag: 0 })
      .select()
      .single()
    if (insError) { setError(insError.message); return }
    setExpenses((prev) => [data as OperatingExpense, ...prev])
  }

  function updateLocalExpense(id: string, patch: Partial<OperatingExpense>) {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  async function saveExpense(expense: OperatingExpense) {
    const { error: updError } = await supabase
      .from('finka_operating_expenses')
      .update({
        expense_date: expense.expense_date,
        category: expense.category,
        label: expense.label,
        bedrag: expense.bedrag,
        betaald_door: expense.betaald_door,
        ingeboekt_moneybird: expense.ingeboekt_moneybird,
        verrekend: expense.verrekend,
        updated_at: new Date().toISOString(),
      })
      .eq('id', expense.id)
    if (updError) setError(updError.message)
  }

  async function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id))
    const { error: delError } = await supabase.from('finka_operating_expenses').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  // --- Activa (finka_assets) ---

  async function addAsset(year: number) {
    const { data, error: insError } = await supabase
      .from('finka_assets')
      .insert({ purchase_date: defaultDate(year), category: ASSET_CATEGORIES[0], bedrag: 0 })
      .select()
      .single()
    if (insError) { setError(insError.message); return }
    setAssets((prev) => [data as Asset, ...prev])
  }

  function updateLocalAsset(id: string, patch: Partial<Asset>) {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  async function saveAsset(asset: Asset) {
    const { error: updError } = await supabase
      .from('finka_assets')
      .update({
        purchase_date: asset.purchase_date,
        category: asset.category,
        label: asset.label,
        bedrag: asset.bedrag,
        betaald_door: asset.betaald_door,
        ingeboekt_moneybird: asset.ingeboekt_moneybird,
        verrekend: asset.verrekend,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asset.id)
    if (updError) setError(updError.message)
  }

  async function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id))
    const { error: delError } = await supabase.from('finka_assets').delete().eq('id', id)
    if (delError) setError(delError.message)
  }

  return (
    <div className="p-8 max-w-6xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Kosten</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Bedrijfskosten en vaste activa die niet aan één project hangen.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      <RegisterSection
        title="Kosten"
        description='Doorlopende bedrijfskosten (huur, personeel, ...) — het jaartotaal telt automatisch mee als "Bedrijfskosten" op de PNL-pagina.'
        grandTotal={expensesGrandTotal}
        items={expenses}
        getDate={(e) => e.expense_date}
        categories={EXPENSE_CATEGORIES}
        categoryLabel={expenseCategoryLabel}
        onAdd={addExpense}
        onDateChange={(item, value) => { updateLocalExpense(item.id, { expense_date: value }) }}
        onUpdateLocal={updateLocalExpense}
        onSave={saveExpense}
        onRemove={removeExpense}
      />

      <RegisterSection
        title="Activa"
        description="Vaste activa (laptops, inventaris, ...) — telt niet mee in de winst-en-verliesrekening, hoort op de balans."
        grandTotal={assetsGrandTotal}
        items={assets}
        getDate={(a) => a.purchase_date}
        categories={ASSET_CATEGORIES}
        categoryLabel={assetCategoryLabel}
        onAdd={addAsset}
        onDateChange={(item, value) => { updateLocalAsset(item.id, { purchase_date: value }) }}
        onUpdateLocal={updateLocalAsset}
        onSave={saveAsset}
        onRemove={removeAsset}
      />
    </div>
  )
}

// Generieke tabel-sectie, per jaar gegroepeerd — gebruikt voor zowel Kosten
// als Activa (zelfde kolommen: Product/dienst, Categorie, Bedrag, Datum,
// Betaald door, Moneybird, Verrekend). De aanroeper regelt de daadwerkelijke
// Supabase-tabel/velden; deze component werkt alleen met de gedeelde vorm.
function RegisterSection<T extends RowItem>({
  title,
  description,
  grandTotal,
  items,
  getDate,
  categories,
  categoryLabel,
  onAdd,
  onDateChange,
  onUpdateLocal,
  onSave,
  onRemove,
}: {
  title: string
  description: string
  grandTotal: number
  items: T[]
  getDate: (item: T) => string
  categories: readonly string[]
  categoryLabel: (c: string) => string
  onAdd: (year: number) => void
  onDateChange: (item: T, value: string) => void
  onUpdateLocal: (id: string, patch: Partial<T>) => void
  onSave: (item: T) => void
  onRemove: (id: string) => void
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from(new Set([currentYear, ...items.map((i) => new Date(getDate(i)).getFullYear())])).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1C1B19]">{title}</h2>
          <p className="text-xs text-[#6B6560] mt-0.5 max-w-2xl">{description}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#DDD8D2] px-5 py-3 text-right shrink-0">
          <span className="block text-xs text-[#6B6560]">Totaal (alle jaren)</span>
          <span className="text-xl font-semibold text-[#1C1B19]">{formatPrice(grandTotal)}</span>
        </div>
      </div>

      <div className="space-y-6">
        {years.map((year) => {
          const yearItems = items
            .filter((i) => new Date(getDate(i)).getFullYear() === year)
            .sort((a, b) => (getDate(a) < getDate(b) ? 1 : -1))
          const yearTotal = round2(yearItems.reduce((sum, i) => sum + i.bedrag, 0))

          return (
            <div key={year} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-[#1C1B19]">{year}</h3>
                <span className="text-xs text-[#6B6560]">{formatPrice(yearTotal)}</span>
              </div>

              <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-x-auto">
                {yearItems.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[#9A948D]">Nog geen regels voor dit jaar.</p>
                ) : (
                  <table className="text-sm min-w-[860px] w-full">
                    <thead>
                      <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-[#6B6560]">Product/dienst</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-[#6B6560] w-40">Categorie</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-[#6B6560] w-28">Bedrag</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-[#6B6560] w-32">Datum</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-[#6B6560] w-28">Betaald door</th>
                        <th className="text-center px-2 py-2.5 text-xs font-medium text-[#6B6560] w-16">Moneybird</th>
                        <th className="text-center px-2 py-2.5 text-xs font-medium text-[#6B6560] w-16">Verrekend</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDD8D2]">
                      {yearItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-1.5">
                            <input
                              value={item.label ?? ''}
                              placeholder="Omschrijving..."
                              onChange={(e) => onUpdateLocal(item.id, { label: e.target.value } as Partial<T>)}
                              onBlur={() => onSave(item)}
                              className="w-full min-w-[160px] text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-1.5 py-1 focus:outline-none focus:border-[#1C1B19]"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <select
                              value={item.category}
                              onChange={(e) => {
                                onUpdateLocal(item.id, { category: e.target.value } as Partial<T>)
                                onSave({ ...item, category: e.target.value })
                              }}
                              className="w-full text-xs bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-1.5 py-1 focus:outline-none focus:border-[#1C1B19]"
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>{categoryLabel(c)}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-sm text-[#9A948D]">€</span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.bedrag}
                                onChange={(e) => onUpdateLocal(item.id, { bedrag: Number(e.target.value) || 0 } as Partial<T>)}
                                onBlur={() => onSave(item)}
                                onFocus={selectOnFocus}
                                className="w-20 text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-1 py-1 focus:outline-none focus:border-[#1C1B19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="date"
                              value={getDate(item)}
                              onChange={(e) => onDateChange(item, e.target.value)}
                              onBlur={() => onSave(item)}
                              className="w-full text-xs text-[#6B6560] bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-1.5 py-1 focus:outline-none focus:border-[#1C1B19]"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <select
                              value={item.betaald_door ?? ''}
                              onChange={(e) => {
                                const value = e.target.value || null
                                onUpdateLocal(item.id, { betaald_door: value } as Partial<T>)
                                onSave({ ...item, betaald_door: value })
                              }}
                              className="w-full text-xs bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-1.5 py-1 focus:outline-none focus:border-[#1C1B19]"
                            >
                              <option value="">—</option>
                              {ASSIGNEE_OPTIONS.map((a) => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={item.ingeboekt_moneybird}
                                onCheckedChange={(checked) => {
                                  const value = checked === true
                                  onUpdateLocal(item.id, { ingeboekt_moneybird: value } as Partial<T>)
                                  onSave({ ...item, ingeboekt_moneybird: value })
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={item.verrekend}
                                onCheckedChange={(checked) => {
                                  const value = checked === true
                                  onUpdateLocal(item.id, { verrekend: value } as Partial<T>)
                                  onSave({ ...item, verrekend: value })
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => onRemove(item.id)} title="Regel verwijderen">
                              <Trash2 size={13} className="text-[#9A948D] hover:text-red-600" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="px-3 py-2.5 border-t border-[#DDD8D2] bg-[#F7F5F2]">
                  <Button variant="outline" size="sm" onClick={() => onAdd(year)}>+ Regel toevoegen</Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
