import { Label } from '@/components/ui/label'
import { CUSTOMER_TYPE_LABELS } from '@/lib/standard-documents'
import type { CustomerType } from '@/lib/types'

// Consument of bedrijf — bepaalt welke algemene voorwaarden (B2C/B2B) de
// klant in het portaal ziet. Gewone radio's met name="customer_type", zodat
// het via FormData meegaat zoals de andere velden.
export default function CustomerTypeField({ defaultValue = 'consument' }: { defaultValue?: CustomerType }) {
  return (
    <div className="space-y-1.5">
      <Label>Type klant</Label>
      <div className="flex gap-2">
        {(Object.keys(CUSTOMER_TYPE_LABELS) as CustomerType[]).map((type) => (
          <label
            key={type}
            className="flex-1 cursor-pointer rounded-lg border border-[#DDD8D2] bg-white px-3 py-2 text-sm text-[#1C1B19] transition-colors hover:border-[#C9A96E] has-[:checked]:border-[#1C1B19] has-[:checked]:bg-[#F7F5F2]"
          >
            <input type="radio" name="customer_type" value={type} defaultChecked={defaultValue === type} className="mr-2 accent-[#1C1B19]" />
            {CUSTOMER_TYPE_LABELS[type]}
          </label>
        ))}
      </div>
      <p className="text-xs text-[#9A948D]">Bepaalt welke algemene voorwaarden de klant in het portaal ziet.</p>
    </div>
  )
}
