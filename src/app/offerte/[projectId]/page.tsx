export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ConnectionRow, Customer, CustomerCostLine, Project, Quote, QuoteCustomerCategory, QuoteCustomerSection } from '@/lib/types'
import PrintButton from './PrintButton'
import DownloadButton from './DownloadButton'

// Alleen nog gebruikt om secties te sorteren (kasten vóór werkblad vóór
// apparatuur, etc.) — de categorienaam zelf wordt niet meer getoond, elke
// sectie toont haar eigen titel (bv. "Fronten en greeplijst") als label.
const CATEGORY_ORDER: QuoteCustomerCategory[] = ['kasten', 'werkblad', 'apparatuur', 'accessoires', 'overig']

function formatPrice(n: number) {
  return new Intl.NumberFormat('nl-NL').format(Math.round(n))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Hoogte per gekozen foto-formaat bij een sectie ("Wat zit erin") — bewust
// alleen een hoogte, geen vaste breedte: de breedte volgt de eigen
// beeldverhouding van elke foto (objectFit: contain, geen bijsnijden). Zo
// hebben foto's met dezelfde maat altijd exact dezelfde hoogte en staan ze
// mooi op één lijn, ongeacht hun eigen verhouding. Iets groter dan het
// origineel (was 112/165/240) voor betere leesbaarheid zonder wit kader —
// bewust een bescheiden stap (eerdere poging van +130px per maat paste niet
// meer op 1 pagina, zie de imageWeight-berekening verderop die hiermee in
// verhouding moet blijven).
const SECTION_IMAGE_SIZES: Record<'klein' | 'medium' | 'groot', number> = {
  klein: 130,
  medium: 190,
  groot: 260,
}

// Vanaf dit aantal punten wordt een sectie in 2 kolommen naast elkaar gezet
// — anders past een lange lijst (bv. "Kasten" met 20+ punten) niet op de
// vaste paginahoogte en wordt het einde onzichtbaar afgesneden (overflow: hidden).
const SECTION_COLUMN_THRESHOLD = 8

// De toelichting/vervolg-pagina heeft een vaste hoogte (167mm) — bij een
// korte tekst past dat ruim, maar een langere tekst (uitgebreide
// wijzigingslijst e.d.) heeft anders te veel regels nodig. Schaal
// lettergrootte en regelhoogte mee met de tekstlengte zodat elke lengte
// netjes op de pagina blijft passen. Drempels zijn geijkt op de bredere
// tekstkolom van de 2-koloms lay-out (TextIntroPage, kolom ~620px).
function introTextSizing(text: string) {
  const len = text.length
  if (len > 1400) return { heading: 36, body: 12, lineHeight: 1.5 }
  if (len > 900) return { heading: 42, body: 13, lineHeight: 1.55 }
  return { heading: 50, body: 14, lineHeight: 1.65 }
}

// Tekst tussen *sterretjes* wordt cursief, tekst tussen ==dubbele
// is-gelijk-tekens== wordt knalrood/vet getoond — een "markeerstift" die
// staff in elk tekstveld kan typen om zichzelf te herinneren dat iets nog
// niet af is. Bewust zo opvallend: dit moet opvallen als het per ongeluk
// blijft staan in een PDF die naar de klant gaat. Gedeeld door
// renderFormatted (kop, één regel/meerdere via <br>) en renderIntroBody
// (lopende tekst, met bullet-herkenning) en de "Wat zit erin"-regels.
function renderInline(text: string) {
  const nodes: ReactNode[] = []
  const regex = /\*(.+?)\*|==(.+?)==/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    if (match[1] !== undefined) {
      nodes.push(<em key={key++}>{match[1]}</em>)
    } else if (match[2] !== undefined) {
      nodes.push(<mark key={key++} style={{ background: 'transparent', color: '#DC2626', fontWeight: 700 }}>{match[2]}</mark>)
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  return nodes
}

// Simpele opmaak in tekstvelden: tekst tussen *sterretjes* wordt cursief,
// een regeleinde (Enter) splitst de titel over meerdere regels.
function renderFormatted(text: string) {
  const lines = text.split('\n')
  return lines.map((line, li) => (
    <span key={li}>
      {renderInline(line)}
      {li < lines.length - 1 && <br />}
    </span>
  ))
}

// Introtekst/vervolgtekst: regels die beginnen met "- ", "* " of "• " worden
// als bullet-lijst getoond (zelfde goudkleurige streepje als de "Wat zit
// erin"-secties) i.p.v. als kale tekst met een letterlijk streepje/sterretje
// ervoor — dat was precies het probleem, opsommingstekens kwamen niet
// herkenbaar over.
function renderIntroBody(text: string) {
  const lines = text.split('\n')
  return lines.map((line, li) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/)
    if (bullet) {
      return (
        <div key={li} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
          <span style={{ color: '#C9A96E', flexShrink: 0 }}>—</span>
          <span>{renderInline(bullet[1])}</span>
        </div>
      )
    }
    if (line.trim() === '') return <div key={li} style={{ height: '0.6em' }} />
    return <div key={li}>{renderInline(line)}</div>
  })
}

