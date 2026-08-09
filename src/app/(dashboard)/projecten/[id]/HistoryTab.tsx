interface AuditRow {
  id: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  action: string
  changed_by: string | null
  changed_at: string
}

const actionLabels: Record<string, string> = {
  create: 'Aangemaakt',
  update: 'Gewijzigd',
  archive: 'Gearchiveerd',
}

export default function HistoryTab({ entries }: { entries: AuditRow[] }) {
  if (!entries.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560]">Nog geen wijzigingen gelogd voor dit project.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
      {entries.map((entry) => (
        <div key={entry.id} className="px-5 py-3.5 text-sm flex items-start justify-between gap-4">
          <div>
            <span className="font-medium text-[#1C1B19]">{actionLabels[entry.action] ?? entry.action}</span>
            {entry.field_name && <span className="text-[#6B6560]"> — {entry.field_name}</span>}
            {entry.old_value !== null && entry.new_value !== null && (
              <p className="text-xs text-[#6B6560] mt-0.5">
                {entry.old_value} → {entry.new_value}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-[#6B6560]">{entry.changed_by ?? 'Onbekend'}</p>
            <p className="text-xs text-[#9A948D]">
              {new Date(entry.changed_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
