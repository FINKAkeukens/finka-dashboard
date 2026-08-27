'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Zet in één keer alle pending e-mails zonder herkende producten op
// "overgeslagen" — voorkomt dat je ze allemaal los moet openklappen om te
// zien dat er niks in zit. In batches, want een IN-clausule met 100+ UUID's
// in de query-string is niet iets om op te vertrouwen.
const BATCH_SIZE = 50

export default function BulkSkipEmptyButton({ ids }: { ids: string[] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleClick() {
    if (!confirm(`${ids.length} e-mails zonder herkende producten overslaan? Dit kun je terugvinden bij het tabblad "Overgeslagen".`)) return
    setLoading(true)
    setError('')

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE)
      const { error: updError } = await supabase.from('finka_email_queue').update({ status: 'skipped' }).in('id', batch)
      if (updError) {
        setError(updError.message)
        setLoading(false)
        return
      }
    }

    setLoading(false)
    router.refresh()
  }

  if (!ids.length) return null

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">Fout: {error}</span>}
      <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
        <SkipForward size={13} className="mr-1.5" />
        {loading ? 'Bezig...' : `${ids.length} zonder producten overslaan`}
      </Button>
    </div>
  )
}
