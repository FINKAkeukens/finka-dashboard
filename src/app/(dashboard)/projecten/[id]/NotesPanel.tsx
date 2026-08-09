'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { ProjectNote } from '@/lib/types'

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Self-fetching zodat dit component zowel in de volle "Notities"-tab als in
// het zwevende snel-openen-paneel (ProjectNotesButton) gebruikt kan worden,
// zonder dat elke pagina van het project de notities server-side hoeft op
// te halen.
export default function NotesPanel({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('finka_project_notes')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setNotes((data ?? []) as ProjectNote[])
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId, supabase])

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: insError } = await supabase
      .from('finka_project_notes')
      .insert({ project_id: projectId, body: text.trim(), created_by: user?.email ?? null })
      .select()
      .single()

    if (insError) {
      setError(insError.message)
    } else {
      setNotes((prev) => [data as ProjectNote, ...prev])
      setText('')
    }
    setSaving(false)
  }

  async function handleDelete(noteId: string) {
    setError('')
    const { error: delError } = await supabase.from('finka_project_notes').delete().eq('id', noteId)
    if (delError) {
      setError(delError.message)
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nieuwe aantekening..."
          rows={3}
          className="w-full text-sm px-3 py-2 border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleAdd} disabled={saving || !text.trim()}>
            {saving ? 'Toevoegen...' : 'Toevoegen'}
          </Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#6B6560] px-1">Laden...</p>
      ) : !notes.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Nog geen aantekeningen voor dit project.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
          {notes.map((note) => (
            <div key={note.id} className="px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-[#1C1B19] whitespace-pre-wrap">{note.body}</p>
                <p className="text-xs text-[#9A948D] mt-1.5">
                  {formatTimestamp(note.created_at)}
                  {note.created_by ? ` · ${note.created_by}` : ''}
                </p>
              </div>
              <button onClick={() => handleDelete(note.id)} title="Aantekening verwijderen" className="shrink-0">
                <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
