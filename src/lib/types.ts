export type CustomerStatus = 'prospect' | 'actief' | 'afgerond' | 'on-hold'
export type ApplianceCategory = 'budget' | 'midden' | 'premium'
export type ApplianceType = 'kookplaat' | 'oven' | 'vaatwasser' | 'afzuigkap' | 'koelkast' | 'koelvries' | 'vriezer' | 'wijnklimaatkast' | 'combi-oven' | 'magnetron' | 'kokendwaterkraan' | 'kraan' | 'spoelbak' | 'anders'
export type OvenSubtype = 'solo' | 'combi-magnetron' | 'stoom'
// Huidige EU-energielabelschaal (A = zuinigst, G = minst zuinig).
export type EnergyLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type ProductLine = 'Studioline' | 'Accentline'
export type EmailStatus = 'pending' | 'processing' | 'processed' | 'skipped'

export interface Customer {
  id: string
  reference_number: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  notes: string | null
  status: CustomerStatus
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
}

export interface PriceQuote {
  price: number
  date: string | null
  supplier_name: string | null
  email_subject: string | null
}

export interface Appliance {
  id: string
  type: ApplianceType
  supplier_id: string | null
  brand: string
  model: string
  price: number | null
  category: ApplianceCategory | null
  specs: ApplianceSpecs
  price_history: PriceQuote[]
  notes: string | null
  source_email_subject: string | null
  quote_date: string | null
  created_at: string
  supplier?: Supplier
}

export interface ApplianceSpecs {
  // Kookplaat
  energy_type?: 'inductie' | 'gas' | 'keramisch'
  zones?: number
  watt?: number
  // Oven / Combi-oven / Magnetron
  pyrolysis?: boolean
  steam?: boolean
  capacity_liters?: number
  oven_subtype?: OvenSubtype
  // Vaatwasser
  integration?: 'volledig' | 'half'
  db_sound?: number
  capacity_sets?: number
  niche_height_cm?: number
  // Afzuigkap
  capacity_m3h?: number
  afzuig_type?: 'wand' | 'eiland' | 'inbouw' | 'plafond'
  // Koelkast
  fridge_liters?: number
  freezer?: boolean
  // Kokendwaterkraan (Quooker e.a.)
  functions_count?: number  // 2-in-1, 3-in-1, 4-in-1, 5-in-1
  has_sparkling?: boolean
  tank_liters?: number
  finish?: string
  // Spoelbak
  material?: string
  bowls?: 'enkel' | 'dubbel'
  // Algemeen
  color?: string
  width_cm?: number
  energy_label?: EnergyLabel
  product_line?: ProductLine
  // Merk-specifieke productserie, vrije tekst (bv. "iQ300", "iQ700", "Serie 8", "Mastery").
  series?: string
  [key: string]: unknown
}

export interface EmailQueueItem {
  id: string
  gmail_message_id: string
  subject: string
  sender: string
  received_at: string
  body_preview: string
  has_attachments: boolean
  status: EmailStatus
  ai_extracted: AiExtracted | null
  created_at: string
}

export interface AiExtracted {
  appliances: Partial<Appliance>[]
  supplier_name?: string
  supplier_email?: string
  quote_date?: string
  notes?: string
}

export type OfferStatus = 'concept' | 'verstuurd' | 'geaccepteerd'

export interface InspirationImage {
  url: string
  caption?: string
}

export interface OfferSpecs {
  fronten: string[]
  werkblad: string[]
  klimuur: string[]
  kookeiland: string[]
  apparatuur: string[]
  maatwerk: string[]
  [key: string]: string[]
}

export interface OfferAttachment {
  name: string
  url: string
  size?: number
}

