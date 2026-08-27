'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-5 py-2.5 bg-[#1C1B19] text-white text-sm rounded-lg hover:bg-[#2d2b28] transition-colors"
    >
      Afdrukken / PDF opslaan
    </button>
  )
}
