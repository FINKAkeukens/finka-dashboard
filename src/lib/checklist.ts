import { ChecklistItem } from './types'

// Historische standaardpunten van vóór het templatemodel (zie
// finka_checklist_templates, beheerd via /instellingen/checklist). Alleen
// nog gebruikt als fallback-label voor project-checklists die vóór die
// migratie zijn aangemaakt (die dragen deze keys nog in item_key); nieuwe
// checklists worden rechtstreeks met hun eigen label gekopieerd uit de
// instellingen en raken deze lijst niet meer aan.
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

// Historische kopjes van vóór het templatemodel (zie finka_checklist_categories,
// beheerd via /instellingen/checklist). Alleen nog gebruikt als fallback-
// label voor project-checklists die vóór die migratie zijn aangemaakt (die
// dragen deze keys nog in category); nieuwe checklists dragen daar al het
// volledige label van het kopje op het moment van aanmaken.
export const CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
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

// item.category is losse tekst (zie ChecklistItem in src/lib/types.ts) —
// meestal al het volledige label, met een fallback voor de oude vaste
// sleutels van vóór het templatemodel.
export function categoryLabel(category: string): string {
  return CHECKLIST_CATEGORY_LABELS[category] ?? category
}
