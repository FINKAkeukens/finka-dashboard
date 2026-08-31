'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { MilestoneAssignee, MilestoneStatus, ProjectMilestone } from '@/lib/types'
import {
  ASSIGNEE_OPTIONS,
  MILESTONE_LABELS,
  MILESTONE_ORDER,
  MILESTONE_STATUS_COLORS,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_ORDER,
  milestoneLabel,
  urgencyClass,
} from '@/lib/planning'

// Nieuwe 'custom'-rijen krijgen een tijdelijk id (prefix "temp-") zodat
// handleSave weet wat ge-insert vs. geüpdatet moet worden — zelfde patroon
// als DraftItem in QuoteEditor.tsx.
type DraftMilestone = ProjectMilestone & { isNew?: boolean }

export default function PlanningTab({
  projectId,
  milestones: initialMilestones,
}: {
  projectId: string
  milestones: ProjectMilestone[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [milestones, setMilestones] = useState<DraftMilestone[]>(
    [...initialMilestones].sort((a, b) => a.sort_order - b.sort_order)
  )
  const originalIds = useRef(new Set(initialMilestones.map((m) => m.id)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const fixedRows = MILESTONE_ORDER.map((key) => milestones.find((m) => m.milestone_key === key)).filter(
    (m): m is DraftMilestone => !!m
  )
  const customRows = milestones.filter((m) => m.milestone_key === 'custom').sort((a, b) => a.sort_order - b.sort_order)

  // Live bijgewerkt overzicht op daadwerkelijke datum — de invoerrijen
  // hieronder blijven bewust in vaste volgorde staan (anders springt een rij
  // weg terwijl je 'm invult), maar dit tabelletje laat meteen zien wat
  // chronologisch eerst komt zodra er datums ingevuld zijn.
  const chronological = milestones
    .filter((m) => !!m.date)
    .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())

  function update(id: string, patch: Partial<ProjectMilestone>) {
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function addCustom() {
    const maxSort = milestones.reduce((max, m) => Math.max(max, m.sort_order), -1)
    setMilestones((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        project_id: projectId,
        milestone_key: 'custom',
        sort_order: maxSort + 1,
        date: null,
        status: 'gepland',
        label: '',
        notes: null,
        assigned_to: null,
        created_at: '',
        updated_at: '',
        isNew: true,
      },
    ])
  }

  function removeMilestone(id: string) {
    setMilestones((prev) => prev.filter((m) => m.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    const currentIds = new Set(milestones.filter((m) => !m.isNew).map((m) => m.id))
    const toDelete = [...originalIds.current].filter((id) => !currentIds.has(id))
    const toInsert = milestones.filter((m) => m.isNew)
    const toUpdate = milestones.filter((m) => !m.isNew)

    if (toDelete.length) {
      const { error: delError } = await supabase.from('finka_project_milestones').delete().in('id', toDelete)
      if (delError) {
        setError(delError.message)
        setSaving(false)
        return
      }
    }

    let insertedRows: ProjectMilestone[] = []
    if (toInsert.length) {
      const { data, error: insError } = await supabase
        .from('finka_project_milestones')
        .insert(toInsert.map(({ id: _id, isNew: _isNew, created_at: _c, updated_at: _u, ...rest }) => rest))
        .select()
      if (insError) {
        setError(insError.message)
        setSaving(false)
        return
      }
      insertedRows = (data ?? []) as ProjectMilestone[]
    }

    for (const m of toUpdate) {
      const { error: updError } = await supabase
        .from('finka_project_milestones')
        .update({ date: m.date, status: m.status, notes: m.notes, label: m.label, assigned_to: m.assigned_to, updated_at: new Date().toISOString() })
        .eq('id', m.id)
      if (updError) {
        setError(updError.message)
        setSaving(false)
        return
      }
    }

    // Vervangt tijdelijke id's door de echte, door Supabase gegenereerde id's.
    // Zonder dit blijft een net-opgeslagen item op isNew:true staan, waardoor
    // een latere verwijdering van datzelfde item de delete-call op het
    // (niet-bestaande) temp-id uitvoert en dus niks doet in de database.
    let insertIdx = 0
    const finalMilestones = milestones.map((m) => (m.isNew ? { ...(insertedRows[insertIdx++] ?? m), isNew: false } : m))

    setMilestones(finalMilestones)
    originalIds.current = new Set(finalMilestones.map((m) => m.id))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  if (!fixedRows.length && !customRows.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">Nog geen mijlpalen gevonden — draai de laatste migratie in Supabase en herlaad deze pagina.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {chronological.length > 0 && (
        <div className="bg-white rounded-xl border border-[#DDD8D2] p-4">
          <h3 className="text-xs font-semibold text-[#9A948D] uppercase tracking-wider mb-3">Volgorde op datum</h3>
          <div className="space-y-2">
            {chronological.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span className="w-4 text-xs text-[#9A948D] tabular-nums shrink-0">{i + 1}.</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: MILESTONE_STATUS_COLORS[m.status] }} />
                <span className="text-[#1C1B19] font-medium truncate">{milestoneLabel(m)}</span>
                <span className={`ml-auto shrink-0 tabular-nums ${m.status === 'klaar' ? 'text-[#9A948D]' : urgencyClass(m.date as string)}`}>
                  {format(new Date(m.date as string), 'd MMM yyyy', { locale: nl })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
        {fixedRows.map((m, i) => (
          <div key={m.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-[#DDD8D2]' : ''}`}>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MILESTONE_STATUS_COLORS[m.status] }} />
            <Input
              placeholder={MILESTONE_LABELS[m.milestone_key as keyof typeof MILESTONE_LABELS]}
              className="h-9 w-56 shrink-0 font-medium"
              value={m.label ?? ''}
              onChange={(e) => update(m.id, { label: e.target.value })}
            />
            <Input
              type="date"
              className="h-9 w-40"
              value={m.date ?? ''}
              onChange={(e) => update(m.id, { date: e.target.value || null })}
            />
            <select
              value={m.status}
              onChange={(e) => update(m.id, { status: e.target.value as MilestoneStatus })}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              {MILESTONE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={m.assigned_to ?? ''}
              onChange={(e) => update(m.id, { assigned_to: (e.target.value || null) as MilestoneAssignee | null })}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">— Niemand —</option>
              {ASSIGNEE_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Input
              placeholder="Notitie (optioneel)"
              className="h-9 flex-1"
              value={m.notes ?? ''}
              onChange={(e) => update(m.id, { notes: e.target.value || null })}
            />
            <button onClick={() => removeMilestone(m.id)} title="Mijlpaal verwijderen (geldt niet voor toekomstige projecten)">
              <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
            </button>
          </div>
        ))}

        {customRows.map((m) => (
          <div key={m.id} className="flex items-center gap-4 px-5 py-4 border-t border-[#DDD8D2]">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MILESTONE_STATUS_COLORS[m.status] }} />
            <Input
              placeholder="Naam van dit item"
              className="h-9 w-56 shrink-0"
              value={m.label ?? ''}
              onChange={(e) => update(m.id, { label: e.target.value })}
            />
            <Input
              type="date"
              className="h-9 w-40"
              value={m.date ?? ''}
              onChange={(e) => update(m.id, { date: e.target.value || null })}
            />
            <select
              value={m.status}
              onChange={(e) => update(m.id, { status: e.target.value as MilestoneStatus })}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              {MILESTONE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              value={m.assigned_to ?? ''}
              onChange={(e) => update(m.id, { assigned_to: (e.target.value || null) as MilestoneAssignee | null })}
              className="h-9 px-2.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            >
              <option value="">— Niemand —</option>
              {ASSIGNEE_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Input
              placeholder="Notitie (optioneel)"
              className="h-9 flex-1"
              value={m.notes ?? ''}
              onChange={(e) => update(m.id, { notes: e.target.value || null })}
            />
            <button onClick={() => removeMilestone(m.id)} title="Item verwijderen">
              <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-3 px-5 py-4 border-t border-[#DDD8D2] bg-[#F7F5F2]">
          <Button variant="outline" size="sm" onClick={addCustom}>
            <Plus size={13} className="mr-1.5" />
            Item toevoegen
          </Button>
          <div className="flex-1" />
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</Button>
          {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  )
}
