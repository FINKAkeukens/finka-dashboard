import type { FocusEvent } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Op een <input type="number"> met value=0 staat de cursor bij het klikken
// achter die "0" — typ je dan een cijfer, dan wordt het "05" i.p.v. "5".
// Selecteert de hele waarde bij focus, zodat typen 'm meteen vervangt.
// Gebruik: <input type="number" onFocus={selectOnFocus} ... />
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  e.target.select()
}
