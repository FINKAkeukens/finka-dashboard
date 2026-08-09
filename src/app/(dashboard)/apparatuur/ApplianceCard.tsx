import type { Appliance, ApplianceSpecs } from '@/lib/types'
import Link from 'next/link'

const categoryBadge: Record<string, string> = {
  budget: 'bg-green-50 text-green-700 border-green-100',
  midden: 'bg-blue-50 text-blue-700 border-blue-100',
  premium: 'bg-amber-50 text-amber-700 border-amber-100',
}

function SpecItem({ label, value }: { label: string; value: string | number | boolean | undefined }) {
  if (value === undefined || value === null || value === '') return null
  const display = typeof value === 'boolean' ? (value ? 'Ja' : 'Nee') : String(value)
  return (
    <div className="flex justify-between text-xs py-1 border-b border-[#F0EDE9] last:border-0">
      <span className="text-[#6B6560]">{label}</span>
      <span className="font-medium text-[#1C1B19]">{display}</span>
    </div>
  )
}

function ApplianceSpecs({ type, specs }: { type: string; specs: ApplianceSpecs }) {
  if (type === 'kookplaat') return (
    <>
      <SpecItem label="Energietype" value={specs.energy_type} />
      <SpecItem label="Zones" value={specs.zones} />
      <SpecItem label="Vermogen" value={specs.watt ? `${specs.watt}W` : undefined} />
      <SpecItem label="Breedte" value={specs.width_cm ? `${specs.width_cm}cm` : undefined} />
    </>
  )
  if (type === 'oven' || type === 'combi-oven') return (
    <>
      <SpecItem label="Pyrolyse" value={specs.pyrolysis} />
      <SpecItem label="Stoom" value={specs.steam} />
      <SpecItem label="Inhoud" value={specs.capacity_liters ? `${specs.capacity_liters}L` : undefined} />
    </>
  )
  if (type === 'vaatwasser') return (
    <>
      <SpecItem label="Integreerbaar" value={specs.integration} />
      <SpecItem label="Geluid" value={specs.db_sound ? `${specs.db_sound}dB` : undefined} />
      <SpecItem label="Couverts" value={specs.capacity_sets} />
    </>
  )
  if (type === 'afzuigkap') return (
    <>
      <SpecItem label="Type" value={specs.afzuig_type} />
      <SpecItem label="Capaciteit" value={specs.capacity_m3h ? `${specs.capacity_m3h}m³/h` : undefined} />
    </>
  )
  if (type === 'koelkast') return (
    <>
      <SpecItem label="Inhoud" value={specs.fridge_liters ? `${specs.fridge_liters}L` : undefined} />
      <SpecItem label="Vriezer" value={specs.freezer} />
    </>
  )
  return null
}

export default function ApplianceCard({ appliance: a }: { appliance: Appliance }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 hover:border-[#C9A96E] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-medium text-[#1C1B19] text-sm">{a.brand}</p>
          <p className="text-xs text-[#6B6560]">{a.model}</p>
        </div>
        <div className="text-right">
          {a.price && (
            <p className="font-semibold text-[#1C1B19] text-sm">
              €{a.price.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}
            </p>
          )}
          {a.category && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${categoryBadge[a.category]}`}>
              {a.category.charAt(0).toUpperCase() + a.category.slice(1)}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-[#F0EDE9] pt-2">
        <ApplianceSpecs type={a.type} specs={a.specs ?? {}} />
      </div>

      {a.supplier && (
        <p className="text-xs text-[#6B6560] mt-2 pt-2 border-t border-[#F0EDE9]">
          via {a.supplier.name}
          {a.quote_date && ` · ${new Date(a.quote_date).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })}`}
        </p>
      )}
    </div>
  )
}