export interface Offer {
  id: string
  customer_id: string
  status: OfferStatus
  render_image_url: string | null
  sfeerfoto_url: string | null
  cover_image_url: string | null
  cover_images: InspirationImage[]
  subtitle: string | null
  intro_text: string | null
  inspiration_images: InspirationImage[]
  bezinken_text: string | null
  specs: OfferSpecs
  total_price: number | null
  attachments: OfferAttachment[]
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Fase 1 — projecten, nieuwe offertebouwer, facturen, klantportaal-moodboard
// ---------------------------------------------------------------------------

// IN = handmatig ingevoerd, AUTO = automatisch berekend, DEF = standaardwaarde.
// Zodra een gebruiker een AUTO/DEF-veld met de hand aanpast, wordt de source 'in'.
export type FieldSource = 'in' | 'auto' | 'def'

export interface ProjectStatus {
  id: string
  label: string
  sort_order: number
  color: string
}

export interface Project {
  id: string
  customer_id: string
  reference_number: string
  title: string
  status_id: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  customer?: Customer
  status?: ProjectStatus
}

export type QuoteStatus = 'concept' | 'verstuurd' | 'akkoord'
export type QuoteItemType = 'apparaat' | 'product' | 'dienst' | 'maatwerk'

export type CostCategoryKey =
  | 'keukenkastjes'
  | 'apparatuur'
  | 'werkblad'
  | 'accessoires'
  | 'inmeten'
  | 'opslag'
  | 'levering'
  | 'installatie'
  | 'service'

export type EurolineWerkbladLevering = 'geen' | 'multiplex' | 'composiet'

// ---------------------------------------------------------------------------
// Financieel (project-tabblad) — begroot vs. werkelijk per kostencategorie.
// begroot_bedrag wordt automatisch vastgelegd zodra de offerte voor het
// eerst op 'akkoord' wordt gezet (snapshot van cost_breakdown op dat
// moment, zie QuoteEditor's handleSave) en blijft daarna staan, ook als de
// offerte later nog wijzigt. werkelijk_bedrag vult staff zelf in zodra de
// echte kosten bekend zijn (na levering/montage).
// ---------------------------------------------------------------------------

export interface ProjectFinancialItem {
  id: string
  project_id: string
  category: CostCategoryKey
  begroot_bedrag: number
  // Marge% zoals die in de kostprijs-opbouw stond op het moment van
  // accorderen — samen met begroot_bedrag bepaalt dit de (vaste) prijs die
  // de klant per categorie betaalt: prijs_klant = begroot_bedrag * (1 + marge_percentage/100).
  marge_percentage: number
  // Staat standaard al gelijk aan begroot_bedrag (zie migratie/upsert bij
  // accorderen) — handmatig overschrijfbaar zodra de echte kosten bekend
  // zijn. Telt pas mee als "echt werkelijk" in de totalen/marge-berekening
  // zodra `betaald` is aangevinkt.
  werkelijk_bedrag: number | null
  betaald: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Winst- en verliesrekening (/financieel) — bedrijfskosten die niet aan één
// project hangen (huur, personeel, ...), plus het belastingpercentage om
// door te rekenen naar nettowinst. category is bewust vrije tekst zonder
// CHECK-constraint, zie src/lib/operating-expenses.ts voor de standaardlijst.
// ---------------------------------------------------------------------------

export interface OperatingExpense {
  id: string
  expense_date: string
  category: string
  label: string | null
  bedrag: number
  // Wie de kosten (persoonlijk) voorgeschoten heeft — MilestoneAssignee
  // hergebruikt (zelfde mensen-lijst als Planning), null = nog niet
  // toegewezen/rechtstreeks door het bedrijf betaald.
  betaald_door: MilestoneAssignee | null
  ingeboekt_moneybird: boolean
  verrekend: boolean
  created_at: string
  updated_at: string
}

// Vaste activa (laptops, inventaris, ...) — zelfde velden als
// OperatingExpense, maar bewust een losse tabel: activa horen niet als
// kosten in de winst-en-verliesrekening, maar op de balans (zie
// src/lib/assets.ts voor de standaardcategorieën).
export interface Asset {
  id: string
  purchase_date: string
  category: string
  label: string | null
  bedrag: number
  betaald_door: MilestoneAssignee | null
  ingeboekt_moneybird: boolean
  verrekend: boolean
  created_at: string
  updated_at: string
}

// Eén rij (singleton) met bedrijfsbrede financiële instellingen.
export interface FinancialSettings {
  id: string
  belasting_percentage: number
  updated_at: string
}

// Losse disclaimer-tekst per paginatype (klantversie) — de prijspagina
// (customer_disclaimer_text) en aansluitingenpagina
// (customer_connections_disclaimer) hadden dit al als los veld, dit dekt de
// overige vaste pagina's. "wat zit erin" heeft dit NIET hier — dat is per
// sectie ingesteld (zie QuoteCustomerSection.disclaimer hieronder), omdat
// elke sectie daar zijn eigen pagina kan worden. "ontwerp" kan over meerdere
// gegenereerde pagina's uitwaaieren — dezelfde tekst herhaalt dan op elke
// pagina van die groep.
export type PageDisclaimerKey =
  | 'voorpagina'
  | 'toelichting'
  | 'kosten'
  | 'ontwerp'
  | 'vervolg'
  | 'afsluiting'

export interface EurolineInputs {
  montage_meters: number
  installatie_buitengebied: boolean
  opslag_extra_weken: number
  levering_groter: boolean
  levering_niet_begane_grond: boolean
  levering_verhuislift: boolean
  levering_buiten_werkgebied: boolean
  levering_extra_lostijd_halfuren: number
  werkblad_levering: EurolineWerkbladLevering
  service_uren: number
}

// Los instelbare Euroline-tarieven (§ Instellingen) — één rij, overal
// vandaan gelezen zodat een tariefwijziging direct doorrekent in elke
// offerte i.p.v. hardcoded constanten per plek.
export interface EurolineRates {
  id: string
  opslag_base: number
  opslag_per_week_extra: number
  levering_base: number
  levering_groter_toeslag: number
  levering_niet_begane_grond: number
  levering_verhuislift: number
  levering_extra_lostijd_per_halfuur: number
  levering_buiten_werkgebied: number
  werkblad_multiplex: number
  werkblad_composiet: number
  installatie_per_m1: number
  installatie_buitengebied_per_m1: number
  service_tarief_per_uur: number
  service_minimum: number
  updated_at: string
}

export interface WerkbladMaterial {
  id: string
  name: string
  price_per_m2: number
}

export interface WerkbladThickness {
  mm: number
  surcharge: number
}

export interface WerkbladCutoutPrices {
  kookplaat: number
  spoelbak: number
  kraan: number
}

// Los instelbare werkblad-richtprijzen (§ Instellingen) — voedt de
// zelf-rekentool binnen een offerte en de losstaande /gereedschap/werkblad-pagina.
export interface WerkbladRates {
  id: string
  materials: WerkbladMaterial[]
  cutouts: WerkbladCutoutPrices
  thicknesses: WerkbladThickness[]
  hoekverbinding: number
  inmeten: number
  montage: number
  transport: number
  updated_at: string
}

export interface WerkbladPartCutouts {
  kookplaat: boolean
  spoelbak: boolean
  kraan: boolean
}

export interface WerkbladPart {
  id: string
  material_id: string
  length: number
  depth: number
  thickness: number
  cutouts: WerkbladPartCutouts
}

// Bewaarde invoer van de rekentool — los van de richtprijzen zelf, zodat een
// concept-berekening (delen + gekozen marge/btw) per offerte bewaard blijft.
export interface WerkbladCalcInputs {
  parts: WerkbladPart[]
  marge_percentage: number
  btw_enabled: boolean
  btw_percentage: number
}

export interface CostBreakdownItem {
  key: CostCategoryKey
  label: string
  werkelijke_kosten: number
  werkelijke_kosten_source: FieldSource
  marge_percentage: number
  marge_percentage_source: FieldSource
}

export interface Quote {
  id: string
  project_id: string
  version: number
  status: QuoteStatus
  plattegrond_url: string | null
  // Vooraanzicht(en) van de kastenwand (bv. Winner Flex-uitdraai) — apart van
  // plattegrond_url (aanzicht van bovenaf): het aansluitschema heeft dit
  // vooraanzicht nodig om kastbreedtes/artikelcodes/posities af te lezen.
  // Meerdere mogelijk (bv. hoofdwand + kookeiland van 2 kanten) — elk wordt
  // in het aansluitschema gekoppeld aan een eigen "wand".
  vooraanzicht_urls: string[]
  render_urls: string[]
  standaard_afbeeldingen: string[]
  cover_image_url: string | null
  technical_attachments: OfferAttachment[]
  werkblad_attachments: OfferAttachment[]
  apparatuur_attachments: OfferAttachment[]
  cost_breakdown: CostBreakdownItem[]
  euroline_inputs: EurolineInputs | null
  werkblad_calc_inputs: WerkbladCalcInputs | null
  subtotal: number
  subtotal_source: FieldSource
  korting_percentage: number
  korting_percentage_source: FieldSource
  btw_percentage: number
  total_price: number
  total_price_source: FieldSource
  // Moment waarop de status voor het eerst op 'akkoord' werd gezet — voor
  // omzet-rapportage (zie /financieel). Wordt automatisch gezet in
  // QuoteEditor's handleSave, nooit met terugwerkende kracht overschreven
  // als de status daarna weer wijzigt.
  akkoord_at: string | null
  // Klantversie — losstaand van de interne regels/prijzen hierboven.
  // Niets hiervan wordt automatisch gevuld vanuit interne data; alles wordt
  // expliciet door staff toegevoegd/bewerkt (zie include_in_customer_view).
  customer_document_label: string
  customer_headline: string | null
  customer_subtitle: string | null
  customer_sections: QuoteCustomerSection[]
  customer_cost_lines: CustomerCostLine[]
  connections_image_url: string | null
  customer_connections_intro: string | null
  customer_connections_disclaimer: string | null
  customer_connections: ConnectionRow[]
  customer_intro_text: string | null
  customer_closing_heading: string | null
  customer_closing_text: string | null
  customer_closing_quote: string | null
  customer_disclaimer_text: string | null
  page_disclaimers: Partial<Record<PageDisclaimerKey, string>> | null
  customer_price: number | null
  customer_price_source: FieldSource
  archived_at: string | null
  created_at: string
  updated_at: string
  items?: QuoteItem[]
}

// ---------------------------------------------------------------------------
// Configurator — per onderdeel meerdere vergelijkbare "opties" (bv. apparatuur
// van merk A vs. merk B), gegroepeerd in "kostenoverzichten" die telkens één
// optie per onderdeel combineren. Zie het Configurator-tabblad.
// ---------------------------------------------------------------------------

export type ConfiguratorSection = 'kasten' | 'apparatuur' | 'werkblad' | 'opslag'

// JSONB-vorm per sectie — vrij van vorm zodat "Dupliceren" gewoon een
// deep-copy van `data` is. Elke sectie krijgt zijn eigen data-interface;
// deze union dekt ze allemaal.
export interface KastenOptionData {
  attachments: OfferAttachment[]
  summary_lines: string[]
}

export interface WerkbladOptionData {
  attachments: OfferAttachment[]
  summary_lines: string[]
  calc_inputs: WerkbladCalcInputs | null
}

export interface ApparatuurOptionItem {
  id: string
  appliance_id: string | null
  description: string
  brand: string | null
  model: string | null
  unit_price: number
  quantity: number
  include_in_customer_view: boolean
}

export interface ApparatuurOptionData {
  items: ApparatuurOptionItem[]
  // Voor apparatuur die niet uit de eigen bibliotheek komt — zelfde flow als
  // voorheen in Offerte (leveranciersofferte uploaden, AI destilleert een
  // samenvatting + bedrag).
  attachments: OfferAttachment[]
  summary_lines: string[]
}

export interface OpslagOptionData {
  euroline_inputs: EurolineInputs
}

export type ConfiguratorOptionData = KastenOptionData | WerkbladOptionData | ApparatuurOptionData | OpslagOptionData

export interface ConfiguratorOption {
  id: string
  quote_id: string
  section: ConfiguratorSection
  name: string
  sort_order: number
  data: ConfiguratorOptionData
  cost_total: number
  created_at: string
  updated_at: string
}

export interface ConfiguratorScenario {
  id: string
  quote_id: string
  name: string
  sort_order: number
  kasten_option_id: string | null
  apparatuur_option_id: string | null
  werkblad_option_id: string | null
  opslag_option_id: string | null
  created_at: string
  updated_at: string
}

// Eén rij per keer dat de klant-PDF is gedownload (zie
// src/app/api/offerte/[projectId]/pdf/route.ts + src/lib/quote-download-diff.ts).
export interface QuoteDownload {
  id: string
  quote_id: string
  downloaded_at: string
  downloaded_by: string | null
  snapshot: QuoteDownloadSnapshot
  changes: string[]
}

// Compacte kopie van een interne regel (finka_quote_items), alleen de velden
// die relevant zijn om een kostprijs-wijziging tussen twee downloads te
// herkennen — geen quote_id/sort_order/etc.
export interface QuoteDownloadItemSnapshot {
  id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
}

// De klant-zichtbare velden van een Quote (de subset die daadwerkelijk op de
// PDF/klantpagina verschijnt) plus de interne kostprijs-opbouw (cost_breakdown,
// de losse regels en de interne totalen) — samen gebruikt om twee downloads
// te vergelijken, zowel wat de klant ziet als wat het intern kost.
export interface QuoteDownloadSnapshot {
  status: QuoteStatus
  customer_document_label: string
  customer_headline: string | null
  customer_subtitle: string | null
  customer_intro_text: string | null
  customer_sections: QuoteCustomerSection[]
  customer_cost_lines: CustomerCostLine[]
  customer_connections_intro: string | null
  customer_connections_disclaimer: string | null
  customer_connections: ConnectionRow[]
  customer_closing_heading: string | null
  customer_closing_text: string | null
  customer_closing_quote: string | null
  customer_disclaimer_text: string | null
  page_disclaimers: Partial<Record<PageDisclaimerKey, string>> | null
  price: number
  cost_breakdown: CostBreakdownItem[]
  internal_subtotal: number
  internal_total_price: number
  items: QuoteDownloadItemSnapshot[]
  plattegrond_url: string | null
  render_urls: string[]
  standaard_afbeeldingen: string[]
  cover_image_url: string | null
  connections_image_url: string | null
}

export type QuoteCustomerCategory = 'kasten' | 'werkblad' | 'apparatuur' | 'accessoires' | 'overig'

export interface QuoteCustomerLine {
  text: string
  // Blijft altijd zichtbaar in de interne editor — bepaalt alleen of de regel
  // meegaat naar de daadwerkelijke klantofferte (groen) of niet (rood).
  included: boolean
}

export interface CustomerCostLine {
  label: string
  description: string
  amount: number
}

export interface ConnectionRow {
  kast: string
  aansluitingen: string
}

export type SectionImagePosition = 'boven' | 'rechts' | 'onder'
export type SectionImageSize = 'klein' | 'medium' | 'groot'

export interface QuoteCustomerSection {
  category: QuoteCustomerCategory
  title: string
  lines: QuoteCustomerLine[]
  images?: string[]
  // Ontbreekt bij oudere secties — behandel dat als 'rechts' (zie
  // offerte/[projectId]/page.tsx), niet als 'onder'.
  imagePosition?: SectionImagePosition
  // Ontbreekt bij oudere secties — behandel dat als 'medium'.
  imageSize?: SectionImageSize
  // Losse disclaimer-tekst, onderaan deze sectie in de klantversie —
  // ontbreekt meestal, alleen expliciet door staff toegevoegd.
  disclaimer?: string
}

export interface QuoteItem {
  id: string
  quote_id: string
  type: QuoteItemType
  appliance_id: string | null
  description: string
  brand: string | null
  model: string | null
  quantity: number
  unit_price: number
  unit_price_source: FieldSource
  line_total: number
  line_total_source: FieldSource
  sort_order: number
  include_in_customer_view: boolean
}

export type InvoiceStatus = 'open' | 'betaald'

export interface Invoice {
  id: string
  project_id: string
  invoice_number: string | null
  amount: number
  status: InvoiceStatus
  invoice_date: string | null
  notes: string | null
  archived_at: string | null
  created_at: string
}

export interface MoodboardCategory {
  id: string
  project_id: string
  name: string
  sort_order: number
  options?: MoodboardOption[]
  selection?: MoodboardSelection
}

export interface MoodboardOption {
  id: string
  category_id: string
  image_url: string | null
  name: string
  price_indication: string | null
  sort_order: number
}

export interface MoodboardSelection {
  id: string
  category_id: string
  chosen_option_id: string | null
  customer_comment: string | null
  approved_at: string | null
}

export interface ProjectNote {
  id: string
  project_id: string
  body: string
  created_by: string | null
  created_at: string
}

export interface PortalToken {
  id: string
  project_id: string
  token: string
  created_at: string
  revoked_at: string | null
}

// 'custom' = vrij toegevoegd item naast de 5 vaste mijlpalen — heeft dan een
// eigen label (zie ProjectMilestone.label), de 5 vaste hebben een vast label
// (zie MILESTONE_LABELS in src/lib/planning.ts).
export type MilestoneKey =
  | 'kennismaking'
  | 'meting'
  | 'bespreken_eerste_offerte'
  | 'bespreken_finale_offerte'
  | 'bestelling'
  | 'levering'
  | 'montage_start'
  | 'oplevering'
  | 'custom'
export type MilestoneStatus = 'nog_doen' | 'gepland' | 'bevestigd' | 'bezig' | 'klaar'
export type MilestoneAssignee = 'Kieke' | 'Merel' | 'Leverancier' | 'FINKA'

// Planning-mijlpalen — elk project krijgt automatisch 5 vaste (zie
// migratie-trigger create_default_milestones), zodat de projecttab en de
// bedrijfsbrede tijdlijn op /planning overal dezelfde basisstructuur tonen.
// Staff kan daarnaast losse 'custom'-items toevoegen per project.
export interface ProjectMilestone {
  id: string
  // NULL = algemene taak, niet gekoppeld aan een project (zie /planning).
  project_id: string | null
  milestone_key: MilestoneKey
  sort_order: number
  date: string | null
  status: MilestoneStatus
  label: string | null
  notes: string | null
  assigned_to: MilestoneAssignee | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Checklist — voortgangschecklist per project (verkoop t/m afronding). Een
// project heeft initieel géén checklist: die wordt bewust aangemaakt via een
// knop op het Checklist-tabblad, die op dat moment een kopie maakt van de
// instellingen in finka_checklist_categories/finka_checklist_templates (zie
// hieronder, beheerd via /instellingen/checklist). Staff kan daarnaast per
// project losse eigen punten toevoegen per categorie.
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string
  project_id: string
  // NULL = vrij toegevoegd item, of gekopieerd vanuit een template (die
  // zelf al een eigen label meebrengt). Historisch (vóór het templatemodel)
  // kwam hier één van een vaste hardcoded sleutelset in te staan — vrije
  // tekst i.p.v. een vaste union + CHECK-constraint (zelfde aanpak als
  // ConnectionItem.standard_key) voorkomt dat de database-constraint uit de
  // pas loopt.
  item_key: string | null
  // Losse tekst, geen FK — een kopie/snapshot van het kopje-label op het
  // moment van "Checklist aanmaken" (of, voor rijen van vóór dit model, een
  // oude vaste sleutel — zie categoryLabel() in src/lib/checklist.ts).
  // Kopjes hernoemen/verwijderen in Instellingen raakt deze kopie dus niet.
  category: string
  label: string | null
  checked: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// Instellingen-versie van een checklist-kopje (categorie) — beheerd via
// /instellingen/checklist, hernoembaar/toevoegbaar/verwijderbaar. Een
// project-checklist neemt bij aanmaken alleen het label over (zie
// ChecklistItem.category); deze rij zelf leeft alleen in de instellingen.
export interface ChecklistCategoryItem {
  id: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

// Instellingen-versie van een checklist-item binnen een kopje: het
// aanpasbare standaardlijstje waarvan een project-checklist een kopie is op
// het moment van aanmaken. Geen project_id/checked — dit is een sjabloon,
// geen projectdata.
export interface ChecklistTemplateItem {
  id: string
  category_id: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Aansluitschema — checklist (leidingwerk/elektra) + visuele vooraanzicht-
// tekening per project. Zie src/lib/aansluitschema.ts voor de vaste
// standaardlijst en render-helpers.
// ---------------------------------------------------------------------------

export type ConnectionCategory = 'water_afvoer' | 'elektra' | 'overig'

// Eén regel uit de checklist (bv. "Warm water aansluiting spoelbak"). Elk
// project start met de vaste standaardregels (standard_key gezet); staff kan
// daarnaast eigen regels toevoegen (standard_key = null).
export interface ConnectionItem {
  id: string
  project_id: string
  category: ConnectionCategory
  standard_key: string | null
  sort_order: number
  omschrijving: string
  van_toepassing: boolean
  aantal: string | null
  // Vrije tekst i.p.v. numeriek: het brondocument gebruikt ook "vloer"/"p.m."
  hoogte_cm: string | null
  positie_toelichting: string | null
  created_at: string
  updated_at: string
}

export type PinType = 'warm_water' | 'koud_water' | 'afvoer' | 'elektra'

// Eén aansluitpunt op de visuele vooraanzicht-tekening. connection_item_id
// koppelt 'm optioneel aan een checklistregel (om hoogte_cm over te nemen),
// maar heeft altijd zijn eigen hoogte_cm zodat een pin ook los kan bestaan.
export interface ConnectionPin {
  id: string
  connection_item_id: string | null
  x: number // 0-1 fractie van de breedte van de kastenrij
  type: PinType
  label: string
  hoogte_cm: string
}

// Eén kastblok in de kastenrij-tekening, van links naar rechts.
export interface ConnectionCabinet {
  id: string
  sort_order: number
  breedte_mm: number
  artikelcode: string
  label: string | null
  is_aansluitzone: boolean
}

export interface ConnectionSectionBlock {
  titel: string
  tekst: string
}

// Eén vooraanzicht-tekening met zijn eigen kastenrij + aansluitpunten — een
// project kan er meerdere hebben (bv. hoofdwand + kookeiland van 2 kanten),
// elk gekoppeld aan een eigen geüploade vooraanzicht-afbeelding
// (Quote.vooraanzicht_urls) waaruit de AI kastbreedtes/posities leest.
export interface ConnectionWand {
  id: string
  label: string
  bron_afbeelding_url: string | null
  wand_hoogte_mm: number
  plint_hoogte_mm: number
  cabinets: ConnectionCabinet[]
  pins: ConnectionPin[]
}

// Documentmetadata + vrije tekst + de wanden (elk met eigen tekening), één
// rij per project. De checklistregels zelf staan los in finka_connection_items
// en zijn wand-onafhankelijk (een aansluiting geldt projectbreed, alleen de
// visuele positie verschilt per wand).
export interface ConnectionSchema {
  project_id: string
  klant_referentie: string | null
  adres: string | null
  opsteller: string | null
  behorend_bij_tekening: string | null
  versie: number
  groepenverdeling_tekst: string | null
  extra_secties: ConnectionSectionBlock[]
  let_op_notities: string | null
  wanden: ConnectionWand[]
  created_at: string
  updated_at: string
}
