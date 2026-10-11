// Direct zichtbaar na een klik/tik terwijl de server de pagina ophaalt —
// zonder dit leek het dashboard (vooral op de telefoon) even te hangen.
// Menu/onderbalk blijven staan; alleen de inhoud wordt een placeholder.
export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-6xl animate-pulse" aria-busy="true" aria-label="Laden">
      <div className="h-7 w-40 rounded-md bg-[#E8E4DF]" />
      <div className="h-4 w-64 max-w-full rounded-md bg-[#EFECE8] mt-2.5" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-[#E8E4DF] bg-white" />
        ))}
      </div>
    </div>
  )
}
