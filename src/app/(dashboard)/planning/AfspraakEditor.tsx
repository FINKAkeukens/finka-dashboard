'use client'

import { useState } from 'react'
import { Check, Copy, Trash2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MILESTONE_LABELS, MILESTONE_ORDER } from '@/lib/planning'
import { MilestoneKey } from '@/lib/types'
import { PlanningEntry, PlanningProjectInfo } from '@/lib/planning-overzicht'

export interface AfspraakValues {
  projectId: string
  milestoneKey: MilestoneKey
  label: string
  date: string
  startTime: string
  endTime: string
  assignee: string
  notes: string
  inGoogle: boolean
  withMeet: boolean
  inviteCustomer: boolean
}

const OTHER = 'custom'
const fieldClass = 'h-9 px-2 text-sm text-[#1C1B19] bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]'

// Nieuwe afspraak (entry = null) of een bestaande bewerken. Opslaan,
// afronden en verwijderen regelt PlanningOverzicht, ook het doorzetten naar
// Google Agenda.
export default function AfspraakEditor({
  entry,
  projects,
  names,
  calendarAccount,
  saving,
  onSave,
  onCancel,
  onDone,
  onDelete,
}: {
  entry: PlanningEntry | null
  projects: PlanningProjectInfo[]
  names: string[]
  calendarAccount: string | null
  saving: boolean
  onSave: (values: AfspraakValues) => void
  onCancel: () => void
  onDone?: () => void
  onDelete?: () => void
}) {
  const a = entry?.agenda
  const [v, setV] = useState<AfspraakValues>({
    projectId: entry?.project?.id ?? '',
    milestoneKey: OTHER,
    label: entry?.label ?? '',
    date: entry?.date ?? '',
    startTime: a?.startTime ?? '',
    endTime: a?.endTime ?? '',
    assignee: entry?.assignee ?? '',
    notes: entry?.notes ?? '',
    // Nieuwe afspraken gaan standaard naar Google Agenda als die gekoppeld is.
    inGoogle: entry ? !!a?.inGoogle : !!calendarAccount,
    withMeet: !!a?.withMeet,
    inviteCustomer: !!a?.inviteCustomer,
  })
  const [copied, setCopied] = useState(false)
  const set = (patch: Partial<AfspraakValues>) => setV((prev) => ({ ...prev, ...patch }))

  const project = projects.find((p) => p.id === v.projectId)
  const customerEmail = project?.customerEmail ?? null
  const label = v.milestoneKey === OTHER ? v.label.trim() : MILESTONE_LABELS[v.milestoneKey as Exclude<MilestoneKey, 'custom'>]
  const canSave = !!v.projectId && !!label && (!v.inGoogle || !!v.date)

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        if (canSave) onSave({ ...v, label, inviteCustomer: v.inviteCustomer && !!customerEmail })
      }}
      className="bg-white rounded-xl border border-[#C9A96E] p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#1C1B19]">{entry ? 'Afspraak bewerken' : 'Nieuwe afspraak'}</h3>
        <button type="button" onClick={onCancel} aria-label="Sluiten" className="p-1 text-[#6B6560] hover:text-[#1C1B19]">
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        {entry ? (
          <label className="flex-[3_1_240px] flex flex-col gap-1 text-xs text-[#6B6560]">
            Afspraak
            <Input value={v.label} onChange={(e) => set({ label: e.target.value })} className="h-9" required />
          </label>
        ) : (
          <>
            <label className="flex-[2_1_220px] flex flex-col gap-1 text-xs text-[#6B6560]">
              Project
              <select required value={v.projectId} onChange={(e) => set({ projectId: e.target.value })} className={fieldClass}>
                <option value="">— Kies —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.referenceNumber} · {p.customerName}</option>
                ))}
              </select>
            </label>
            <label className="flex-[1_1_190px] flex flex-col gap-1 text-xs text-[#6B6560]">
              Soort afspraak
              <select value={v.milestoneKey} onChange={(e) => set({ milestoneKey: e.target.value as MilestoneKey })} className={fieldClass}>
                {MILESTONE_ORDER.map((k) => (
                  <option key={k} value={k}>{MILESTONE_LABELS[k]}</option>
                ))}
                <option value={OTHER}>Anders…</option>
              </select>
            </label>
            {v.milestoneKey === OTHER && (
              <label className="flex-[2_1_200px] flex flex-col gap-1 text-xs text-[#6B6560]">
                Naam
                <Input autoFocus value={v.label} onChange={(e) => set({ label: e.target.value })} placeholder="Bijv. Showroombezoek" className="h-9" required />
              </label>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Datum
          <Input type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} className="h-9 w-40" required={v.inGoogle} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Van
          <Input type="time" value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} className="h-9 w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Tot
          <Input type="time" value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} className="h-9 w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#6B6560]">
          Toegewezen aan
          <select value={v.assignee} onChange={(e) => set({ assignee: e.target.value })} className={`${fieldClass} w-44`}>
            <option value="">Niemand</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex-[1_1_200px] flex flex-col gap-1 text-xs text-[#6B6560]">
          Notitie
          <Input value={v.notes} onChange={(e) => set({ notes: e.target.value })} className="h-9" />
        </label>
      </div>
      {!v.startTime && <p className="text-xs text-[#9A948D]">Zonder tijd wordt het een hele-dag-afspraak.</p>}

      <div className="rounded-lg bg-[#FBF7EF] border border-[#EFE4CF] px-3 py-2.5 space-y-2">
        <label className="flex items-center gap-2 text-sm text-[#1C1B19]">
          <input
            type="checkbox"
            checked={v.inGoogle}
            disabled={!calendarAccount}
            onChange={(e) => set({ inGoogle: e.target.checked })}
            className="w-4 h-4 accent-[#1C1B19]"
          />
          In Google Agenda zetten
          {calendarAccount ? (
            <span className="text-xs text-[#6B6560]">({calendarAccount})</span>
          ) : (
            <a href="/api/google-calendar/auth" className="text-xs text-[#8A6A2E] hover:underline">eerst Google Agenda koppelen</a>
          )}
        </label>
        {v.inGoogle && (
          <div className="flex flex-col gap-2 pl-6">
            <label className="flex items-center gap-2 text-sm text-[#1C1B19]">
              <input type="checkbox" checked={v.withMeet} onChange={(e) => set({ withMeet: e.target.checked })} className="w-4 h-4 accent-[#1C1B19]" />
              Google Meet-link toevoegen
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1C1B19]">
              <input
                type="checkbox"
                checked={v.inviteCustomer && !!customerEmail}
                disabled={!customerEmail}
                onChange={(e) => set({ inviteCustomer: e.target.checked })}
                className="w-4 h-4 accent-[#1C1B19]"
              />
              Uitnodiging naar de klant sturen
              <span className="text-xs text-[#6B6560]">
                {customerEmail ? `(${customerEmail})` : project ? '(geen e-mailadres bij deze klant)' : ''}
              </span>
            </label>
          </div>
        )}
        {a?.meetLink && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Video size={14} className="text-[#8A6A2E]" />
            <a href={a.meetLink} target="_blank" rel="noopener noreferrer" className="text-sm text-[#8A6A2E] hover:underline break-all">{a.meetLink}</a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(a.meetLink!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
              className="inline-flex items-center gap-1 h-7 px-2 text-xs border border-[#DDD8D2] rounded-md bg-white hover:border-[#1C1B19]"
            >
              {copied ? <Check size={12} className="text-green-700" /> : <Copy size={12} />}
              {copied ? 'Gekopieerd' : 'Kopiëren'}
            </button>
          </div>
        )}
        {a?.googleError && <p className="text-xs text-red-600">Google Agenda: {a.googleError}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className="h-9" disabled={saving || !canSave}>
          {saving ? 'Bezig...' : 'Opslaan'}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={onCancel}>Annuleren</Button>
        {onDone && (
          <Button type="button" size="sm" variant="outline" className="h-9" onClick={onDone} disabled={saving}>
            <Check size={13} /> Afgerond
          </Button>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={saving} className="ml-auto inline-flex items-center gap-1 text-xs text-[#9A948D] hover:text-red-600">
            <Trash2 size={13} /> Verwijderen
          </button>
        )}
      </div>
    </form>
  )
}
