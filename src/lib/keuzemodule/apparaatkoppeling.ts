// Apparaten uit de offerte koppelen aan de apparaatkasten uit Winner Flex.
// Een voorstel op soort (koelen, oven, vaatwasser, koken…): per soort gaan
// de apparaten op volgorde naar de kasten op volgorde van positie; zijn er
// meer apparaten dan kasten (bv. combi-oven en stoomoven in één hoge kast),
// dan komen de overige in de laatste kast. FINKA kan het voorstel daarna
// per apparaat aanpassen.

export type ApparaatGroep = 'koel' | 'oven' | 'vaat' | 'kook' | 'afzuig' | 'wijn' | 'overig'

export function groepVanType(type: string): ApparaatGroep {
  if (/koel|vries|vriez/.test(type)) return 'koel'
  if (/oven|magnetron/.test(type)) return 'oven'
  if (/vaat/.test(type)) return 'vaat'
  if (/kook/.test(type)) return 'kook'
  if (/afzuig/.test(type)) return 'afzuig'
  if (/wijn/.test(type)) return 'wijn'
  return 'overig'
}

export function groepVanKast(label: string | null | undefined): ApparaatGroep | null {
  const l = (label ?? '').toLowerCase()
  if (/koel|vries|vriez/.test(l)) return 'koel'
  if (/oven|magnetron|stoom/.test(l)) return 'oven'
  if (/vaat/.test(l)) return 'vaat'
  if (/kook/.test(l)) return 'kook'
  if (/afzuig/.test(l)) return 'afzuig'
  if (/wijn/.test(l)) return 'wijn'
  return null
}

export function stelKoppelingVoor(
  apparaten: { id: string; type: string }[],
  kasten: { id: string; positie: string; apparaat: string | null }[],
): Record<string, string | null> {
  const opPositie = [...kasten].sort((a, b) => a.positie.localeCompare(b.positie, 'nl', { numeric: true }))
  const uit: Record<string, string | null> = {}
  const teller: Partial<Record<ApparaatGroep, number>> = {}
  for (const a of apparaten) {
    const g = groepVanType(a.type)
    const plekken = opPositie.filter((k) => groepVanKast(k.apparaat) === g)
    if (!plekken.length) {
      uit[a.id] = null
      continue
    }
    const i = teller[g] ?? 0
    teller[g] = i + 1
    uit[a.id] = plekken[Math.min(i, plekken.length - 1)].id
  }
  return uit
}
