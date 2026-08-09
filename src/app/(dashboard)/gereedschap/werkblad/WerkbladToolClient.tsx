'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import WerkbladCalculator from '@/components/WerkbladCalculator'
import { WerkbladCalcInputs, WerkbladRates } from '@/lib/types'
import { defaultWerkbladCalcInputs } from '@/lib/werkblad-calc'

// Los van een project — alleen ter herinnering in déze browser, geen
// bedrijfsdata dus geen Supabase-opslag nodig.
const STORAGE_KEY = 'finka:werkblad-tool'

export default function WerkbladToolClient({ rates }: { rates: WerkbladRates }) {
  const [inputs, setInputs] = useState<WerkbladCalcInputs>(() => defaultWerkbladCalcInputs(rates))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        // SSR-safe localStorage-hydratie: window bestaat niet tijdens de
        // server-render, dus dit kan alleen na mount — de ene extra render
        // hierdoor is bewust, niet een te vermijden effect-antipatroon.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInputs(JSON.parse(raw))
      } catch {
        // negeer corrupte opslag, val terug op de standaardberekening
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
  }, [inputs, loaded])

  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] p-6">
      <WerkbladCalculator rates={rates} value={inputs} onChange={setInputs} />
      <div className="pt-4 mt-4 border-t border-[#DDD8D2]">
        <Button variant="outline" size="sm" onClick={() => setInputs(defaultWerkbladCalcInputs(rates))}>
          Nieuwe berekening
        </Button>
      </div>
    </div>
  )
}
