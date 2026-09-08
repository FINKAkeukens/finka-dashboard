'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// Numerieke input voor bedragen/percentages in de offerte-generator (Offerte
// + Configurator) — vervangt het kale <input type="number"> + `value={getal}`
// + `onChange={(e) => set(Number(e.target.value))}`-patroon, dat twee
// problemen gaf:
// 1. De 0 (of elk ander bestaand getal) kon niet weggehaald worden vóórdat
//    er iets nieuws getypt was — een leeggemaakt veld parst naar NaN/0,
//    waardoor React de controlled value meteen weer op 0 terugzette.
// 2. Een komma als decimaalteken (de NL-gewoonte) wordt door een natief
//    type="number"-veld niet geaccepteerd; de waarde springt dan leeg en
//    daarmee (via hetzelfde mechanisme) terug naar 0.
// Oplossing: type="text" + inputMode="decimal" (geen browser-restricties op
// wat getypt mag worden) met een lokale tekst-state tijdens het typen, zodat
// tussenstappen ("", "-", "125,", "125.") gewoon op het scherm blijven staan
// i.p.v. meteen herschreven te worden. Er wordt pas een getal teruggemeld
// zodra de tekst geldig is; bij het verlaten van het veld (blur) wordt de
// weergave genormaliseerd naar het laatst gemelde getal.
export function NumberInput({
  value,
  onChange,
  onBlur,
  className,
  placeholder,
  min,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  // Vuurt ná de interne normalisatie-logica van handleBlur — voor aanroepers
  // die bij het verlaten van het veld nog iets willen doen (bv. direct
  // opslaan), zonder zelf de tekst/parse-logica te hoeven overnemen.
  onBlur?: () => void
  className?: string
  placeholder?: string
  min?: number
  disabled?: boolean
}) {
  const [text, setText] = useState(() => formatForEdit(value))
  const [focused, setFocused] = useState(false)
  const [lastSyncedValue, setLastSyncedValue] = useState(value)

  // Waarde-wijzigingen van buitenaf (bv. een AI-upload die cost_total zet)
  // alleen overnemen als de gebruiker niet middenin het typen zit — anders
  // overschrijft dit een net getypt tussenresultaat (zoals een net getypte
  // punt/komma of trailing nul). Rechtstreeks tijdens render bijgewerkt (het
  // "state aanpassen tijdens render"-patroon uit de React-docs) i.p.v. via
  // useEffect — een effect zou hier een extra render-cyclus ná elke
  // prop-wijziging kosten voor iets dat synchroon al vaststaat.
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value)
    if (!focused) setText(formatForEdit(value))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setText(raw)
    const parsed = parseNumber(raw)
    if (parsed !== null) onChange(min !== undefined ? Math.max(min, parsed) : parsed)
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(true)
    e.target.select()
  }

  function handleBlur() {
    setFocused(false)
    const parsed = parseNumber(text) ?? 0
    const clamped = min !== undefined ? Math.max(min, parsed) : parsed
    onChange(clamped)
    setText(formatForEdit(clamped))
    onBlur?.()
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
    />
  )
}

// Geen duizendtal-opmaak hier — dit is een edit-veld, geen weergave.
function formatForEdit(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

// Accepteert zowel punt als komma als decimaalteken. Geeft null terug zolang
// de tekst nog geen volledig geldig getal is (lege string, "-", een
// afsluitende punt/komma tijdens het typen, etc.) — de aanroeper laat de
// weergave dan gewoon staan i.p.v. 'm te overschrijven, zodat doortypen kan.
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-') return null
  const normalized = trimmed.replace(',', '.')
  if (normalized.endsWith('.') || normalized === '-.') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}
