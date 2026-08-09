export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Offer, Customer, InspirationImage, OfferSpecs, OfferAttachment } from '@/lib/types'
import PrintButton from './PrintButton'

const SPEC_CATEGORIES = [
  { key: 'fronten', label: 'Fronten' },
  { key: 'werkblad', label: 'Werkblad' },
  { key: 'klimuur', label: 'Klimuur / accent' },
  { key: 'kookeiland', label: 'Kookeiland' },
  { key: 'apparatuur', label: 'Apparatuur' },
  { key: 'maatwerk', label: 'Maatwerk & installatie' },
]

function formatPrice(n: number) {
  return new Intl.NumberFormat('nl-NL').format(n)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function OffertePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: customer }, { data: offer }] = await Promise.all([
    supabase.from('finka_customers').select('*').eq('id', id).single(),
    supabase.from('finka_offers').select('*').eq('customer_id', id).maybeSingle(),
  ])

  if (!customer) notFound()
  if (!offer) redirect(`/klanten/${id}?tab=offerte`)

  const o = offer as Offer
  const c = customer as Customer
  const specs = (o.specs ?? {}) as OfferSpecs
  const inspirationImages = (o.inspiration_images ?? []) as InspirationImage[]
  const attachments = (o.attachments ?? []) as OfferAttachment[]

  const filledSpecCategories = SPEC_CATEGORIES.filter(({ key }) => (specs[key] ?? []).length > 0)

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
          width: 210mm;
          min-height: 297mm;
          position: relative;
          overflow: hidden;
          background: #fff;
          page-break-after: always;
          break-after: page;
        }

        .serif { font-family: 'Cormorant Garamond', serif; }

        @media print {
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .page { width: 100%; height: 297mm; page-break-after: always; break-after: page; }
        }

        @media screen {
          body { background: #e5e5e5; }
          .pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0 48px; }
          .page { box-shadow: 0 2px 16px rgba(0,0,0,0.12); }
        }
      `}</style>

      {/* Toolbar - verborgen bij printen */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a href={`/klanten/${id}?tab=offerte`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Terug naar editor
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {c.first_name} {c.last_name} — Conceptofferte
          </span>
          <PrintButton />
        </div>
      </div>
      <div className="no-print" style={{ height: 57 }} />

      <div className="pages">

        {/* ─── Pagina 1: Hoofdrender ─── */}
        {o.render_image_url && (
          <div className="page" style={{ background: '#1C1B19' }}>
            <img
              src={o.render_image_url}
              alt="Hoofdrender"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', top: 32, left: 0, right: 0,
              display: 'flex', justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 13, letterSpacing: '0.25em',
                color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase',
              }}>FINKA</span>
            </div>
          </div>
        )}

        {/* ─── Pagina 2: Sfeerfoto + intro ─── */}
        <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Top: sfeerfoto */}
          {o.sfeerfoto_url && (
            <div style={{ flex: '0 0 55%', overflow: 'hidden' }}>
              <img
                src={o.sfeerfoto_url}
                alt="Sfeerfoto"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}
          {/* Bottom: tekst */}
          <div style={{
            flex: 1,
            padding: '48px 56px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: '#FAF8F5',
          }}>
            <div style={{ marginBottom: 8, fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase' }}>
              FINKA keukens
            </div>
            {o.subtitle && (
              <h1 className="serif" style={{ fontSize: 40, fontWeight: 300, lineHeight: 1.1, marginBottom: 28, color: '#1C1B19' }}>
                {o.subtitle}
              </h1>
            )}
            {o.intro_text && (
              <div style={{ fontSize: 13, lineHeight: 1.75, color: '#3d3a37', whiteSpace: 'pre-line', maxWidth: 420 }}>
                {o.intro_text}
              </div>
            )}
          </div>
        </div>

        {/* ─── Pagina 3: Inspiratie ─── */}
        {inspirationImages.length > 0 && (
          <div className="page" style={{ padding: '56px', display: 'flex', flexDirection: 'column', gap: 40 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 6 }}>
                1 — Sfeer & beeld
              </div>
              <h2 className="serif" style={{ fontSize: 48, fontWeight: 300, lineHeight: 1, color: '#1C1B19' }}>
                Zoals wij<br />het zien.
              </h2>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: inspirationImages.length === 1 ? '1fr' : '1fr 1fr',
              gap: 12,
              flex: 1,
            }}>
              {inspirationImages.map((img, i) => (
                <div key={i} style={{ overflow: 'hidden', borderRadius: 2 }}>
                  <img
                    src={img.url}
                    alt={`Inspiratie ${i + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Pagina 4: Even laten bezinken ─── */}
        {o.bezinken_text && (
          <div className="page" style={{ padding: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 6 }}>
              1 — Sfeer & beeld
            </div>
            <h2 className="serif" style={{ fontSize: 48, fontWeight: 300, lineHeight: 1, color: '#1C1B19', marginBottom: 40 }}>
              Even laten<br />bezinken.
            </h2>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: '#3d3a37', maxWidth: 480, whiteSpace: 'pre-line' }}>
              {o.bezinken_text}
            </p>
          </div>
        )}

        {/* ─── Pagina 5-6: Specificaties ─── */}
        {filledSpecCategories.length > 0 && (
          <div className="page" style={{ padding: '56px' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 6 }}>
              2 — Specificaties
            </div>
            <h2 className="serif" style={{ fontSize: 48, fontWeight: 300, lineHeight: 1, color: '#1C1B19', marginBottom: 8 }}>
              Wat zit<br />erin.
            </h2>
            <p style={{ fontSize: 11, color: '#9B9591', marginBottom: 40, maxWidth: 320 }}>
              Een volledig op maat gemaakte keuken — klantgericht, betaalbaar en kwalitatief.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {filledSpecCategories.map(({ key, label }) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.18em', color: '#9B9591', textTransform: 'uppercase', paddingTop: 3 }}>
                    {label}
                  </div>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(specs[key] ?? []).map((item, i) => (
                      <li key={i} style={{ fontSize: 12, color: '#1C1B19', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                        <span style={{ color: '#C9A96E', flexShrink: 0 }}>—</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Prijspagina ─── */}
        {o.total_price && (
          <div className="page" style={{ background: '#1C1B19', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 16 }}>
              Totaalindicatie — incl. BTW
            </div>
            <div className="serif" style={{ fontSize: 80, fontWeight: 300, color: '#FAF8F5', lineHeight: 1, letterSpacing: '-0.02em' }}>
              €{formatPrice(o.total_price)}
            </div>
            <div style={{ marginTop: 32, fontSize: 10, color: '#6B6560', textAlign: 'center', maxWidth: 320, lineHeight: 1.7 }}>
              Deze prijsindicatie is onder voorbehoud van definitieve prijzen en onderbouwing door FINKA keukens.
            </div>
          </div>
        )}

        {/* ─── Afsluitpagina ─── */}
        <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px' }}>
            <p className="serif" style={{ fontSize: 32, fontWeight: 300, fontStyle: 'italic', textAlign: 'center', color: '#1C1B19', lineHeight: 1.3, marginBottom: 20 }}>
              "We zijn benieuwd wat jullie<br />ervan vinden."
            </p>
            <p style={{ fontSize: 11, letterSpacing: '0.15em', color: '#9B9591', textTransform: 'uppercase' }}>
              Merel &amp; Kieke · FINKA keukens
            </p>
          </div>

          {/* Footer */}
          <div style={{
            background: '#1C1B19',
            padding: '32px 56px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 24,
          }}>
            {[
              {
                title: 'Contact',
                lines: ['contact@finkakeukens.nl', 'Merel — 06 1616 5175', 'Kieke — 06 5131 5775'],
              },
              {
                title: 'Bedrijf',
                lines: ['KVK 98060597', 'finkakeukens.nl'],
              },
              {
                title: 'Voor',
                lines: [
                  `${c.first_name} ${c.last_name}`,
                  c.city ?? '',
                  formatDate(o.created_at),
                ].filter(Boolean),
              },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 9, letterSpacing: '0.18em', color: '#6B6560', textTransform: 'uppercase', marginBottom: 10 }}>
                  {col.title}
                </div>
                {col.lines.map((line, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#9B9591', lineHeight: 1.7 }}>{line}</div>
                ))}
              </div>
            ))}
            <div />
          </div>

          <div style={{ background: '#1C1B19', padding: '0 56px 24px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#6B6560' }}>© {new Date().getFullYear()} FINKA keukens</span>
            <span style={{ fontSize: 10, color: '#6B6560' }}>Prijsindicatie onder voorbehoud</span>
          </div>
        </div>

      </div>
    </>
  )
}