// Losse disclaimer-tekst onderaan een pagina — zelfde lichtgrijs als de
// sectielabels (§ 01 · Toelichting etc., #9B9591), cursief via *sterretjes*
// en de ==markeerstift== werken hier ook (renderInline). Elke `.page` heeft
// al position:relative, dus dit plakt gewoon onderaan diezelfde pagina.
function DisclaimerFooter({ text }: { text?: string | null }) {
  if (!text) return null
  return (
    <div style={{ position: 'absolute', left: 40, right: 40, bottom: 20, fontSize: 9, lineHeight: 1.5, color: '#9B9591' }}>
      {renderInline(text)}
    </div>
  )
}

// Gedeelde 2-koloms pagina voor § 01 Toelichting en § 04 Vervolg: label +
// kop links in een smalle kolom, lopende tekst rechts in een bredere kolom
// — zelfde stijl als de Nick & Floor-referentie. Bewust bovenaan uitgelijnd
// (niet verticaal gecentreerd): bij een korte tekst laat dat alleen onderin
// ruimte over i.p.v. een klein blokje midden op een verder lege pagina.
function TextIntroPage({ sectionLabel, heading, body, disclaimer }: { sectionLabel: string; heading: ReactNode; body?: string | null; disclaimer?: string | null }) {
  const sizing = body ? introTextSizing(body) : { heading: 50, body: 14, lineHeight: 1.65 }
  return (
    <div className="page" style={{ padding: '80px 56px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 56 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 10 }}>
            {sectionLabel}
          </div>
          <h2 className="serif" style={{ fontSize: sizing.heading, fontWeight: 500, lineHeight: 1.05, color: '#1C1B19' }}>
            {heading}
          </h2>
        </div>
        {body && (
          <div style={{ fontSize: sizing.body, lineHeight: sizing.lineHeight, color: '#3d3a37', maxWidth: 640 }}>
            {renderIntroBody(body)}
          </div>
        )}
      </div>
      <DisclaimerFooter text={disclaimer} />
    </div>
  )
}

export default async function OffertePreviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('finka_projects')
    .select('*, customer:finka_customers(*)')
    .eq('id', projectId)
    .single() as { data: (Project & { customer: Customer }) | null }

  if (!project) notFound()

  const { data: quote } = await supabase
    .from('finka_quotes')
    .select('*')
    .eq('project_id', projectId)
    .is('archived_at', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: Quote | null }

  if (!quote) redirect(`/projecten/${projectId}?tab=offerte`)

  const c = project.customer
  const sections = (quote.customer_sections ?? []) as QuoteCustomerSection[]
  const costLines = (quote.customer_cost_lines ?? []) as CustomerCostLine[]
  const connections = (quote.customer_connections ?? []) as ConnectionRow[]
  const pageDisclaimers = quote.page_disclaimers ?? {}
  // Voorpagina-afbeelding komt uit de gekozen bibliotheekfoto — renders en de
  // tekening zijn bedoeld voor latere pagina's, niet voor de voorpagina.
  const heroImage = quote.cover_image_url ?? quote.standaard_afbeeldingen?.[0] ?? null
  const remainingRenders = quote.render_urls ?? []
  const price = quote.customer_price ?? quote.total_price

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: #fff;
          color: #1C1B19;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          width: 297mm;
          height: 167mm;
          position: relative;
          overflow: hidden;
          background: #E6E2D9;
          page-break-after: always;
          break-after: page;
        }

        .serif { font-family: 'Cormorant Garamond', serif; }

        @media print {
          @page { size: 297mm 167mm; margin: 0; }
          .no-print { display: none !important; }
          .page { width: 100%; height: 167mm; page-break-after: always; break-after: page; }
        }

        @media screen {
          body { background: #e5e5e5; }
          .pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0 48px; }
          .page { box-shadow: 0 2px 16px rgba(0,0,0,0.12); }
        }
      `}</style>

      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a href={`/projecten/${projectId}?tab=offerte`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Terug naar editor
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {c.first_name} {c.last_name} — {project.title}
          </span>
          <DownloadButton projectId={projectId} />
          <PrintButton />
        </div>
      </div>
      <div className="no-print" style={{ height: 57 }} />

      <div className="pages">

        {/* ─── Pagina 1: Voorpagina ─── */}
        <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Header, los boven de foto */}
          <div style={{
            flexShrink: 0, background: '#EAE6DD', padding: '14px 32px',
            display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
          }}>
            <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#6B6560', textTransform: 'uppercase', justifySelf: 'start' }}>
              {quote.customer_document_label} · {c.city || `${c.first_name} ${c.last_name}`}
            </span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 400, letterSpacing: '0.06em', color: '#1C1B19' }}>FINKA</div>
              <div style={{ fontSize: 7, letterSpacing: '0.25em', color: '#9B9591', marginTop: 1 }}>keukens</div>
            </div>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: '#6B6560', textTransform: 'uppercase', justifySelf: 'end' }}>
              {formatDate(new Date().toISOString())}
            </span>
          </div>

          {/* Beeld met titel + prijs erover */}
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            {heroImage && (
              <div style={{ position: 'absolute', inset: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroImage} alt="Render" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(20,19,17,0.7), rgba(20,19,17,0.05) 55%)' }} />
              </div>
            )}

            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: '14%', padding: '0 32px',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24,
              color: heroImage ? '#FAF8F5' : '#1C1B19',
            }}>
              <div style={{ maxWidth: '68%' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 6 }}>
                  {quote.customer_document_label} · voor {c.first_name} {c.last_name}
                </div>
                {quote.customer_headline && (
                  <h1 className="serif" style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.02, letterSpacing: '-0.01em' }}>
                    {renderFormatted(quote.customer_headline)}
                  </h1>
                )}
                {quote.customer_subtitle && (
                  <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 14, maxWidth: 420, opacity: 0.95 }}>
                    {renderInline(quote.customer_subtitle)}
                  </p>
                )}
              </div>

              {price != null && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.15em', opacity: 0.85, textTransform: 'uppercase' }}>{quote.customer_document_label}</div>
                  <div className="serif" style={{ fontSize: 32, fontWeight: 400, lineHeight: 1.15 }}>€{formatPrice(price)}</div>
                  <div style={{ fontSize: 9, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.1em' }}>incl. BTW</div>
                </div>
              )}
            </div>
            {/* Zelfde grijstint als DisclaimerFooter elders, maar via opacity
               i.p.v. #9B9591 vast — deze pagina staat over een foto en kan
               zowel licht als donker zijn (zie color hierboven). */}
            {quote.page_disclaimers?.voorpagina && (
              <div style={{
                position: 'absolute', left: 32, right: 32, bottom: 16, fontSize: 9, lineHeight: 1.5,
                color: heroImage ? '#FAF8F5' : '#1C1B19', opacity: 0.6,
              }}>
                {renderInline(quote.page_disclaimers.voorpagina)}
              </div>
            )}
          </div>
        </div>

        {/* ─── Pagina 2: Toelichting ─── */}
        {quote.customer_intro_text && (
          <TextIntroPage sectionLabel="§ 01 · Toelichting" heading={<>Hi {c.first_name},</>} body={quote.customer_intro_text} disclaimer={quote.page_disclaimers?.toelichting} />
        )}

        {/* ─── § 02 · Wat zit erin — elke sectie eigen gelabeld blok, over
            zoveel pagina's als nodig (zoals de Nick & Floor-referentie:
            "Fronten en greeplijst", "Werkblad", "Zijmuur"... elk hun eigen
            titel als label, i.p.v. samengevoegd onder de categorienaam).
            Pagina's worden gevuld o.b.v. een regelbudget — een exacte
            tekstmeting kan alleen in de browser, dit is een inschatting
            zodat een enkele korte sectie niet alsnog een bijna lege pagina
            krijgt. ─── */}
        {(() => {
          // Zelfs in 2 kolommen past een sectie met heel veel punten (bv. 29)
          // niet meer op één pagina — de pagina's hier hebben overflow:visible,
          // dus zulke tekst liep gewoon door ÓNDER de volgende (ondoorzichtige)
          // pagina en leek daardoor "leeg". Zulke secties worden daarom eerst
          // opgeknipt in stukken die wél op één pagina passen (zie
          // SECTION_COLUMN_THRESHOLD/LINE_BUDGET verderop — 18 regels in 2
          // kolommen ≈ 9 rijen, ruim binnen het budget van 11).
          const MAX_LINES_PER_SECTION_PAGE = 18
          const visibleSections = sections
            .map((s) => ({ ...s, lines: s.lines.filter((l) => l.included && l.text.trim()) }))
            .filter((s) => s.lines.length > 0 || (s.images && s.images.length > 0))
            .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
            .flatMap((s) => {
              if (s.lines.length <= MAX_LINES_PER_SECTION_PAGE) return [s]
              const chunks: typeof s[] = []
              for (let i = 0; i < s.lines.length; i += MAX_LINES_PER_SECTION_PAGE) {
                chunks.push({
                  ...s,
                  lines: s.lines.slice(i, i + MAX_LINES_PER_SECTION_PAGE),
                  title: i === 0 ? s.title : `${s.title} (vervolg)`,
                  images: i === 0 ? s.images : [],
                })
              }
              return chunks
            })

          if (!visibleSections.length) return null

          // Iets lager dan je zou verwachten (was 13) — de regels zijn groter
          // geworden (13px i.p.v. 11.5px), dus er passen er nu minder op een pagina.
          const LINE_BUDGET = 11
          const sectionPages: typeof visibleSections[] = []
          let current: typeof visibleSections = []
          let weight = 0
          for (const section of visibleSections) {
            // Thumbnails wegen ongeveer als N tekstregels, afhankelijk van het
            // gekozen formaat — geen exacte meting, maar voorkomt dat een
            // fotosectie het regelbudget te optimistisch inschat. Lange
            // lijsten komen in 2 kolommen (zie SECTION_COLUMN_THRESHOLD) en
            // wegen dus maar half zo zwaar.
            const lineWeight = section.lines.length > SECTION_COLUMN_THRESHOLD
              ? Math.ceil(section.lines.length / 2)
              : section.lines.length
            // Foto-only secties (geen tekst) renderen groot en gecentreerd —
            // die wegen zwaar genoeg om vrijwel altijd hun eigen pagina te krijgen.
            const imageWeight = !section.images?.length ? 0
              : section.lines.length === 0 ? 10
              : { klein: 5, medium: 7, groot: 10 }[section.imageSize ?? 'medium']
            const sectionWeight = lineWeight + imageWeight + 1
            if (current.length && weight + sectionWeight > LINE_BUDGET) {
              sectionPages.push(current)
              current = []
              weight = 0
            }
            current.push(section)
            weight += sectionWeight
          }
          if (current.length) sectionPages.push(current)

          return sectionPages.map((pageSections, pageIdx) => (
            <div
              key={pageIdx}
              className="page"
              style={{ padding: pageIdx === 0 ? '64px 40px 32px' : '32px 40px', display: 'flex', flexDirection: 'column', overflow: 'visible' }}
            >
              {pageIdx === 0 && (
                <>
                  <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 6 }}>
                    § 02 · Specificaties
                  </div>
                  <h2 className="serif" style={{ fontSize: 42, fontWeight: 500, lineHeight: 1, color: '#1C1B19', marginBottom: 14 }}>
                    Wat zit erin.
                  </h2>
                </>
              )}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {pageSections.map((section, sIdx) => {
                  // Geen opgeslagen keuze (oudere secties) valt terug op
                  // 'rechts' — 'onder' gaf bij een enkele foto een uitgerekt,
                  // dun bannetje onder een korte regel tekst.
                  const imagePosition = section.imagePosition ?? 'rechts'
                  const useColumns = section.lines.length > SECTION_COLUMN_THRESHOLD
                  const linesBlock = (
                    <div style={useColumns ? { columnCount: 2, columnGap: 24 } : undefined}>
                      {section.lines.map((line, lIdx) => (
                        <div key={lIdx} style={{ fontSize: 13, color: '#1C1B19', lineHeight: 1.5, display: 'flex', gap: 8, padding: '3px 0', breakInside: 'avoid' }}>
                          <span style={{ color: '#C9A96E', flexShrink: 0 }}>—</span>
                          <span>{renderInline(line.text)}</span>
                        </div>
                      ))}
                    </div>
                  )
                  const imageHeight = SECTION_IMAGE_SIZES[section.imageSize ?? 'medium']
                  const imagesBlock = section.images && section.images.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexDirection: imagePosition === 'rechts' ? 'column' : 'row',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap', gap: 10, flexShrink: 0,
                    }}>
                      {section.images.map((url, i) => (
                        <div key={i} style={{ height: imageHeight, overflow: 'hidden', flexShrink: 0 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Sfeerfoto" style={{ height: '100%', width: 'auto', objectFit: 'contain', display: 'block', borderRadius: 10 }} />
                        </div>
                      ))}
                    </div>
                  )

                  // Een sectie met alleen een foto (geen enkele tekstregel) is
                  // bedoeld als sfeerbeeld, niet als specificatie — die krijgt
                  // daarom geen label-kolom en géén vast thumbnail-formaat,
                  // maar wordt groot en gecentreerd op de pagina getoond.
                  const isPhotoOnly = section.lines.length === 0 && section.images && section.images.length > 0
                  if (isPhotoOnly) {
                    // Vult de rest van de pagina (flex: 1 op deze sectie binnen
                    // de flex-column wrapper hierboven) en centreert de foto
                    // zowel horizontaal als verticaal over die hele ruimte,
                    // i.p.v. bovenaan de content-flow te blijven hangen.
                    return (
                      <div key={sIdx} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '15px 0', borderTop: '1px solid #E6E2D9' }}>
                        <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 12, flexShrink: 0 }}>
                          {renderInline(section.title)}
                        </div>
                        {/* maxHeight als vaste px-waarde i.p.v. height:100% — een
                           percentage-hoogte op een flex-kind met
                           alignItems:'center' (niet 'stretch') kan niet
                           resolven omdat de omringende box zelf geen
                           vastgelegde hoogte heeft, en viel dan terug op de
                           volledige natuurlijke afbeeldingsgrootte (vandaar de
                           enorme overloop). Een harde px-waarde kan dat
                           probleem niet hebben. */}
                        {/* Geen flexWrap: bij meerdere foto's moet maxWidth per
                           foto al zo berekend zijn dat ze samen op één rij
                           passen — wrappen zou een 2e rij opleveren die door
                           overflow:hidden werd afgesneden (de vorige bug). */}
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, overflow: 'hidden' }}>
                          {section.images!.map((url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={url}
                              alt={section.title}
                              style={{
                                maxHeight: 420,
                                maxWidth: `${Math.floor(88 / section.images!.length)}%`,
                                width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', borderRadius: 10,
                              }}
                            />
                          ))}
                        </div>
                        {section.disclaimer && (
                          <div style={{ flexShrink: 0, fontSize: 9, lineHeight: 1.5, color: '#9B9591', marginTop: 8 }}>
                            {renderInline(section.disclaimer)}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={sIdx} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, padding: '15px 0', borderTop: '1px solid #E6E2D9' }}>
                      <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#9B9591', textTransform: 'uppercase' }}>
                        {renderInline(section.title)}
                      </div>
                      {imagePosition === 'rechts' ? (
                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>{linesBlock}</div>
                          {imagesBlock}
                        </div>
                      ) : imagePosition === 'boven' ? (
                        <div>
                          {imagesBlock && <div style={{ marginBottom: section.lines.length ? 10 : 0 }}>{imagesBlock}</div>}
                          {linesBlock}
                        </div>
                      ) : (
                        <div>
                          {linesBlock}
                          {imagesBlock && <div style={{ marginTop: section.lines.length ? 10 : 0 }}>{imagesBlock}</div>}
                        </div>
                      )}
                      {section.disclaimer && (
                        <div style={{ gridColumn: '1 / -1', fontSize: 9, lineHeight: 1.5, color: '#9B9591', marginTop: 4 }}>
                          {renderInline(section.disclaimer)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        })()}

        {/* ─── Kosten (optioneel, alleen als staff dit expliciet heeft ingevuld) ─── */}
        {costLines.length > 0 && (
          <div className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column' }}>
            <h2 className="serif" style={{ fontSize: 40, fontWeight: 550, lineHeight: 1, color: '#1C1B19', marginBottom: 24 }}>
              Kosten.
            </h2>
            <div style={{ borderTop: '1px solid #E6E2D9' }}>
              {costLines.map((line, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 16, padding: '14px 0', borderBottom: '1px solid #E6E2D9', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#9B9591', textTransform: 'uppercase' }}>{renderInline(line.label)}</div>
                  <div style={{ fontSize: 12, color: '#1C1B19' }}>{renderInline(line.description)}</div>
                  <div style={{ fontSize: 13, color: '#1C1B19' }}>€ {formatPrice(line.amount)}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 16, padding: '14px 0' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#1C1B19', textTransform: 'uppercase', fontWeight: 600 }}>Totaal</div>
                <div />
                <div style={{ fontSize: 14, color: '#1C1B19', fontWeight: 600 }}>€ {formatPrice(costLines.reduce((s, l) => s + l.amount, 0))}</div>
              </div>
            </div>
            <DisclaimerFooter text={pageDisclaimers.kosten} />
          </div>
        )}

        {/* ─── Opstelling en aansluitingen (optioneel) ─── */}
        {connections.length > 0 && (
          <div className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column' }}>
            <h2 className="serif" style={{ fontSize: 38, fontWeight: 550, lineHeight: 1, color: '#1C1B19', marginBottom: 16, flexShrink: 0 }}>
              Opstelling en aansluitingen.
            </h2>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
              {quote.connections_image_url && (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 10, border: '1px solid #DDD8D2' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={quote.connections_image_url!} alt="Opstelling" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 10 }} />
                </div>
              )}

              <div style={{ flex: 1.3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {quote.customer_connections_intro && (
                  <p style={{ fontSize: 11, lineHeight: 1.5, color: '#3d3a37', marginBottom: 12 }}>
                    {renderInline(quote.customer_connections_intro)}
                  </p>
                )}
                <div style={{ borderTop: '1px solid #E6E2D9', overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #E6E2D9' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.1em', color: '#9B9591', textTransform: 'uppercase', fontWeight: 600 }}>Kast</div>
                    <div style={{ fontSize: 9, letterSpacing: '0.1em', color: '#9B9591', textTransform: 'uppercase', fontWeight: 600 }}>Aansluitingen</div>
                  </div>
                  {connections.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #E6E2D9' }}>
                      <div style={{ fontSize: 11, color: '#1C1B19', lineHeight: 1.4 }}>{renderInline(row.kast)}</div>
                      <div style={{ fontSize: 11, color: '#1C1B19', lineHeight: 1.4 }}>{renderInline(row.aansluitingen)}</div>
                    </div>
                  ))}
                </div>
                {quote.customer_connections_disclaimer && (
                  <p style={{ fontSize: 10, fontStyle: 'italic', lineHeight: 1.5, color: '#9B9591', marginTop: 12 }}>
                    {renderInline(quote.customer_connections_disclaimer)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Prijspagina ─── */}
        {price != null && (
          <div className="page" style={{ background: '#1C1B19', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 12 }}>
              Totale {quote.customer_document_label.toLowerCase()} — incl. BTW
            </div>
            <div className="serif" style={{ fontSize: 56, fontWeight: 300, color: '#FAF8F5', lineHeight: 1, letterSpacing: '-0.02em' }}>
              €{formatPrice(price)}
            </div>
            {quote.customer_disclaimer_text && (
              <div style={{ marginTop: 22, fontSize: 11, color: '#9B9591', textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
                {renderInline(quote.customer_disclaimer_text)}
              </div>
            )}
          </div>
        )}

        {/* ─── Tekening / renders ─── */}
        {(() => {
          const ontwerpImages = [
            ...(quote.plattegrond_url ? [{ url: quote.plattegrond_url, alt: 'Plattegrond' }] : []),
            ...remainingRenders.map((url, i) => ({ url, alt: `Render ${i + 1}` })),
          ]
          if (!ontwerpImages.length) return null

          // Max 3 per pagina, altijd naast elkaar in 1 rij (nooit 2x2) — bij
          // tekeningen moeten maten/getallen leesbaar blijven, en die worden
          // te klein in een grid met meer rijen. Extra foto's krijgen
          // automatisch een vervolgpagina i.p.v. alles op één pagina te proppen.
          const MAX_PER_PAGE = 3
          const imagePages: typeof ontwerpImages[] = []
          for (let i = 0; i < ontwerpImages.length; i += MAX_PER_PAGE) {
            imagePages.push(ontwerpImages.slice(i, i + MAX_PER_PAGE))
          }

          return imagePages.map((pageImages, pageIdx) => {
            const columns = pageImages.length
            return (
              <div key={pageIdx} className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {pageIdx === 0 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 5 }}>
                      § 03 · Tekening
                    </div>
                    <h2 className="serif" style={{ fontSize: 36, fontWeight: 500, lineHeight: 1, color: '#1C1B19' }}>
                      Ontwerp
                    </h2>
                  </div>
                )}

                {/* Altijd 1 rij naast elkaar (max 3 per pagina, zie MAX_PER_PAGE
                   hierboven) — geen 2x2 grid meer, dat maakte maten/getallen op
                   tekeningen onleesbaar klein. Geen kader/achtergrondkleur —
                   volledig zichtbare (contain) foto, lege ruimte smelt samen met
                   de paginakleur. De witte canvas-achtergrond van een plattegrond
                   wordt al bij het uploaden transparant gemaakt (zie
                   removeWhiteBackground in QuoteEditor.tsx). */}
                <div style={{
                  flex: 1, minHeight: 0,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, 1fr)`,
                  gridAutoRows: '1fr',
                  gap: 12,
                }}>
                  {pageImages.map((img, i) => (
                    // width/height:100% + objectFit:contain liet de ronde hoeken
                    // op de rand van de (te grote, onzichtbare) box vallen i.p.v.
                    // op de zichtbare foto zelf, zodra de beeldverhouding niet
                    // precies bij het grid-vak paste — vandaar dat het leek alsof
                    // er niets veranderde. maxWidth/maxHeight + width/height:auto
                    // laat de afbeelding exact zo groot renderen als zijn eigen
                    // zichtbare inhoud, gecentreerd via flex, zodat borderRadius
                    // altijd precies op de rand van de foto zelf zit.
                    <div key={i} style={{ minHeight: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.alt} style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', borderRadius: 10 }} />
                    </div>
                  ))}
                </div>
                {/* Als normale flow-regel i.p.v. absoluut gepositioneerd
                   (zoals DisclaimerFooter elders) — de foto-grid hierboven
                   vult al de volledige resterende hoogte, dus een overlay
                   zou over de onderste rij foto's heen vallen. */}
                {pageIdx === imagePages.length - 1 && pageDisclaimers.ontwerp && (
                  <div style={{ flexShrink: 0, fontSize: 9, lineHeight: 1.5, color: '#9B9591' }}>
                    {renderInline(pageDisclaimers.ontwerp)}
                  </div>
                )}
              </div>
            )
          })
        })()}

        {/* ─── Vervolg — eigen pagina, zelfde stijl als § 01 Toelichting ─── */}
        {quote.customer_closing_heading && (
          <TextIntroPage sectionLabel="§ 04 · Vervolg" heading={quote.customer_closing_heading} body={quote.customer_closing_text} disclaimer={quote.page_disclaimers?.vervolg} />
        )}

        {/* ─── Afsluitpagina ─── */}
        <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            {quote.customer_closing_quote && (
              <p className="serif" style={{ fontSize: 30, fontWeight: 300, fontStyle: 'italic', textAlign: 'center', color: '#1C1B19', lineHeight: 1.3 }}>
                &ldquo;{renderInline(quote.customer_closing_quote)}&rdquo;
              </p>
            )}
            <p style={{ fontSize: 10, letterSpacing: '0.15em', color: '#9B9591', textTransform: 'uppercase', marginTop: 18 }}>
              Merel &amp; Kieke · FINKA keukens
            </p>
            {pageDisclaimers.afsluiting && (
              <div style={{ fontSize: 9, lineHeight: 1.5, color: '#9B9591', textAlign: 'center', marginTop: 14, maxWidth: 420 }}>
                {renderInline(pageDisclaimers.afsluiting)}
              </div>
            )}
          </div>

          <div style={{ background: '#1C1B19', padding: '24px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20 }}>
            {[
              { title: 'Contact', lines: ['contact@finkakeukens.nl', 'Merel — 06 1616 5175', 'Kieke — 06 5131 5775'] },
              { title: 'Bedrijf', lines: ['KVK 98060597', 'finkakeukens.nl'] },
              { title: 'Voor', lines: [`${c.first_name} ${c.last_name}`, c.city ?? '', formatDate(new Date().toISOString())].filter(Boolean) },
            ].map((col) => (
              <div key={col.title}>
                <div style={{ fontSize: 8, letterSpacing: '0.18em', color: '#6B6560', textTransform: 'uppercase', marginBottom: 8 }}>
                  {col.title}
                </div>
                {col.lines.map((line, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#9B9591', lineHeight: 1.6 }}>{line}</div>
                ))}
              </div>
            ))}
            <div />
          </div>

          <div style={{ background: '#1C1B19', padding: '0 40px 12px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: '#6B6560' }}>© {new Date().getFullYear()} FINKA keukens</span>
            <span style={{ fontSize: 9, color: '#6B6560' }}>{quote.customer_document_label} onder voorbehoud</span>
          </div>
          <div style={{ background: '#1C1B19', padding: '0 40px 18px' }}>
            <span style={{ fontSize: 10, color: '#9B9591', lineHeight: 1.5 }}>Op deze {quote.customer_document_label.toLowerCase()} en alle door FINKA keukens uitgebrachte offertes zijn onze algemene voorwaarden van toepassing.</span>
          </div>
        </div>

      </div>
    </>
  )
}
