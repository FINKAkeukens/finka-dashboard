import { ChecklistCategory, ChecklistItem } from './types'

// Vaste volgorde + labels van de standaardpunten — elk project krijgt deze
// automatisch (zie migratie-trigger create_default_checklist_items). Alleen
// hier en in die trigger aanpassen als de standaardlijst wijzigt; de
// database-kolom zelf heeft bewust geen CHECK-constraint op deze keys.
export const CHECKLIST_ORDER: string[] = [
  'wensen_genoteerd',
  'eerste_offerte_verstuurd',
  'finale_offerte_akkoord',
  'aanbetaling_ontvangen',
  'keuken_ingemeten',
  'tekening_goedgekeurd',
  'apparatuur_gekozen',
  'werkblad_gekozen',
  'kasten_besteld',
  'apparatuur_besteld',
  'werkblad_besteld',
  'accessoires_besteld',
  'aansluitschema_gedeeld',
  'levering_ingepland',
  'keuken_geleverd',
  'montage_ingepland',
  'montage_afgerond',
  'eindcontrole',
  'restbetaling_ontvangen',
  'garantiepapieren',
]

export const CHECKLIST_LABELS: Record<string, string> = {
  wensen_genoteerd: 'Wensen en eisen genoteerd',
  eerste_offerte_verstuurd: 'Eerste offerte verstuurd',
  finale_offerte_akkoord: 'Finale offerte akkoord',
  aanbetaling_ontvangen: 'Aanbetaling ontvangen',
  keuken_ingemeten: 'Keuken ingemeten',
  tekening_goedgekeurd: 'Tekening/ontwerp goedgekeurd door klant',
  apparatuur_gekozen: 'Apparatuur definitief gekozen',
  werkblad_gekozen: 'Werkblad definitief gekozen',
  kasten_besteld: 'Kasten besteld',
  apparatuur_besteld: 'Apparatuur besteld',
  werkblad_besteld: 'Werkblad besteld',
  accessoires_besteld: 'Accessoires besteld',
  aansluitschema_gedeeld: 'Aansluitschema gedeeld met klant/installateur',
  levering_ingepland: 'Levering ingepland',
  keuken_geleverd: 'Keuken geleverd (zonder schade)',
  montage_ingepland: 'Montage ingepland',
  montage_afgerond: 'Montage afgerond',
  eindcontrole: 'Eindcontrole met klant',
  restbetaling_ontvangen: 'Restbetaling ontvangen',
  garantiepapieren: 'Garantiepapieren overhandigd',
}

export const CHECKLIST_CATEGORY_ORDER: ChecklistCategory[] = [
  'verkoop',
  'ontwerp_meten',
  'bestellen',
  'levering_montage',
  'afronding',
]

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  verkoop: 'Verkoop',
  ontwerp_meten: 'Ontwerp & meten',
  bestellen: 'Bestellen',
  levering_montage: 'Levering & montage',
  afronding: 'Afronding',
}

// Vast punt heeft een standaardlabel, maar is per project alsnog hernoembaar
// via het losse `label`-veld. Vrije punten dragen sowieso hun eigen, vrij
// getypte label mee (item_key === null).
export function checklistItemLabel(item: Pick<ChecklistItem, 'item_key' | 'label'>): string {
  if (!item.item_key) return item.label?.trim() || 'Aangepast punt'
  return item.label?.trim() || CHECKLIST_LABELS[item.item_key] || item.item_key
}
