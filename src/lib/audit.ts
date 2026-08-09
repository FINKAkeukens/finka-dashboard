import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction = 'create' | 'update' | 'archive'

interface AuditEntry {
  tableName: string
  recordId: string
  fieldName?: string
  oldValue?: unknown
  newValue?: unknown
  action: AuditAction
  changedBy?: string | null
}

function toLogValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

// Schrijft één regel naar finka_audit_log. Falen van het loggen mag een
// mutatie nooit blokkeren, dus fouten worden hier alleen gelogd naar console.
export async function logAudit(supabase: SupabaseClient, entry: AuditEntry) {
  const { error } = await supabase.from('finka_audit_log').insert({
    table_name: entry.tableName,
    record_id: entry.recordId,
    field_name: entry.fieldName ?? null,
    old_value: toLogValue(entry.oldValue),
    new_value: toLogValue(entry.newValue),
    action: entry.action,
    changed_by: entry.changedBy ?? null,
  })

  if (error) {
    console.error('Kon audit-log niet wegschrijven:', error)
  }
}

// Vergelijkt twee platte objecten en logt één regel per gewijzigd veld.
// Gebruik voor 'update'-acties op formulieren (bv. project/offerte bewerken).
export async function logFieldChanges(
  supabase: SupabaseClient,
  tableName: string,
  recordId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedBy?: string | null
) {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const field of fields) {
    const oldValue = before[field]
    const newValue = after[field]
    if (oldValue === newValue) continue
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue

    await logAudit(supabase, {
      tableName,
      recordId,
      fieldName: field,
      oldValue,
      newValue,
      action: 'update',
      changedBy,
    })
  }
}
