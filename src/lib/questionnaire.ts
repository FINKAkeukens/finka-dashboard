import { QuestionnaireQuestionType } from './types'

export const QUESTIONNAIRE_TYPE_LABELS: Record<QuestionnaireQuestionType, string> = {
  tekst: 'Kort antwoord',
  lange_tekst: 'Lang antwoord',
  multi_select: 'Meerdere opties (aanvinken)',
  bestand: 'Bestand (foto/pdf)',
}

// answer is bij multi_select een JSON-array-string, bij bestand een JSON-
// array van {url, name} — deze helpers houden de (de)serialisatie op één
// plek zodat het formulier en de staff-weergave 'm niet allebei los hoeven
// te implementeren.
export function parseMultiSelectAnswer(answer: string | null): string[] {
  if (!answer) return []
  try {
    const parsed = JSON.parse(answer)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function serializeMultiSelectAnswer(values: string[]): string {
  return JSON.stringify(values)
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
