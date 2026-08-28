'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldWithSource, SourceTag } from '@/components/FieldWithSource'
import { logAudit, logFieldChanges } from '@/lib/audit'
import { formatPrice, getSpecSummary, TYPE_LABELS as APPLIANCE_TYPE_LABELS } from '@/lib/appliance-utils'
import { Appliance, ApplianceType, ConnectionRow, CostBreakdownItem, CustomerCostLine, FieldSource, PageDisclaimerKey, Quote, QuoteCustomerCategory, QuoteCustomerSection, QuoteDownload, QuoteItem, QuoteItemType, SectionImagePosition, SectionImageSize } from '@/lib/types'
import { DEFAULT_COST_BREAKDOWN } from '@/lib/configurator'
import { ArrowRight, ChevronDown, GripVertical, Plus, RotateCcw, Trash2, Upload, X, Zap } from 'lucide-react'
import AppliancePickerModal from './AppliancePickerModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const TYPE_LABELS: Record<QuoteItemType, string> = {
  apparaat: 'Apparaat',
  product: 'Product',
  dienst: 'Dienst',
  maatwerk: 'Maatwerk',
}

const CUSTOMER_CATEGORY_BY_TYPE: Record<QuoteItemType, QuoteCustomerCategory> = {
  apparaat: 'apparatuur',
  dienst: 'overig',
  maatwerk: 'overig',
  product: 'overig',
}

const CUSTOMER_CATEGORY_LABELS: Record<QuoteCustomerCategory, string> = {
  kasten: 'Kasten',
  werkblad: 'Werkblad',
  apparatuur: 'Apparatuur',
  accessoires: 'Accessoires',
  overig: 'Overig',
}

// Apparaat-types die, ondanks dat ze als QuoteItem type 'apparaat' zijn
// (uit dezelfde bibliotheek gekozen), in de klantversie bij "Accessoires"
// horen in plaats van bij "Apparatuur".
const ACCESSOIRE_APPLIANCE_TYPES: ApplianceType[] = ['kraan', 'spoelbak']

