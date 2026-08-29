import { QuestionnaireQuestionType } from './types'

export const QUESTIONNAIRE_TYPE_LABELS: Record<QuestionnaireQuestionType, string> = {
  tekst: 'Kort antwoord',
  lange_tekst: 'Lang antwoord',
  multi_select: 'Meerdere opties (aanvinken)',
  bestand: 'Bestand (foto/pdf)',
}

// Elke multi_select-vraag krijgt deze optie automatisch erbij (niet als
// losse rij in q.options — zo kan hij niet per ongeluk verwijderd worden en
// hoeft-ie niet bij elke bestaande/nieuwe vraag apart toegevoegd te
// worden). Bij selectie verschijnt er een kort-antwoordveld.
export const MULTI_SELECT_OTHER_OPTION = 'Anders, namelijk...'

export interface MultiSelectAnswer {
  selected: string[]
  other: string
}

// answer is bij multi_select een JSON-object {selected, other}, bij bestand
// een JSON-array van {url, name} — deze helpers houden de (de)serialisatie
// op één plek zodat het formulier en de staff-weergave 'm niet allebei los
// hoeven te implementeren. Oude antwoorden (vóór het "Anders, namelijk..."-
// veld) stonden als kale JSON-array — die vorm blijft ondersteund.
export function parseMultiSelectAnswer(answer: string | null): MultiSelectAnswer {
  if (!answer) return { selected: [], other: '' }
  try {
    const parsed = JSON.parse(answer)
    if (Array.isArray(parsed)) {
      return { selected: parsed.filter((v): v is string => typeof v === 'string'), other: '' }
    }
    if (parsed && typeof parsed === 'object') {
      const selected = Array.isArray(parsed.selected)
        ? parsed.selected.filter((v: unknown): v is string => typeof v === 'string')
        : []
      const other = typeof parsed.other === 'string' ? parsed.other : ''
      return { selected, other }
    }
    return { selected: [], other: '' }
  } catch {
    return { selected: [], other: '' }
  }
}

export function serializeMultiSelectAnswer(value: MultiSelectAnswer): string {
  return JSON.stringify(value)
}

// Voor weergave (staff-tabblad): toont de eigen tekst i.p.v. de generieke
// "Anders, namelijk..."-tekst zodra die is ingevuld.
export function multiSelectDisplayValues({ selected, other }: MultiSelectAnswer): string[] {
  return selected.map((value) =>
    value === MULTI_SELECT_OTHER_OPTION && other.trim() ? `Anders: ${other.trim()}` : value
  )
}

export interface QuestionnaireFile {
  url: string
  name: string
}

export function parseFileAnswer(answer: string | null): QuestionnaireFile[] {
  if (!answer) return []
  try {
    const parsed = JSON.parse(answer)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is QuestionnaireFile => !!v && typeof v.url === 'string' && typeof v.name === 'string')
      : []
  } catch {
    return []
  }
}

export function serializeFileAnswer(files: QuestionnaireFile[]): string {
  return JSON.stringify(files)
}

// Toegestane bestandstypen voor vraagtype 'bestand' — zowel client- als
// server-side (upload-route) gebruikt, zodat ze niet uit de pas kunnen lopen.
export const QUESTIONNAIRE_FILE_ACCEPT = 'image/jpeg,image/png,application/pdf'
export const QUESTIONNAIRE_FILE_MAX_BYTES = 20 * 1024 * 1024
