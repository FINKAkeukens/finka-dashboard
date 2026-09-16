// ISO 8601-weeknummer (KW) — zelfde telling als de Sachsen/Artego-mails
// gebruiken. Maandag = eerste dag van de week; week 1 is de week met de
// eerste donderdag van het jaar.
export function getIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7 // maandag = 0 ... zondag = 6
  d.setUTCDate(d.getUTCDate() - dayNum + 3) // donderdag van deze week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return { week, year: d.getUTCFullYear() }
}
