// Afgeschermde Storage-buckets: klantbestanden, projectdocumenten en
// offerte-pdf's. Deze buckets staan op privé — een bestand is alleen te
// openen via /api/bestand/<bucket>/<pad>, dat eerst controleert of de
// ingelogde gebruiker het mag zien en dan doorstuurt naar een kortlevende
// signed URL.
//
// In de database blijft de oude publieke URL gewoon staan (getPublicUrl bij
// uploaden): die dient alleen nog als stabiele verwijzing naar bucket + pad,
// en wordt bij het tonen via fileHref() omgezet. Zo hoefde er geen data
// gemigreerd te worden.
export const PROTECTED_BUCKETS = ['klant-uploads', 'project-documenten', 'offerte-pdfs'] as const
export type ProtectedBucket = (typeof PROTECTED_BUCKETS)[number]

const PUBLIC_MARKER = '/storage/v1/object/public/'

export function isProtectedBucket(bucket: string): bucket is ProtectedBucket {
  return (PROTECTED_BUCKETS as readonly string[]).includes(bucket)
}

// Haalt bucket + pad uit een opgeslagen publieke Storage-URL. Geeft null
// voor alles wat geen URL uit een afgeschermde bucket is.
export function parseProtectedUrl(url: string | null | undefined): { bucket: ProtectedBucket; path: string } | null {
  if (!url) return null
  const i = url.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  const rest = url.slice(i + PUBLIC_MARKER.length).split('?')[0]
  const slash = rest.indexOf('/')
  if (slash === -1) return null
  const bucket = rest.slice(0, slash)
  const path = decodeURIComponent(rest.slice(slash + 1))
  if (!isProtectedBucket(bucket) || !path) return null
  return { bucket, path }
}

// De link die we in de UI tonen: voor afgeschermde bestanden de beveiligde
// route, voor al het andere (bv. offer-images) de URL ongewijzigd.
export function fileHref(url: string): string
export function fileHref(url: string | null | undefined): string | null
export function fileHref(url: string | null | undefined): string | null {
  if (!url) return url ?? null
  const parsed = parseProtectedUrl(url)
  if (!parsed) return url
  const encodedPath = parsed.path.split('/').map(encodeURIComponent).join('/')
  return `/api/bestand/${parsed.bucket}/${encodedPath}`
}