// "Tabje" om per pagina een losse disclaimer-tekst te typen — staat onderaan
// die pagina in de klantversie, lichtgrijs zoals de sectielabels (zie
// renderInline/DisclaimerFooter in offerte/[projectId]/page.tsx). Standaard
// ingeklapt tenzij er al tekst in staat.
function PageDisclaimerField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(() => !!value)
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-[#9A948D] hover:text-[#1C1B19]"
      >
        <Plus size={11} />
        Disclaimer toevoegen
      </button>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <button
          type="button"
          onClick={() => { onChange(''); setOpen(false) }}
          title="Disclaimer verwijderen"
          className="text-[#9A948D] hover:text-red-600"
        >
          <X size={12} />
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Bijv. Prijzen onder voorbehoud van..."
        className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(value)}`}
      />
    </div>
  )
}

const DEFAULT_CLOSING_QUOTE = 'Op naar een prachtig resultaat.'
const DEFAULT_DISCLAIMER_TEXT = 'Onder voorbehoud van definitieve prijzen en orderbevestiging door FINKA keukens.'
const DEFAULT_CONNECTIONS_DISCLAIMER = 'Graag maten goed controleren. Wij zijn niet aansprakelijk voor verkeerd doorgegeven maten of niet gecontroleerde maten.'

// Client-side werkkopie van een regel — nieuwe regels krijgen een tijdelijk
// id (prefix "temp-") zodat handleSave weet wat ge-insert vs. geüpdatet moet worden.
type DraftItem = Omit<QuoteItem, 'id' | 'quote_id'> & { id: string; isNew?: boolean }

// Alle bedragen in de prijsberekening op max. 2 decimalen — voorkomt
// drijvende-kommagetallen zoals 127.26174999999999 door percentage-sommen.
function round2(n: number) {
  return Math.round(n * 100) / 100
}

// "Markeerstift": staff typt ==tekst== om zichzelf te herinneren dat iets
// nog niet af is — in de klantversie/PDF wordt dat knalrood getoond (zie
// renderInline in offerte/[projectId]/page.tsx), hier in de editor krijgt
// het veld een rode rand zodat het ook zonder preview meteen opvalt.
const MARKER_REGEX = /==.+?==/
function markerClass(value: string | null | undefined) {
  return value && MARKER_REGEX.test(value) ? 'border-red-400 focus:border-red-500 bg-red-50/50' : ''
}

function lineTotal(item: Pick<DraftItem, 'quantity' | 'unit_price' | 'line_total' | 'line_total_source'>) {
  return round2(item.line_total_source === 'in' ? item.line_total : item.quantity * item.unit_price)
}

// Vangt oudere, nog niet gemigreerde customer_sections op (lines als platte
// strings, geen category) zodat bestaande offertes niet crashen.
// Andere categorieën (Kasten/Werkblad/Apparatuur) krijgen hun sectie
// automatisch via een AI-PDF-upload of het overzetten van een regel —
// Accessoires heeft zo'n flow niet, dus die staat hier standaard al klaar
// (leeg, met de "Kies uit bibliotheek"-knop) i.p.v. dat staff 'm elke keer
// zelf via "+ Sectie" moet aanmaken.
const DEFAULT_ACCESSOIRES_SECTION = {
  category: 'accessoires' as const,
  title: 'Accessoires',
  lines: [] as QuoteCustomerSection['lines'],
  images: [] as string[],
  imagePosition: undefined as SectionImagePosition | undefined,
  imageSize: undefined as SectionImageSize | undefined,
  disclaimer: undefined as string | undefined,
}

function normalizeSections(sections: unknown): QuoteCustomerSection[] {
  const normalized = !Array.isArray(sections)
    ? []
    : (sections as Array<Record<string, unknown>>).map((s) => ({
        category: (s.category as QuoteCustomerSection['category']) ?? 'overig',
        title: (s.title as string) ?? 'Sectie',
        lines: Array.isArray(s.lines)
          ? (s.lines as unknown[]).map((l) => {
              if (typeof l === 'string') return { text: l, included: true }
              const line = l as Record<string, unknown>
              return { text: (line.text as string) ?? '', included: (line.included as boolean) ?? true }
            })
          : [],
        images: Array.isArray(s.images) ? (s.images as string[]) : [],
        imagePosition: s.imagePosition as QuoteCustomerSection['imagePosition'],
        imageSize: s.imageSize as QuoteCustomerSection['imageSize'],
        disclaimer: s.disclaimer as string | undefined,
      }))

  if (!normalized.some((s) => s.category === 'accessoires')) {
    normalized.push({ ...DEFAULT_ACCESSOIRES_SECTION })
  }
  return normalized
}

function newDraftItem(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'product',
    appliance_id: null,
    description: '',
    brand: null,
    model: null,
    quantity: 1,
    unit_price: 0,
    unit_price_source: 'in',
    line_total: 0,
    line_total_source: 'auto',
    sort_order: 0,
    include_in_customer_view: false,
    isNew: true,
    ...overrides,
  }
}

export default function QuoteEditor({
  projectId,
  quote: initialQuote,
  items: initialItems,
  downloads,
  appliances,
}: {
  projectId: string
  quote: Quote | null
  items: QuoteItem[]
  downloads: QuoteDownload[]
  appliances: Appliance[]
}) {
  const supabase = createClient()
  const router = useRouter()

  const [quote, setQuote] = useState(initialQuote)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [accessoirePickerSectionIdx, setAccessoirePickerSectionIdx] = useState<number | null>(null)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)

  const [items, setItems] = useState<DraftItem[]>(
    initialItems.map((i) => ({ ...i }))
  )
  const originalItemIds = useRef(new Set(initialItems.map((i) => i.id)))

  const [status, setStatus] = useState(initialQuote?.status ?? 'concept')
  const [plattegrondUrl, setPlattegrondUrl] = useState(initialQuote?.plattegrond_url ?? '')
  const [renderUrls, setRenderUrls] = useState<string[]>(initialQuote?.render_urls ?? [])
  const [standaardAfbeeldingen, setStandaardAfbeeldingen] = useState<string[]>(
    initialQuote?.standaard_afbeeldingen ?? []
  )
  const [coverImageUrl, setCoverImageUrl] = useState(initialQuote?.cover_image_url ?? '')
  const [uploadingPlattegrond, setUploadingPlattegrond] = useState(false)
  const [uploadingRender, setUploadingRender] = useState(false)
  const [uploadingStandaard, setUploadingStandaard] = useState(false)
  const plattegrondInputRef = useRef<HTMLInputElement>(null)
  const renderInputRef = useRef<HTMLInputElement>(null)
  const standaardInputRef = useRef<HTMLInputElement>(null)

  // Klantversie — volledig losstaand van de interne regels/prijzen hieronder.
  // Niets hier wordt automatisch gevuld vanuit interne data.
  const [customerDocumentLabel, setCustomerDocumentLabel] = useState(initialQuote?.customer_document_label ?? 'Prijsindicatie')
  const [customerHeadline, setCustomerHeadline] = useState(initialQuote?.customer_headline ?? '')
  const [customerSubtitle, setCustomerSubtitle] = useState(initialQuote?.customer_subtitle ?? '')
  const [customerIntroText, setCustomerIntroText] = useState(initialQuote?.customer_intro_text ?? '')
  const [customerSections, setCustomerSections] = useState<QuoteCustomerSection[]>(
    normalizeSections(initialQuote?.customer_sections)
  )
  const [customerCostLines, setCustomerCostLines] = useState<CustomerCostLine[]>(
    initialQuote?.customer_cost_lines ?? []
  )
  // Puur lokale UI-state (niet opgeslagen) om lange sectielijsten in te klappen.
  // Standaard ingeklapt — zelf uitklappen per sectie/blok waar nodig.
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(
    () => new Set(customerSections.map((_, i) => i))
  )
  const [kostenCollapsed, setKostenCollapsed] = useState(true)
  const [downloadsCollapsed, setDownloadsCollapsed] = useState(true)
  const [connectionsCollapsed, setConnectionsCollapsed] = useState(true)
  // Sectie waar na toevoegen van een regel (bv. handmatige werkblad-regel)
  // naartoe gescrold moet worden — anders verschijnt de nieuwe/uitgeklapte
  // sectie onopgemerkt buiten beeld verderop op de pagina.
  const [pendingScrollSectionIdx, setPendingScrollSectionIdx] = useState<number | null>(null)
  // Sleepstatus voor het herordenen van regels binnen een sectie (native
  // HTML5 drag-and-drop — geen extra library nodig voor iets dit simpels).
  const [draggedLine, setDraggedLine] = useState<{ sectionIdx: number; lineIdx: number } | null>(null)
  // Sleepstatus voor het herordenen van hele secties (zelfde aanpak als
  // draggedLine hierboven, maar dan op sectieniveau).
  const [draggedSectionIdx, setDraggedSectionIdx] = useState<number | null>(null)

  useEffect(() => {
    if (pendingScrollSectionIdx === null) return
    document.getElementById(`customer-section-${pendingScrollSectionIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setPendingScrollSectionIdx(null)
  }, [pendingScrollSectionIdx])

  function toggleSectionCollapsed(index: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }
  const [connectionsImageUrl, setConnectionsImageUrl] = useState(initialQuote?.connections_image_url ?? '')
  const [uploadingConnectionsImage, setUploadingConnectionsImage] = useState(false)
  const [customerConnectionsIntro, setCustomerConnectionsIntro] = useState(
    initialQuote?.customer_connections_intro ?? ''
  )
  const [customerConnectionsDisclaimer, setCustomerConnectionsDisclaimer] = useState(
    initialQuote?.customer_connections_disclaimer ?? DEFAULT_CONNECTIONS_DISCLAIMER
  )
  const [customerConnections, setCustomerConnections] = useState<ConnectionRow[]>(
    initialQuote?.customer_connections ?? []
  )
  const connectionsImageInputRef = useRef<HTMLInputElement>(null)
  const [customerClosingHeading, setCustomerClosingHeading] = useState(initialQuote?.customer_closing_heading ?? '')
  const [customerClosingText, setCustomerClosingText] = useState(initialQuote?.customer_closing_text ?? '')
  const [customerClosingQuote, setCustomerClosingQuote] = useState(
    initialQuote?.customer_closing_quote ?? DEFAULT_CLOSING_QUOTE
  )
  const [customerDisclaimerText, setCustomerDisclaimerText] = useState(
    initialQuote?.customer_disclaimer_text ?? DEFAULT_DISCLAIMER_TEXT
  )
  const [pageDisclaimers, setPageDisclaimers] = useState<Partial<Record<PageDisclaimerKey, string>>>(
    initialQuote?.page_disclaimers ?? {}
  )
  function updatePageDisclaimer(key: PageDisclaimerKey, text: string) {
    setPageDisclaimers((prev) => ({ ...prev, [key]: text }))
  }
  const [customerPriceValue, setCustomerPriceValue] = useState(initialQuote?.customer_price ?? 0)
  const [customerPriceSource, setCustomerPriceSource] = useState<FieldSource>(
    initialQuote?.customer_price_source ?? 'def'
  )

  const [costBreakdown, setCostBreakdown] = useState<CostBreakdownItem[]>(
    initialQuote?.cost_breakdown?.length ? initialQuote.cost_breakdown : DEFAULT_COST_BREAKDOWN
  )
  const [btwPercentage, setBtwPercentage] = useState(initialQuote?.btw_percentage ?? 21)
  const [overallMarginPercentage, setOverallMarginPercentage] = useState(0)
  const [totalValue, setTotalValue] = useState(initialQuote?.total_price ?? 0)
  const [totalSource, setTotalSource] = useState<FieldSource>(initialQuote?.total_price_source ?? 'auto')

  // Apparatuur-kosten volgen live uit de interne regels — geen handmatige
  // invoer nodig zolang de rij op 'auto' staat.
  const liveApparatuurCost = round2(items.filter((i) => i.type === 'apparaat').reduce((sum, i) => sum + lineTotal(i), 0))

  function displayedCost(row: CostBreakdownItem): number {
    if (row.key === 'apparatuur' && row.werkelijke_kosten_source === 'auto') return liveApparatuurCost
    return round2(row.werkelijke_kosten)
  }

  function updateCostRow(key: CostBreakdownItem['key'], patch: Partial<CostBreakdownItem>) {
    setCostBreakdown((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  // Zet dezelfde marge% op alle categorieën in de tabel hierboven — dit ís
  // de marge die de tabel gebruikt, geen los/parallel getal.
  function applyMarginToAllRows() {
    setCostBreakdown((prev) => prev.map((r) => ({ ...r, marge_percentage: overallMarginPercentage, marge_percentage_source: 'in' })))
  }

  const totaalKostenExclMarge = round2(costBreakdown.reduce((sum, r) => sum + displayedCost(r), 0))
  const totaalPrijsExclBtw = round2(costBreakdown.reduce((sum, r) => sum + displayedCost(r) * (1 + r.marge_percentage / 100), 0))
  const totaalPrijsInclBtw = round2(totaalPrijsExclBtw * (1 + btwPercentage / 100))

  // Huidige (blended) marge zoals die nu daadwerkelijk uit de categorietabel
  // volgt — dit getal en de tabel kunnen dus nooit uit elkaar lopen.
  const effectiveMarginEuro = round2(totaalPrijsExclBtw - totaalKostenExclMarge)
  const effectiveMarginPercentage = totaalKostenExclMarge > 0 ? round2((effectiveMarginEuro / totaalKostenExclMarge) * 100) : 0
  const effectiveNettoPercentageOfPrice = totaalPrijsExclBtw > 0 ? round2((effectiveMarginEuro / totaalPrijsExclBtw) * 100) : 0

  const liveTotal = totalSource === 'auto' ? totaalPrijsInclBtw : round2(totalValue)

  async function createQuote() {
    setCreating(true)
    setError('')

    // Standaardafbeeldingen erven over van de meest recente offerte, net
    // zoals de oude conceptofferte de sfeerfoto overneemt — staff kan ze
    // hierna per project overschrijven.
    const { data: latest } = await supabase
      .from('finka_quotes')
      .select('standaard_afbeeldingen')
      .not('standaard_afbeeldingen', 'eq', '[]')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('finka_quotes')
      .insert({
        project_id: projectId,
        standaard_afbeeldingen: latest?.standaard_afbeeldingen ?? [],
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
    } else {
      setQuote(data as Quote)
      setStandaardAfbeeldingen((data as Quote).standaard_afbeeldingen ?? [])
      await logAudit(supabase, {
        tableName: 'finka_quotes',
        recordId: data.id,
        action: 'create',
        changedBy: (await supabase.auth.getUser()).data.user?.email,
      })
    }
    setCreating(false)
  }

  // Vercel's upload-endpoint heeft een request-limiet (413 bij te grote
  // bestanden) — telefoonfoto's zitten daar met gemak overheen. Bij meerdere
  // foto's tegelijk uploaden faalde daardoor eerder alles behalve het eerste
  // (kleinste) bestand, stil, zonder duidelijke melding. Schaalt hier
  // client-side terug naar max 2000px voordat 'm geüpload wordt — PNG blijft
  // PNG (transparantie, bv. plattegronden), andere formaten worden JPEG.
  async function resizeImageFile(file: File, maxDim = 2000): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      if (scale === 1 && file.size <= 4 * 1024 * 1024) return file
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, outType, outType === 'image/jpeg' ? 0.85 : undefined)
      )
      if (!blob || blob.size >= file.size) return file
      return new File([blob], file.name, { type: outType })
    } catch {
      return file
    }
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const formData = new FormData()
    formData.append('file', await resizeImageFile(file), file.name)
    formData.append('path', path)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const body = await res.json()
    if (!res.ok) {
      setError(`Upload mislukt: ${body.error ?? res.statusText}`)
      return null
    }
    return body.url as string
  }

  async function handlePlattegrondUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !quote) return
    setError('')
    setUploadingPlattegrond(true)
    const ext = file.name.split('.').pop()
    const url = await uploadImage(file, `${quote.id}/plattegrond-${Date.now()}.${ext}`)
    if (url) setPlattegrondUrl(url)
    setUploadingPlattegrond(false)
    e.target.value = ''
  }

  async function handleGalleryUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    prefix: string,
    setter: (updater: (prev: string[]) => string[]) => void,
    setUploading: (v: boolean) => void
  ) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !quote) return
    setError('')
    setUploading(true)
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const url = await uploadImage(file, `${quote.id}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
      if (url) setter((prev) => [...prev, url])
    }
    setUploading(false)
    e.target.value = ''
  }

  // Voegt één tekstregel toe aan de (eerste) sectie van deze categorie —
  // maakt de sectie aan als die nog niet bestaat. Gebruikt wanneer staff
  // losse regels (bv. apparatuur uit de bibliotheek) overzet — elke klik
  // is een nieuwe, aparte regel, dus dit stapelt bewust op.
  function addSectionLines(category: QuoteCustomerCategory, defaultTitle: string, lines: string[]) {
    setCustomerSections((prev) => {
      const idx = prev.findIndex((s) => s.category === category)
      const newLines = lines.map((text) => ({ text, included: true }))
      if (idx === -1) return [...prev, { category, title: defaultTitle, lines: newLines }]
      return prev.map((s, i) => (i === idx ? { ...s, lines: [...s.lines, ...newLines] } : s))
    })
  }

  // Kranen/spoelbakken komen uit dezelfde apparatuur-bibliotheek (type
  // 'apparaat'), maar horen in de klantversie bij "Accessoires" i.p.v.
  // "Apparatuur" — vandaar de extra opzoekstap via de bibliotheekdata.
  function customerCategoryForItem(item: DraftItem): QuoteCustomerCategory {
    if (item.type === 'apparaat' && item.appliance_id) {
      const appliance = appliances.find((a) => a.id === item.appliance_id)
      if (appliance && ACCESSOIRE_APPLIANCE_TYPES.includes(appliance.type)) return 'accessoires'
    }
    return CUSTOMER_CATEGORY_BY_TYPE[item.type]
  }

  // Alle relevante specs (type + kenmerken) van een bibliotheek-apparaat als
  // klantvriendelijke tekst — bewust NOOIT de prijs, dat blijft uitsluitend
  // intern (zie ook de "→ Klantversie"-regel elders in dit bestand: interne
  // kostprijsdata lekt nooit automatisch door).
  function applianceCustomerText(appliance: Appliance): string {
    const typeLabel = APPLIANCE_TYPE_LABELS[appliance.type] ?? appliance.type
    const specSummary = getSpecSummary(appliance)
    return `${typeLabel} — ${appliance.brand} ${appliance.model}${specSummary !== '—' ? ` (${specSummary})` : ''}`
  }

  function addItemToCustomerView(item: DraftItem) {
    const category = customerCategoryForItem(item)
    const appliance = item.appliance_id ? appliances.find((a) => a.id === item.appliance_id) : undefined
    const text = appliance
      ? applianceCustomerText(appliance)
      : item.brand && item.model ? `${item.brand} ${item.model}` : item.description
    if (!text) return
    addSectionLines(category, CUSTOMER_CATEGORY_LABELS[category], [text])
    updateItem(item.id, { include_in_customer_view: true })
  }

  function addSection() {
    setCustomerSections((prev) => [...prev, { category: 'overig', title: 'Nieuwe sectie', lines: [] }])
  }

  function updateSectionTitle(index: number, title: string) {
    setCustomerSections((prev) => prev.map((s, i) => (i === index ? { ...s, title } : s)))
  }

  function updateSectionCategory(index: number, category: QuoteCustomerCategory) {
    setCustomerSections((prev) => prev.map((s, i) => (i === index ? { ...s, category } : s)))
  }

  function updateSectionImagePosition(index: number, imagePosition: SectionImagePosition) {
    setCustomerSections((prev) => prev.map((s, i) => (i === index ? { ...s, imagePosition } : s)))
  }

  function updateSectionImageSize(index: number, imageSize: SectionImageSize) {
    setCustomerSections((prev) => prev.map((s, i) => (i === index ? { ...s, imageSize } : s)))
  }

  function updateSectionDisclaimer(index: number, disclaimer: string) {
    setCustomerSections((prev) => prev.map((s, i) => (i === index ? { ...s, disclaimer } : s)))
  }

  function removeSection(index: number) {
    setCustomerSections((prev) => prev.filter((_, i) => i !== index))
  }

  function addSectionLine(index: number) {
    setCustomerSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, lines: [...s.lines, { text: '', included: true }] } : s))
    )
  }

  function updateSectionLine(index: number, lineIndex: number, value: string) {
    setCustomerSections((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, lines: s.lines.map((l, li) => (li === lineIndex ? { ...l, text: value } : l)) } : s
      )
    )
  }

  function toggleSectionLineIncluded(index: number, lineIndex: number) {
    setCustomerSections((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, lines: s.lines.map((l, li) => (li === lineIndex ? { ...l, included: !l.included } : l)) } : s
      )
    )
  }

  function removeSectionLine(index: number, lineIndex: number) {
    setCustomerSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, lines: s.lines.filter((_, li) => li !== lineIndex) } : s))
    )
  }

  // Regel verslepen binnen dezelfde sectie — bepaalt zowel in de interne
  // editor als in de klantversie in welke volgorde punten getoond worden
  // (de klantversie toont section.lines exact in deze array-volgorde).
  function moveSectionLine(index: number, fromLineIndex: number, toLineIndex: number) {
    if (fromLineIndex === toLineIndex) return
    setCustomerSections((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s
        const lines = [...s.lines]
        const [moved] = lines.splice(fromLineIndex, 1)
        lines.splice(toLineIndex, 0, moved)
        return { ...s, lines }
      })
    )
  }

  // Hele sectie verslepen om de volgorde in "Wat zit erin" aan te passen —
  // deze volgorde bepaalt ook in welke volgorde de secties in de
  // klantversie/PDF verschijnen. collapsedSections verwijst naar indexen,
  // dus die verschuiven we mee zodat een sectie niet onbedoeld in/uitklapt
  // na het slepen.
  function moveSection(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    setCustomerSections((prev) => {
      const sections = [...prev]
      const [moved] = sections.splice(fromIndex, 1)
      sections.splice(toIndex, 0, moved)
      return sections
    })
    setCollapsedSections((prev) => {
      const wasCollapsed = (index: number) => prev.has(index)
      const order = customerSections.map((_, i) => i)
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      const next = new Set<number>()
      order.forEach((originalIndex, newIndex) => {
        if (wasCollapsed(originalIndex)) next.add(newIndex)
      })
      return next
    })
  }

  async function handleSectionImageUpload(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !quote) return
    setError('')
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const url = await uploadImage(file, `${quote.id}/sectie-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
      if (url) {
        setCustomerSections((prev) =>
          prev.map((s, i) => (i === index ? { ...s, images: [...(s.images ?? []), url] } : s))
        )
      }
    }
    e.target.value = ''
  }

  function removeSectionImage(index: number, url: string) {
    setCustomerSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, images: (s.images ?? []).filter((u) => u !== url) } : s))
    )
  }

  function addCostLine() {
    setCustomerCostLines((prev) => [...prev, { label: '', description: '', amount: 0 }])
  }

  function updateCostLine(index: number, patch: Partial<CustomerCostLine>) {
    setCustomerCostLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeCostLine(index: number) {
    setCustomerCostLines((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleConnectionsImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !quote) return
    setError('')
    setUploadingConnectionsImage(true)
    const ext = file.name.split('.').pop()
    const url = await uploadImage(file, `${quote.id}/aansluitingen-${Date.now()}.${ext}`)
    if (url) setConnectionsImageUrl(url)
    setUploadingConnectionsImage(false)
    e.target.value = ''
  }

  function addConnectionRow() {
    setCustomerConnections((prev) => [...prev, { kast: '', aansluitingen: '' }])
  }

  function updateConnectionRow(index: number, patch: Partial<ConnectionRow>) {
    setCustomerConnections((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeConnectionRow(index: number) {
    setCustomerConnections((prev) => prev.filter((_, i) => i !== index))
  }

  // Eenmalige, handmatig te bevestigen suggestie op basis van de interne
  // kostprijs-opbouw — geen live koppeling, staff blijft alles overschrijven.
  function fillCostLinesFromInternal() {
    const sumKeys = (keys: CostBreakdownItem['key'][]) =>
      costBreakdown
        .filter((r) => keys.includes(r.key))
        .reduce((sum, r) => sum + displayedCost(r) * (1 + r.marge_percentage / 100), 0)

    setCustomerCostLines([
      { label: 'Keuken', description: 'Kasten, werkblad en apparatuur', amount: Math.round(sumKeys(['keukenkastjes', 'apparatuur', 'werkblad', 'accessoires'])) },
      { label: 'Opslag & levering', description: 'Verzekerde opslag en levering', amount: Math.round(sumKeys(['opslag', 'levering'])) },
      { label: 'Installatie', description: 'Installatie van de volledige keuken door ervaren monteurs', amount: Math.round(sumKeys(['installatie', 'inmeten', 'service'])) },
    ])
  }

  // Apparatuur uit de bibliotheek komt automatisch in de klantversie terecht
  // (alle specs, nooit de prijs — zie applianceCustomerText) i.p.v. dat staff
  // 'm daarna nog apart via "→ Klantversie" moet overzetten. Kranen/spoelbakken
  // (ACCESSOIRE_APPLIANCE_TYPES) slaan dit over: die hebben hun eigen flow via
  // addAccessoireToSection, die zelf al een regel in de juiste sectie zet —
  // anders zou 'm hier dubbel toevoegen.
  function addApplianceItem(appliance: Appliance) {
    // De picker geeft geen duidelijke bevestiging dat een klik gelukt is —
    // zonder deze check leidde een dubbele klik (of "het werkte toch niet?"
    // opnieuw proberen) tot dezelfde apparaat-regel meerdere keren, zowel
    // intern als (voorheen) in de klantversie.
    const alreadyAdded = items.some((i) => i.appliance_id === appliance.id)
    if (alreadyAdded && !confirm(`${appliance.brand} ${appliance.model} staat al in de offerte. Toch nog een keer toevoegen?`)) {
      return
    }
    setItems((prev) => [
      ...prev,
      newDraftItem({
        type: 'apparaat',
        appliance_id: appliance.id,
        description: `${appliance.brand} ${appliance.model}`,
        brand: appliance.brand,
        model: appliance.model,
        unit_price: appliance.price ?? 0,
        sort_order: prev.length,
        include_in_customer_view: !ACCESSOIRE_APPLIANCE_TYPES.includes(appliance.type),
      }),
    ])
    if (!ACCESSOIRE_APPLIANCE_TYPES.includes(appliance.type)) {
      addSectionLines('apparatuur', CUSTOMER_CATEGORY_LABELS.apparatuur, [applianceCustomerText(appliance)])
    }
  }

  // Direct vanuit een Accessoires-paragraaf in "Wat zit erin" een kraan/
  // spoelbak uit de bibliotheek kiezen — voegt 'm zowel toe als interne,
  // geprijsde regel (zelfde kostprijs-opbouw als ander apparatuur) én
  // meteen als tekstregel in déze specifieke sectie, zonder de omweg via
  // de Regels-tabel + "overzetten naar klantversie".
  function addAccessoireToSection(sectionIdx: number, appliance: Appliance) {
    addApplianceItem(appliance)
    const text = `${appliance.brand} ${appliance.model}`
    setCustomerSections((prev) =>
      prev.map((s, i) => (i === sectionIdx ? { ...s, lines: [...s.lines, { text, included: true }] } : s))
    )
  }

  function addManualItem() {
    setItems((prev) => [...prev, newDraftItem({ description: '', sort_order: prev.length })])
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  // Toont het apparatuur-type (Vaatwasser, Oven, ...) onder de omschrijving —
  // alleen zichtbaar in merk/model, niet in welke categorie het valt, dus
  // dit haalt dat op uit de bibliotheek-data die al als prop binnenkomt.
  function applianceTypeLabel(item: DraftItem): string | null {
    if (!item.appliance_id) return null
    const appliance = appliances.find((a) => a.id === item.appliance_id)
    return appliance ? APPLIANCE_TYPE_LABELS[appliance.type] : null
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleSave() {
    if (!quote) return
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const changedBy = user?.email ?? null

    // "auto"-rijen (Keukenkastjes/Apparatuur) slaan het live-berekende bedrag
    // op i.p.v. de mogelijk verouderde opgeslagen waarde.
    const finalCostBreakdown = costBreakdown.map((r) => ({ ...r, werkelijke_kosten: displayedCost(r) }))
    const finalTotal = totalSource === 'auto' ? totaalPrijsInclBtw : totalValue
    // Eerste keer dat de status op 'akkoord' komt te staan — voor de
    // omzet-rapportage op /financieel. Blijft daarna staan, ook als de
    // status later weer wijzigt (historisch moment van accorderen).
    const justAccorded = status === 'akkoord' && !quote.akkoord_at
    const akkoordAt = justAccorded ? new Date().toISOString() : quote.akkoord_at

    const before = {
      status: quote.status,
      total_price: quote.total_price,
    }
    const quoteUpdate = {
      status,
      akkoord_at: akkoordAt,
      plattegrond_url: plattegrondUrl || null,
      render_urls: renderUrls,
      standaard_afbeeldingen: standaardAfbeeldingen,
      cover_image_url: coverImageUrl || null,
      cost_breakdown: finalCostBreakdown,
      subtotal: totaalKostenExclMarge,
      subtotal_source: 'auto' as const,
      korting_percentage: 0,
      korting_percentage_source: 'def' as const,
      btw_percentage: btwPercentage,
      total_price: finalTotal,
      total_price_source: totalSource,
      customer_document_label: customerDocumentLabel || 'Prijsindicatie',
      customer_headline: customerHeadline || null,
      customer_subtitle: customerSubtitle || null,
      customer_intro_text: customerIntroText || null,
      customer_sections: customerSections,
      customer_cost_lines: customerCostLines,
      connections_image_url: connectionsImageUrl || null,
      customer_connections_intro: customerConnectionsIntro || null,
      customer_connections_disclaimer: customerConnectionsDisclaimer || null,
      customer_connections: customerConnections,
      customer_closing_heading: customerClosingHeading || null,
      customer_closing_text: customerClosingText || null,
      customer_closing_quote: customerClosingQuote || null,
      customer_disclaimer_text: customerDisclaimerText || null,
      page_disclaimers: pageDisclaimers,
      customer_price: customerPriceSource === 'def' ? null : customerPriceValue,
      customer_price_source: customerPriceSource,
      updated_by: changedBy,
      updated_at: new Date().toISOString(),
    }

    const { error: quoteError } = await supabase.from('finka_quotes').update(quoteUpdate).eq('id', quote.id)
    if (quoteError) {
      setError(quoteError.message)
      setSaving(false)
      return
    }
    await logFieldChanges(supabase, 'finka_quotes', quote.id, before, quoteUpdate, changedBy)

    // Legt de begrote bedragen per categorie vast zodra de offerte voor het
    // eerst wordt geaccordeerd — ijkpunt voor het Financieel-tabblad
    // (begroot vs. werkelijk), blijft daarna ongewijzigd staan ook als deze
    // offerte later nog verandert.
    if (justAccorded) {
      const { error: financialsError } = await supabase
        .from('finka_project_financials')
        .upsert(
          finalCostBreakdown.map((row) => ({
            project_id: projectId,
            category: row.key,
            begroot_bedrag: row.werkelijke_kosten,
            marge_percentage: row.marge_percentage,
            // Startpunt = begroot, staff corrigeert zodra de echte kosten
            // bekend zijn (en vinkt dan "betaald" aan).
            werkelijk_bedrag: row.werkelijke_kosten,
          })),
          { onConflict: 'project_id,category' }
        )
      if (financialsError) setError(financialsError.message)
    }

    const currentIds = new Set(items.filter((i) => !i.isNew).map((i) => i.id))
    const toDelete = [...originalItemIds.current].filter((id) => !currentIds.has(id))
    const toInsert = items.filter((i) => i.isNew)
    const toUpdate = items.filter((i) => !i.isNew)

    if (toDelete.length) {
      await supabase.from('finka_quote_items').delete().in('id', toDelete)
    }
    let insertedRows: QuoteItem[] = []
    if (toInsert.length) {
      const { data: insertedData, error: insError } = await supabase
        .from('finka_quote_items')
        .insert(
          toInsert.map(({ id: _id, isNew: _isNew, ...rest }, idx) => ({
            ...rest,
            line_total: lineTotal(rest),
            quote_id: quote.id,
            sort_order: idx,
          }))
        )
        .select()
      if (insError) {
        setError(insError.message)
        setSaving(false)
        return
      }
      insertedRows = (insertedData ?? []) as QuoteItem[]
    }
    await Promise.all(
      toUpdate.map((item) => {
        const { id, isNew: _isNew, ...rest } = item
        return supabase.from('finka_quote_items').update({ ...rest, line_total: lineTotal(item) }).eq('id', id)
      })
    )

    // Koppelt elke tijdelijke id aan zijn echte, door Supabase gegenereerde
    // rij via een id-map + functionele setItems, i.p.v. de state te
    // overschrijven met de `items`-snapshot van bij de start van handleSave.
    // Die snapshot kan intussen verouderd zijn — deze loop deed voorheen een
    // los request per regel en kon dus meerdere seconden duren, tijd genoeg
    // om ondertussen een regel toe te voegen of te verwijderen. Overschrijven
    // met de oude snapshot maakte die tussentijdse wijziging dan ongedaan:
    // de oorzaak van zowel spontaan verdwenen als spontaan terugkerende
    // ("dubbele") regels.
    const idMap = new Map(toInsert.map((item, idx) => [item.id, insertedRows[idx]]))
    const deletedSet = new Set(toDelete)
    setItems((prev) =>
      prev
        .filter((i) => !deletedSet.has(i.id))
        .map((i) => {
          const inserted = idMap.get(i.id)
          return inserted ? { ...inserted, isNew: false } : i
        })
    )
    originalItemIds.current = new Set(
      [...originalItemIds.current].filter((id) => !deletedSet.has(id)).concat(insertedRows.map((r) => r.id))
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  if (!quote) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
        <p className="text-sm text-[#6B6560] mb-4">Nog geen offerte voor dit project.</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <Button onClick={createQuote} disabled={creating}>
          {creating ? 'Aanmaken...' : 'Offerte aanmaken'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AppliancePickerModal
        open={accessoirePickerSectionIdx !== null}
        onOpenChange={(open) => { if (!open) setAccessoirePickerSectionIdx(null) }}
        appliances={appliances.filter((a) => ACCESSOIRE_APPLIANCE_TYPES.includes(a.type))}
        onSelect={(appliance) => {
          if (accessoirePickerSectionIdx !== null) addAccessoireToSection(accessoirePickerSectionIdx, appliance)
        }}
      />

      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Quote['status'])}
            className="px-3 py-1.5 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
          >
            <option value="concept">Concept</option>
            <option value="verstuurd">Verstuurd</option>
            <option value="akkoord">Akkoord</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#9A948D]">Versie {quote.version}</span>
          <a
            href={`/offerte/${projectId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#C9A96E] hover:underline"
          >
            Klantversie bekijken →
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{error}</p>}

      {/* Downloadgeschiedenis — elke klik op "Download PDF" (op de
         klantversie-pagina) komt hier automatisch bij te staan, incl. wat er
         t.o.v. de vorige download is gewijzigd. Zie src/lib/quote-download-diff.ts. */}
      <div className="bg-white rounded-lg border border-[#DDD8D2] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDownloadsCollapsed((v) => !v)}
            title={downloadsCollapsed ? 'Uitklappen' : 'Inklappen'}
            className="shrink-0 text-[#9A948D] hover:text-[#1C1B19]"
          >
            <ChevronDown size={15} className={downloadsCollapsed ? '-rotate-90 transition-transform' : 'transition-transform'} />
          </button>
          <span className="flex-1 text-sm font-medium text-[#1C1B19]">Downloadgeschiedenis</span>
          <span className="text-xs text-[#9A948D]">
            {downloads.length === 0 ? 'nog niet gedownload' : `${downloads.length}× gedownload`}
          </span>
        </div>
        {!downloadsCollapsed && (
          downloads.length === 0 ? (
            <p className="text-xs text-[#6B6560]">Deze offerte is nog niet als PDF gedownload.</p>
          ) : (
            <div className="divide-y divide-[#DDD8D2]">
              {downloads.map((d, idx) => {
                const isFirst = idx === downloads.length - 1
                return (
                  <div key={d.id} className="py-2.5 flex items-start justify-between gap-4">
                    <div>
                      {isFirst ? (
                        <p className="text-xs text-[#9A948D]">Eerste download</p>
                      ) : d.changes.length === 0 ? (
                        <p className="text-xs text-[#9A948D]">Geen inhoudelijke wijzigingen t.o.v. vorige download</p>
                      ) : (
                        <ul className="text-xs text-[#6B6560] space-y-0.5 list-disc list-inside">
                          {d.changes.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[#1C1B19]">
                        {new Date(d.downloaded_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-xs text-[#9A948D]">{d.downloaded_by ?? 'Onbekend'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Afbeeldingen — gedeelde assets, komen terug in de klantversie */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Plattegrond</Label>
          <input ref={plattegrondInputRef} type="file" accept="image/*" hidden onChange={handlePlattegrondUpload} />
          {plattegrondUrl ? (
            <div className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={plattegrondUrl} alt="Plattegrond" className="w-full h-32 object-cover rounded-lg border border-[#DDD8D2]" />
              <button
                onClick={() => setPlattegrondUrl('')}
                className="absolute top-1.5 right-1.5 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => plattegrondInputRef.current?.click()}
              disabled={uploadingPlattegrond}
              className="w-full h-32 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#DDD8D2] text-[#6B6560] hover:border-[#C9A96E] transition-colors"
            >
              <Upload size={16} />
              <span className="text-xs">{uploadingPlattegrond ? 'Uploaden...' : 'Plattegrond uploaden'}</span>
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Renders</Label>
          <input ref={renderInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleGalleryUpload(e, 'render', setRenderUrls, setUploadingRender)} />
          <div className="grid grid-cols-2 gap-1.5">
            {renderUrls.map((url, i) => (
              <div key={url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Render ${i + 1}`} className="w-full h-14 object-cover rounded-lg border border-[#DDD8D2]" />
                <button
                  onClick={() => setRenderUrls((prev) => prev.filter((u) => u !== url))}
                  className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <button
              onClick={() => renderInputRef.current?.click()}
              disabled={uploadingRender}
              className="h-14 flex items-center justify-center rounded-lg border border-dashed border-[#DDD8D2] text-[#6B6560] hover:border-[#C9A96E] transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Voorpagina-afbeelding</Label>
          <input ref={standaardInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleGalleryUpload(e, 'standaard', setStandaardAfbeeldingen, setUploadingStandaard)} />
          <div className="flex items-center gap-3">
            {coverImageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={coverImageUrl} alt="Gekozen voorpagina-afbeelding" className="w-20 h-14 object-cover rounded-lg border border-[#DDD8D2]" />
            )}
            <Button variant="outline" size="sm" onClick={() => setCoverPickerOpen(true)}>
              {coverImageUrl ? 'Andere foto kiezen' : 'Foto kiezen'}
            </Button>
          </div>
        </div>
      </div>

      <PageDisclaimerField
        label="Disclaimer — ontwerp/tekening (herhaalt op elke pagina van deze sectie)"
        value={pageDisclaimers.ontwerp ?? ''}
        onChange={(v) => updatePageDisclaimer('ontwerp', v)}
      />

      <Dialog open={coverPickerOpen} onOpenChange={setCoverPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Voorpagina-afbeelding kiezen</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[#6B6560]">
            Klik een foto aan om 'm als voorpagina-afbeelding (achter de titel) te gebruiken — renders en de tekening komen pas later in het document.
          </p>
          <div className="overflow-y-auto -mx-6 px-6">
            <div className="grid grid-cols-3 gap-2">
              {standaardAfbeeldingen.map((url, i) => {
                const selected = coverImageUrl === url
                return (
                  <div key={url} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Voorpagina-optie ${i + 1}`}
                      onClick={() => { setCoverImageUrl(url); setCoverPickerOpen(false) }}
                      className={`w-full h-24 object-cover rounded-lg border-2 cursor-pointer ${selected ? 'border-[#C9A96E]' : 'border-[#DDD8D2] hover:border-[#C9A96E]/50'}`}
                    />
                    {selected && (
                      <span className="absolute bottom-1 left-1 text-[9px] bg-[#C9A96E] text-white rounded px-1.5 py-0.5">Gekozen</span>
                    )}
                    <button
                      onClick={() => {
                        setStandaardAfbeeldingen((prev) => prev.filter((u) => u !== url))
                        if (selected) setCoverImageUrl('')
                      }}
                      className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}
              <button
                onClick={() => standaardInputRef.current?.click()}
                disabled={uploadingStandaard}
                className="h-24 flex items-center justify-center rounded-lg border border-dashed border-[#DDD8D2] text-[#6B6560] hover:border-[#C9A96E] transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Winner Flex / technische uitdraai — verhuisd naar het Configurator-tabblad
         (onderdeel "Kasten"), incl. de mogelijkheid om meerdere opties te vergelijken. */}

      {/* Werkblad-specificatie — verhuisd naar het Configurator-tabblad
         (onderdeel "Werkblad"), incl. de mogelijkheid om meerdere opties te vergelijken. */}

      {/* Apparatuur — verhuisd naar het Configurator-tabblad, incl. de
         mogelijkheid om meerdere opties (bv. andere merken) te vergelijken. */}

      {/* Interne regels — kostprijzen, NOOIT automatisch zichtbaar voor de klant */}
      <div>
        <h3 className="text-sm font-medium text-[#1C1B19] mb-1">Interne regels (kostprijzen)</h3>
        <p className="text-xs text-[#6B6560] mb-1">
          Dit ziet de klant nooit automatisch. Klik op de pijl om een regel als tekst over te zetten naar de klantversie hieronder.
        </p>
        <p className="text-xs text-[#6B6560] mb-3">
          <span className="inline-flex items-center rounded border border-[#DDD8D2] bg-[#EDE9E4] px-1.5 py-0.5 text-[10px] font-semibold mr-1">IN</span>
          = zelf ingevuld ·{' '}
          <span className="inline-flex items-center rounded border border-[#C9A96E]/40 bg-[#C9A96E]/15 px-1.5 py-0.5 text-[10px] font-semibold mr-1">AUTO</span>
          = automatisch berekend (aantal × prijs) — je kunt dit altijd overschrijven, dan wordt het IN. Met het pijltje ↺ zet je 'm terug naar automatisch.
        </p>
        <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#6B6560] w-28">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#6B6560]">Omschrijving</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-20">Aantal</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-40">Prijs p.st.</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-40">Totaal</th>
                <th className="text-center px-2 py-2.5 text-xs font-medium text-[#6B6560] w-20">Klantversie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD8D2]">
              {items.map((item) => {
                const applianceType = applianceTypeLabel(item)
                return (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    <select
                      value={item.type}
                      onChange={(e) => updateItem(item.id, { type: e.target.value as QuoteItemType })}
                      className="w-full text-xs bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-1 py-1 focus:outline-none focus:border-[#1C1B19]"
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      placeholder="Omschrijving..."
                      className="w-full text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                    />
                    {applianceType && <span className="block text-xs text-[#9A948D] px-2 mt-0.5">{applianceType}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                      className="w-full text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateItem(item.id, { unit_price: round2(Number(e.target.value)), unit_price_source: 'in' })}
                        className="w-full min-w-0 text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <SourceTag source={item.unit_price_source} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={lineTotal(item)}
                        onChange={(e) => updateItem(item.id, { line_total: round2(Number(e.target.value)), line_total_source: 'in' })}
                        className="w-full min-w-0 text-sm text-right font-medium bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <SourceTag source={item.line_total_source} />
                      {item.line_total_source === 'in' && (
                        <button title="Terug naar automatisch berekend" onClick={() => updateItem(item.id, { line_total_source: 'auto' })}>
                          <RotateCcw size={12} className="text-[#9A948D] hover:text-[#1C1B19]" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => addItemToCustomerView(item)}
                        title="Overzetten naar klantversie"
                        className={item.include_in_customer_view ? 'text-green-600' : 'text-[#9A948D] hover:text-[#1C1B19]'}
                      >
                        <ArrowRight size={14} />
                      </button>
                      <button onClick={() => removeItem(item.id)} title="Regel verwijderen">
                        <Trash2 size={14} className="text-[#9A948D] hover:text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex gap-2 px-4 py-3 border-t border-[#DDD8D2] bg-[#F7F5F2]">
            <Button variant="outline" size="sm" onClick={addManualItem}>
              <Plus size={13} className="mr-1.5" />
              Losse regel
            </Button>
          </div>
        </div>

        {/* Interne kostprijs-opbouw */}
        <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#DDD8D2] bg-[#F7F5F2]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#6B6560]">Categorie</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-48">Werkelijke kosten</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-24">Marge %</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6B6560] w-32">Totaal excl. BTW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD8D2]">
              {costBreakdown.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-2 text-[#1C1B19]">{row.label}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={displayedCost(row)}
                        onChange={(e) => updateCostRow(row.key, { werkelijke_kosten: round2(Number(e.target.value)), werkelijke_kosten_source: 'in' })}
                        className="w-full min-w-0 text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <SourceTag source={row.werkelijke_kosten_source} />
                      {row.werkelijke_kosten_source === 'in' && (row.key === 'keukenkastjes' || row.key === 'apparatuur') && (
                        <button title="Terug naar automatisch" onClick={() => updateCostRow(row.key, { werkelijke_kosten_source: 'auto' })}>
                          <RotateCcw size={12} className="text-[#9A948D] hover:text-[#1C1B19]" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="1"
                      value={row.marge_percentage}
                      onChange={(e) => updateCostRow(row.key, { marge_percentage: Number(e.target.value), marge_percentage_source: 'in' })}
                      className="w-full text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-[#1C1B19]">
                    {formatPrice(displayedCost(row) * (1 + row.marge_percentage / 100))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#DDD8D2] bg-[#F7F5F2]">
                <td className="px-4 py-2.5 text-sm font-medium text-[#1C1B19]">Totaal</td>
                <td className="px-4 py-2.5 text-right text-sm text-[#6B6560]">{formatPrice(totaalKostenExclMarge)}</td>
                <td />
                <td className="px-4 py-2.5 text-right text-sm font-medium text-[#1C1B19]">{formatPrice(totaalPrijsExclBtw)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Euroline-rekentool (Opslag, levering, installatie, service) —
           verhuisd naar het Configurator-tabblad. */}

        {/* Eén compact blok: BTW/totaal + marge-overzicht. Marge-overzicht
           leest rechtstreeks uit de categorietabel hierboven, dus kan nooit
           een ander getal tonen dan wat daar staat. */}
        <div className="bg-white rounded-xl border border-[#DDD8D2] p-4 max-w-md ml-auto space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">BTW (%)</Label>
              <Input type="number" step="0.1" value={btwPercentage} onChange={(e) => setBtwPercentage(Number(e.target.value))} className="h-8" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">Kostprijs incl. BTW</Label>
                <SourceTag source={totalSource} />
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.01"
                  value={liveTotal}
                  onChange={(e) => { setTotalValue(round2(Number(e.target.value))); setTotalSource('in') }}
                  className="h-8 font-semibold"
                />
                {totalSource === 'in' && (
                  <button title="Terug naar automatisch berekend" onClick={() => setTotalSource('auto')}>
                    <RotateCcw size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm pt-2 border-t border-[#DDD8D2]">
            <span className="text-[#6B6560]">Inkoopprijs</span>
            <span className="text-right font-medium text-[#1C1B19]">{formatPrice(totaalKostenExclMarge)}</span>

            <span className="text-[#6B6560]">Marge</span>
            <span className="text-right font-medium text-[#1C1B19]">
              {formatPrice(effectiveMarginEuro)} <span className="text-[#9A948D] font-normal">({effectiveMarginPercentage.toFixed(1)}%)</span>
            </span>

            <span className="text-[#6B6560]">Klantprijs</span>
            <span className="text-right font-medium text-[#1C1B19]">{formatPrice(totaalPrijsInclBtw)}</span>

            <span className="text-[#6B6560]">Netto marge</span>
            <span className="text-right font-medium text-[#1C1B19]">{effectiveNettoPercentageOfPrice.toFixed(1)}%</span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[#DDD8D2]">
            <Input
              type="number"
              step="1"
              value={overallMarginPercentage}
              onChange={(e) => setOverallMarginPercentage(Number(e.target.value))}
              className="h-8 max-w-[70px]"
              placeholder="%"
            />
            <Button variant="outline" size="sm" onClick={applyMarginToAllRows}>Marge toepassen</Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => { setCustomerPriceValue(totaalPrijsInclBtw); setCustomerPriceSource('in') }}
          >
            Gebruik als klantprijs in de offerte
          </Button>
        </div>
      </div>

      {/* Klantversie — dit (en alleen dit) ziet de klant */}
      <div className="bg-[#F5F2EE] rounded-xl border-2 border-[#C9A96E]/40 p-6 space-y-5">
        <div>
          <h3 className="text-base font-medium text-[#1C1B19]">Klantversie</h3>
          <p className="text-xs text-[#6B6560] mt-0.5">
            Dit is wat de klant te zien krijgt. Niets van hierboven staat hier automatisch in — alles hieronder is los bewerkbaar.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Documentnaam</Label>
          <Input
            value={customerDocumentLabel}
            onChange={(e) => setCustomerDocumentLabel(e.target.value)}
            placeholder="Prijsindicatie"
            className="max-w-xs"
          />
          <p className="text-xs text-[#9A948D]">Vervangt overal in het document het woord "Prijsindicatie", bijv. door "Offerte".</p>
        </div>

        <div className="space-y-1.5">
          <Label>Titel op voorpagina</Label>
          <textarea
            value={customerHeadline}
            onChange={(e) => setCustomerHeadline(e.target.value)}
            rows={2}
            placeholder={'Bijv. Een woonkeuken\nin *Heemstede*.'}
            className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerHeadline)}`}
          />
          <p className="text-xs text-[#9A948D]">
            Zet een woord tussen *sterretjes* voor cursief. Druk Enter om de titel over 2 regels te verdelen.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Korte omschrijving (onder de titel)</Label>
          <textarea
            value={customerSubtitle}
            onChange={(e) => setCustomerSubtitle(e.target.value)}
            rows={2}
            placeholder="Bijv. Hoogwaardig houtfineer, een RVS blad van 4mm, een kookeiland van 3 meter..."
            className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerSubtitle)}`}
          />
          <PageDisclaimerField
            label="Disclaimer — voorpagina"
            value={pageDisclaimers.voorpagina ?? ''}
            onChange={(v) => updatePageDisclaimer('voorpagina', v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Introtekst</Label>
          <textarea
            value={customerIntroText}
            onChange={(e) => setCustomerIntroText(e.target.value)}
            rows={4}
            placeholder={'Hi ...,\n\nHierbij geven we jullie een nieuwe prijsindicatie...'}
            className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerIntroText)}`}
          />
          <PageDisclaimerField
            label="Disclaimer — toelichting"
            value={pageDisclaimers.toelichting ?? ''}
            onChange={(v) => updatePageDisclaimer('toelichting', v)}
          />
        </div>

        <div className="space-y-3">
          <div>
            <Label>Wat zit erin</Label>
            <p className="text-xs text-[#6B6560] mt-0.5">
              Klik op het bolletje om een regel uit te sluiten van de klantofferte (rood) — de regel blijft hier gewoon staan, maar wordt niet meegeprint. Elke sectie krijgt straks zijn eigen pagina, gegroepeerd op categorie (Kasten/Werkblad/Apparatuur/Overig). Sleep aan het grijpicoontje om regels binnen een sectie te herordenen, of sleep aan het grijpicoontje links van een sectiekop om de volgorde van hele secties aan te passen. Typ <code className="px-1 bg-[#F0EDE9] rounded">==tekst==</code> om jezelf te herinneren dat iets nog niet af is — dat veld krijgt een rode rand, en in de klantversie wordt het knalrood getoond zodat je het niet per ongeluk laat staan. Elke sectie heeft onderaan een eigen "Disclaimer toevoegen"-knopje.
            </p>
          </div>
          {customerSections.map((section, sIdx) => {
            const collapsed = collapsedSections.has(sIdx)
            return (
            <div
              key={sIdx}
              id={`customer-section-${sIdx}`}
              className={`bg-white rounded-lg border border-[#DDD8D2] p-4 space-y-2 ${
                draggedSectionIdx === sIdx ? 'opacity-40' : ''
              }`}
              onDragOver={(e) => {
                if (draggedSectionIdx !== null) e.preventDefault()
              }}
              onDrop={(e) => {
                if (draggedSectionIdx === null) return
                e.preventDefault()
                moveSection(draggedSectionIdx, sIdx)
                setDraggedSectionIdx(null)
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={() => setDraggedSectionIdx(sIdx)}
                  onDragEnd={() => setDraggedSectionIdx(null)}
                  title="Sleep om secties te herordenen"
                  className="shrink-0 cursor-grab text-[#C7C2BB] hover:text-[#6B6560] active:cursor-grabbing"
                >
                  <GripVertical size={15} />
                </span>
                <button
                  type="button"
                  onClick={() => toggleSectionCollapsed(sIdx)}
                  title={collapsed ? 'Uitklappen' : 'Inklappen'}
                  className="shrink-0 text-[#9A948D] hover:text-[#1C1B19]"
                >
                  <ChevronDown size={15} className={collapsed ? '-rotate-90 transition-transform' : 'transition-transform'} />
                </button>
                <select
                  value={section.category}
                  onChange={(e) => updateSectionCategory(sIdx, e.target.value as QuoteCustomerCategory)}
                  className="text-xs bg-[#F7F5F2] border border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                >
                  {Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  value={section.title}
                  onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                  className={`flex-1 text-sm font-medium bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${markerClass(section.title)}`}
                />
                {collapsed && (
                  <span className="text-xs text-[#9A948D]">{section.lines.length} regel{section.lines.length === 1 ? '' : 's'}</span>
                )}
                <button onClick={() => removeSection(sIdx)} title="Sectie verwijderen">
                  <Trash2 size={13} className="text-[#9A948D] hover:text-red-600" />
                </button>
              </div>
              {!collapsed && (
              <>
              <div className="space-y-1">
                {section.lines.map((line, lIdx) => (
                  <div
                    key={lIdx}
                    className={`flex items-center gap-2 rounded ${
                      draggedLine?.sectionIdx === sIdx && draggedLine?.lineIdx === lIdx ? 'opacity-40' : ''
                    }`}
                    onDragOver={(e) => {
                      if (draggedLine?.sectionIdx === sIdx) e.preventDefault()
                    }}
                    onDrop={(e) => {
                      if (draggedLine?.sectionIdx !== sIdx) return
                      e.preventDefault()
                      moveSectionLine(sIdx, draggedLine.lineIdx, lIdx)
                      setDraggedLine(null)
                    }}
                  >
                    <span
                      draggable
                      onDragStart={() => setDraggedLine({ sectionIdx: sIdx, lineIdx: lIdx })}
                      onDragEnd={() => setDraggedLine(null)}
                      title="Sleep om te herordenen"
                      className="shrink-0 cursor-grab text-[#C7C2BB] hover:text-[#6B6560] active:cursor-grabbing"
                    >
                      <GripVertical size={13} />
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSectionLineIncluded(sIdx, lIdx)}
                      title={line.included ? 'Zichtbaar voor klant — klik om uit te sluiten' : 'Uitgesloten van klantofferte — klik om weer op te nemen'}
                      className="shrink-0 rounded-full border border-black/10"
                      style={{ width: 14, height: 14, backgroundColor: line.included ? '#22C55E' : '#EF4444' }}
                    />
                    <input
                      value={line.text}
                      onChange={(e) => updateSectionLine(sIdx, lIdx, e.target.value)}
                      className={`flex-1 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${!line.included ? 'line-through text-[#9A948D]' : ''} ${markerClass(line.text)}`}
                    />
                    <button onClick={() => removeSectionLine(sIdx, lIdx)} title="Regel verwijderen">
                      <X size={12} className="text-[#9A948D] hover:text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => addSectionLine(sIdx)}>
                  <Plus size={12} className="mr-1.5" />
                  Regel
                </Button>
                {section.category === 'accessoires' && (
                  <Button variant="outline" size="sm" onClick={() => setAccessoirePickerSectionIdx(sIdx)}>
                    <Zap size={12} className="mr-1.5" />
                    Kies uit bibliotheek
                  </Button>
                )}
                <label
                  htmlFor={`section-image-${sIdx}`}
                  className="inline-flex items-center h-8 px-3 rounded-lg border border-[#DDD8D2] text-sm text-[#1C1B19] hover:bg-[#F7F5F2] cursor-pointer"
                >
                  <input
                    id={`section-image-${sIdx}`}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => handleSectionImageUpload(sIdx, e)}
                  />
                  <Plus size={12} className="mr-1.5" />
                  Sfeerfoto
                </label>
                {(section.images ?? []).map((url) => (
                  <div key={url} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Sfeerfoto" className="w-14 h-14 object-cover rounded border border-[#DDD8D2]" />
                    <button
                      onClick={() => removeSectionImage(sIdx, url)}
                      className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 border border-[#DDD8D2] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {(section.images ?? []).length > 0 && (
                  <div className="flex items-center gap-1 ml-1">
                    {(['boven', 'rechts', 'onder'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => updateSectionImagePosition(sIdx, pos)}
                        title={`Foto ${pos} tekst plaatsen`}
                        className={`text-xs px-2 py-1 rounded-md border capitalize transition-colors ${
                          (section.imagePosition ?? 'rechts') === pos
                            ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                            : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                )}
                {(section.images ?? []).length > 0 && (
                  <div className="flex items-center gap-1">
                    {(['klein', 'medium', 'groot'] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => updateSectionImageSize(sIdx, size)}
                        title={`Foto-formaat: ${size}`}
                        className={`text-xs px-2 py-1 rounded-md border capitalize transition-colors ${
                          (section.imageSize ?? 'medium') === size
                            ? 'bg-[#1C1B19] text-white border-[#1C1B19]'
                            : 'bg-white text-[#6B6560] border-[#DDD8D2] hover:border-[#1C1B19]'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <PageDisclaimerField
                label="Disclaimer — onderaan deze sectie"
                value={section.disclaimer ?? ''}
                onChange={(v) => updateSectionDisclaimer(sIdx, v)}
              />
              </>
              )}
            </div>
            )
          })}

          {/* Kosten — zelfde inklapbare witte balk als de secties hierboven */}
          <div className="bg-white rounded-lg border border-[#DDD8D2] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKostenCollapsed((v) => !v)}
                title={kostenCollapsed ? 'Uitklappen' : 'Inklappen'}
                className="shrink-0 text-[#9A948D] hover:text-[#1C1B19]"
              >
                <ChevronDown size={15} className={kostenCollapsed ? '-rotate-90 transition-transform' : 'transition-transform'} />
              </button>
              <span className="flex-1 text-sm font-medium text-[#1C1B19]">Kosten (optioneel)</span>
              {kostenCollapsed && (
                <span className="text-xs text-[#9A948D]">{customerCostLines.length} regel{customerCostLines.length === 1 ? '' : 's'}</span>
              )}
            </div>
            {!kostenCollapsed && (
              <>
                <p className="text-xs text-[#6B6560]">
                  Losse, handmatige regels — verschijnt alleen als hier iets staat. Nooit automatisch gevuld vanuit de interne kostprijzen.
                </p>
                {customerCostLines.length > 0 && (
                  <div className="bg-[#F7F5F2] rounded-lg border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
                    {customerCostLines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3">
                        <input
                          value={line.label}
                          onChange={(e) => updateCostLine(idx, { label: e.target.value })}
                          placeholder="Bijv. Keuken"
                          className={`w-32 text-sm font-medium bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] uppercase ${markerClass(line.label)}`}
                        />
                        <input
                          value={line.description}
                          onChange={(e) => updateCostLine(idx, { description: e.target.value })}
                          placeholder="Omschrijving..."
                          className={`flex-1 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${markerClass(line.description)}`}
                        />
                        <input
                          type="number"
                          value={line.amount}
                          onChange={(e) => updateCostLine(idx, { amount: round2(Number(e.target.value)) })}
                          className="w-24 text-sm text-right bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19]"
                        />
                        <button onClick={() => removeCostLine(idx)} title="Regel verwijderen">
                          <X size={13} className="text-[#9A948D] hover:text-red-600" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-2 p-3 font-medium text-sm">
                      <span className="text-[#6B6560]">Totaal</span>
                      <span className="w-24 text-right">{formatPrice(customerCostLines.reduce((s, l) => s + l.amount, 0))}</span>
                      <span className="w-[13px]" />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={addCostLine}>
                    <Plus size={12} className="mr-1.5" />
                    Regel toevoegen
                  </Button>
                  <Button variant="outline" size="sm" onClick={fillCostLinesFromInternal}>
                    Suggestie invullen vanuit kostprijzen
                  </Button>
                </div>
                <PageDisclaimerField
                  label="Disclaimer — kosten"
                  value={pageDisclaimers.kosten ?? ''}
                  onChange={(v) => updatePageDisclaimer('kosten', v)}
                />
              </>
            )}
          </div>

          {/* Opstelling en aansluitingen — zelfde inklapbare witte balk */}
          <div className="bg-white rounded-lg border border-[#DDD8D2] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConnectionsCollapsed((v) => !v)}
                title={connectionsCollapsed ? 'Uitklappen' : 'Inklappen'}
                className="shrink-0 text-[#9A948D] hover:text-[#1C1B19]"
              >
                <ChevronDown size={15} className={connectionsCollapsed ? '-rotate-90 transition-transform' : 'transition-transform'} />
              </button>
              <span className="flex-1 text-sm font-medium text-[#1C1B19]">Opstelling en aansluitingen (optioneel)</span>
              {connectionsCollapsed && (
                <span className="text-xs text-[#9A948D]">{customerConnections.length} regel{customerConnections.length === 1 ? '' : 's'}</span>
              )}
            </div>
            {!connectionsCollapsed && (
              <>
                <p className="text-xs text-[#6B6560]">Verschijnt alleen als hier regels zijn ingevuld.</p>

                <div className="space-y-1.5">
                  <Label>Toelichting</Label>
                  <textarea
                    value={customerConnectionsIntro}
                    onChange={(e) => setCustomerConnectionsIntro(e.target.value)}
                    rows={2}
                    placeholder="Bijv. Van links naar rechts: voor alle aansluitingen graag stopcontacten aan 1-1.5m flexibele buis..."
                    className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerConnectionsIntro)}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Tekening (optioneel)</Label>
                  <input ref={connectionsImageInputRef} type="file" accept="image/*" hidden onChange={handleConnectionsImageUpload} />
                  {connectionsImageUrl ? (
                    <div className="relative group w-40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={connectionsImageUrl} alt="Opstelling" className="w-full h-24 object-cover rounded-lg border border-[#DDD8D2]" />
                      <button
                        onClick={() => setConnectionsImageUrl('')}
                        className="absolute top-1.5 right-1.5 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => connectionsImageInputRef.current?.click()} disabled={uploadingConnectionsImage}>
                      <Upload size={13} className="mr-1.5" />
                      {uploadingConnectionsImage ? 'Uploaden...' : 'Tekening uploaden'}
                    </Button>
                  )}
                </div>

                {customerConnections.length > 0 && (
                  <div className="bg-[#F7F5F2] rounded-lg border border-[#DDD8D2] divide-y divide-[#DDD8D2]">
                    {customerConnections.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3">
                        <input
                          value={row.kast}
                          onChange={(e) => updateConnectionRow(idx, { kast: e.target.value })}
                          placeholder="Bijv. Kast met oven en inductiekookplaat"
                          className={`w-56 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${markerClass(row.kast)}`}
                        />
                        <input
                          value={row.aansluitingen}
                          onChange={(e) => updateConnectionRow(idx, { aansluitingen: e.target.value })}
                          placeholder="Bijv. 2x stopcontact, geaard"
                          className={`flex-1 text-sm bg-transparent border border-transparent hover:border-[#DDD8D2] rounded px-2 py-1 focus:outline-none focus:border-[#1C1B19] ${markerClass(row.aansluitingen)}`}
                        />
                        <button onClick={() => removeConnectionRow(idx)} title="Regel verwijderen">
                          <X size={13} className="text-[#9A948D] hover:text-red-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={addConnectionRow}>
                  <Plus size={12} className="mr-1.5" />
                  Regel toevoegen
                </Button>

                <div className="space-y-1.5">
                  <Label>Disclaimer</Label>
                  <textarea
                    value={customerConnectionsDisclaimer}
                    onChange={(e) => setCustomerConnectionsDisclaimer(e.target.value)}
                    rows={2}
                    placeholder={DEFAULT_CONNECTIONS_DISCLAIMER}
                    className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerConnectionsDisclaimer)}`}
                  />
                  <p className="text-xs text-[#9A948D]">Leeg laten = geen disclaimer tonen.</p>
                </div>
              </>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus size={13} className="mr-1.5" />
            Sectie toevoegen
          </Button>
        </div>

        <FieldWithSource label="Prijsindicatie voor de klant" source={customerPriceSource}>
          <div className="flex items-center gap-2 max-w-xs">
            <Input
              type="number"
              step="0.01"
              value={customerPriceValue}
              onChange={(e) => { setCustomerPriceValue(round2(Number(e.target.value))); setCustomerPriceSource('in') }}
              className="font-semibold"
            />
            {customerPriceSource === 'in' && (
              <button title="Overnemen van interne kostprijs" onClick={() => { setCustomerPriceValue(liveTotal); setCustomerPriceSource('auto') }}>
                <RotateCcw size={13} className="text-[#9A948D] hover:text-[#1C1B19]" />
              </button>
            )}
          </div>
        </FieldWithSource>

        <div className="space-y-1.5">
          <Label>Vervolgpagina — titel</Label>
          <Input
            value={customerClosingHeading}
            onChange={(e) => setCustomerClosingHeading(e.target.value)}
            placeholder="Bijv. Even laten bezinken."
            className={markerClass(customerClosingHeading)}
          />
          <p className="text-xs text-[#9A948D]">Krijgt een eigen pagina, in dezelfde stijl als de toelichting. Leeg = pagina verschijnt niet.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Vervolgpagina — tekst (volgende stappen)</Label>
          <textarea
            value={customerClosingText}
            onChange={(e) => setCustomerClosingText(e.target.value)}
            rows={3}
            placeholder="Volgende stap..."
            className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerClosingText)}`}
          />
          <PageDisclaimerField
            label="Disclaimer — vervolgpagina"
            value={pageDisclaimers.vervolg ?? ''}
            onChange={(v) => updatePageDisclaimer('vervolg', v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Afsluitende quote (laatste pagina)</Label>
          <Input
            value={customerClosingQuote}
            onChange={(e) => setCustomerClosingQuote(e.target.value)}
            placeholder={DEFAULT_CLOSING_QUOTE}
            className={markerClass(customerClosingQuote)}
          />
          <p className="text-xs text-[#9A948D]">Leeg laten = geen quote tonen.</p>
          <PageDisclaimerField
            label="Disclaimer — afsluitpagina"
            value={pageDisclaimers.afsluiting ?? ''}
            onChange={(v) => updatePageDisclaimer('afsluiting', v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Voorbehoud-tekst (onder de totaalprijs)</Label>
          <textarea
            value={customerDisclaimerText}
            onChange={(e) => setCustomerDisclaimerText(e.target.value)}
            rows={2}
            placeholder={DEFAULT_DISCLAIMER_TEXT}
            className={`w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none ${markerClass(customerDisclaimerText)}`}
          />
          <p className="text-xs text-[#9A948D]">Leeg laten = geen voorbehoud-zin tonen.</p>
        </div>
      </div>

      <div className="flex justify-end items-center gap-3">
        {saved && <span className="text-sm text-green-700">Opgeslagen ✓</span>}
        <a
          href={`/offerte/${projectId}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#C9A96E] hover:underline"
        >
          Klantversie bekijken →
        </a>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Opslaan...' : 'Offerte opslaan'}
        </Button>
      </div>
    </div>
  )
}
