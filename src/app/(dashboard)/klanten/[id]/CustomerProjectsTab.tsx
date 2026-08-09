import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Project } from '@/lib/types'

export default function CustomerProjectsTab({ customerId, projects }: { customerId: string; projects: Project[] }) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <Link
          href={`/projecten/nieuw?customer_id=${customerId}`}
          className="flex items-center gap-1.5 bg-[#1C1B19] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#2D2C2A] transition-colors"
        >
          <Plus size={13} />
          Nieuw project
        </Link>
      </div>

      {!projects.length ? (
        <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
          <p className="text-sm text-[#6B6560]">Nog geen projecten voor deze klant.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
          {projects.map((p) => (
            <Link key={p.id} href={`/projecten/${p.id}`} className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-[#F7F5F2] transition-colors">
              <div>
                <span className="font-medium text-[#1C1B19]">{p.title}</span>
                <span className="text-xs font-mono text-[#6B6560] ml-2">{p.reference_number}</span>
              </div>
              {p.status && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full border"
                  style={{ borderColor: p.status.color, color: p.status.color }}
                >
                  {p.status.label}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
