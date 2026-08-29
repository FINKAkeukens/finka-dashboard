// Nog geen data-invoer — dit zet alleen de standaard balans-indeling neer
// (Activa / Passiva) als vertrekpunt. Bedragen ontbreken nog: er is nu geen
// banksaldo-, debiteuren-, crediteuren- of vaste-activa-registratie in het
// systeem om dit automatisch te vullen.
const ACTIVA = [
  { label: 'Vaste activa', rows: ['Inventaris', 'Apparatuur (bedrijfsmiddelen)', 'Overige vaste activa'] },
  { label: 'Vlottende activa', rows: ['Debiteuren (openstaande facturen)', 'Voorraad', 'Bank & kas', 'Overige vlottende activa'] },
]

const PASSIVA = [
  { label: 'Eigen vermogen', rows: ['Aandelenkapitaal / inbreng', 'Ingehouden winst'] },
  { label: 'Vreemd vermogen', rows: ['Crediteuren (te betalen)', 'Belastingschulden (btw/vpb)', 'Leningen', 'Overige schulden'] },
]

export default function BalansPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1C1B19]">Balans</h1>
        <p className="text-sm text-[#6B6560] mt-1">
          Dit is nog alleen de standaardindeling — er is nog geen invoer voor banksaldo, debiteuren/crediteuren of vaste activa. Zeg het als je wilt dat ik dit uitbreidt met echte invoervelden.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
            <h2 className="text-sm font-medium text-[#1C1B19]">Activa</h2>
          </div>
          <div className="divide-y divide-[#DDD8D2]">
            {ACTIVA.map((group) => (
              <div key={group.label} className="px-5 py-3">
                <p className="text-xs font-medium text-[#6B6560] mb-2">{group.label}</p>
                <div className="space-y-1.5">
                  {group.rows.map((row) => (
                    <div key={row} className="flex items-center justify-between text-sm">
                      <span className="text-[#1C1B19]">{row}</span>
                      <span className="text-[#9A948D]">—</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[#DDD8D2] bg-[#F7F5F2] flex items-center justify-between">
            <span className="text-sm font-medium text-[#1C1B19]">Totaal activa</span>
            <span className="text-sm font-semibold text-[#1C1B19]">—</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#DDD8D2] bg-[#F7F5F2]">
            <h2 className="text-sm font-medium text-[#1C1B19]">Passiva</h2>
          </div>
          <div className="divide-y divide-[#DDD8D2]">
            {PASSIVA.map((group) => (
              <div key={group.label} className="px-5 py-3">
                <p className="text-xs font-medium text-[#6B6560] mb-2">{group.label}</p>
                <div className="space-y-1.5">
                  {group.rows.map((row) => (
                    <div key={row} className="flex items-center justify-between text-sm">
                      <span className="text-[#1C1B19]">{row}</span>
                      <span className="text-[#9A948D]">—</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[#DDD8D2] bg-[#F7F5F2] flex items-center justify-between">
            <span className="text-sm font-medium text-[#1C1B19]">Totaal passiva</span>
            <span className="text-sm font-semibold text-[#1C1B19]">—</span>
          </div>
        </div>
      </div>
    </div>
  )
}
