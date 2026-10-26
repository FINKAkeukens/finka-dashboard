// Supabase geeft per verzoek hooguit 1000 rijen terug, zonder foutmelding —
// de rest valt stilletjes weg. Voor tabellen die daarboven kunnen komen (de
// projecttaken zitten er al overheen) per 1000 ophalen tot alles binnen is.
// `page` krijgt de grenzen mee en moet een vaste volgorde hebben (order op
// een unieke kolom), anders kunnen rijen tussen pagina's verschuiven.
const PAGE_SIZE = 1000

export async function fetchAll<T>(
  // Bewust losjes getypeerd: een select met een kolomlijst levert een eigen
  // rijtype op; de aanroeper zegt met T wat het is.
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error: error.message }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
