export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ConnectionItem, ConnectionSchema, Customer, Project, Quote } from '@/lib/types'
import { buildItemNumbers, CATEGORY_LABELS, CATEGORY_ORDER, formatItemNumber, PIN_TYPE_COLORS } from '@/lib/aansluitschema'
import PrintButton from '../PrintButton'
import DownloadButton from './DownloadButton'

// Losse, apart downloadbare bijlage bij de offerte — zelfde brondata als het
// interne tabblad Aansluitschema, maar in de huisstijl van de offerte
// (zelfde .page/lettertype-opzet als ../page.tsx) i.p.v. de interne
// PDF-opmaak. Staat los van de hoofdofferte (zie de verwijzingspagina daar)
// zodat "offerte" en "bijlage" twee losse documenten blijven om te
// downloaden, met een eigen bestandsnaam voor de bijlage.
export default async function AansluitschemaBijlagePage({ params }: { params: Promise<{ projectId: string }> }) {
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

  // Deze bijlage bestaat alleen als staff de toggle in de editor heeft
  // aangezet — anders terug naar de hoofdofferte (geen losse foutmelding
  // nodig, dit is geen link die een klant ooit zelf intypt).
  if (!quote?.include_aansluitschema_bijlage) redirect(`/offerte/${projectId}`)

  const c = project.customer

  const [{ data: itemsData }, { data: schemaData }] = await Promise.all([
    supabase.from('finka_connection_items').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('finka_connection_schema').select('*').eq('project_id', projectId).maybeSingle(),
  ])
  const aansluitschemaItems = (itemsData ?? []) as ConnectionItem[]
  const aansluitschema = schemaData as ConnectionSchema | null

  const applicableItems = aansluitschemaItems.filter((i) => i.van_toepassing)
  const itemNumbers = buildItemNumbers(aansluitschemaItems)
  const wanden = (aansluitschema?.wanden ?? []).filter((w) => w.bron_afbeelding_url && w.pins.length > 0)

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
        }

        .page:not(:last-child) {
          page-break-after: always;
          break-after: page;
        }

        .serif { font-family: 'Cormorant Garamond', serif; }

        @media print {
          @page { size: 297mm 167mm; margin: 0; }
          .no-print { display: none !important; }
          .page { width: 100%; height: 167mm; }
          .page:not(:last-child) { page-break-after: always; break-after: page; }
        }

        @media screen {
          body { background: #e5e5e5; }
          .pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0 48px; }
          .page { box-shadow: 0 2px 16px rgba(0,0,0,0.12); }
        }
      `}</style>

      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a href={`/offerte/${projectId}`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Terug naar offerte
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Bijlage: Aansluitschema — {c.first_name} {c.last_name} — {project.title}
          </span>
          <DownloadButton projectId={projectId} />
          <PrintButton />
        </div>
      </div>
      <div className="no-print" style={{ height: 57 }} />

      <div className="pages">
        {applicableItems.length > 0 && (
          <div className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 6, flexShrink: 0 }}>
              Bijlage
            </div>
            <h2 className="serif" style={{ fontSize: 38, fontWeight: 550, lineHeight: 1, color: '#1C1B19', marginBottom: 16, flexShrink: 0 }}>
              Aansluitschema.
            </h2>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', columnCount: applicableItems.length > 10 ? 2 : 1, columnGap: 32 }}>
              {CATEGORY_ORDER.map((category) => {
                const rows = applicableItems.filter((i) => i.category === category)
                if (!rows.length) return null
                return (
                  <div key={category} style={{ breakInside: 'avoid', marginBottom: 14 }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.1em', color: '#9B9591', textTransform: 'uppercase', fontWeight: 600, padding: '6px 0', borderBottom: '1px solid #E6E2D9' }}>
                      {CATEGORY_LABELS[category]}
                    </div>
                    {rows.map((item) => (
                      <div key={item.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #E6E2D9', breakInside: 'avoid' }}>
                        <span style={{ fontSize: 10, color: '#9B9591', flexShrink: 0, width: 18 }}>{formatItemNumber(itemNumbers.get(item.id) ?? 0)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: '#1C1B19', lineHeight: 1.35 }}>{item.omschrijving}</div>
                          {(item.aantal || item.hoogte_cm || item.positie_toelichting) && (
                            <div style={{ fontSize: 10, color: '#6B6560', lineHeight: 1.35, marginTop: 1 }}>
                              {[item.aantal && `${item.aantal}x`, item.hoogte_cm && `${item.hoogte_cm} cm`, item.positie_toelichting].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {wanden.map((wand) => {
          const pinRows = wand.pins
            .map((pin) => {
              const item = pin.connection_item_id ? aansluitschemaItems.find((i) => i.id === pin.connection_item_id) : null
              const nummer = item ? itemNumbers.get(item.id) ?? 0 : 0
              const omschrijving = pin.label || item?.omschrijving || '—'
              return { pin, nummer, omschrijving }
            })
            .sort((a, b) => (a.nummer || 999) - (b.nummer || 999))
          return (
            <div key={wand.id} className="page" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#9B9591', textTransform: 'uppercase', marginBottom: 6, flexShrink: 0 }}>
                Bijlage
              </div>
              <h2 className="serif" style={{ fontSize: 38, fontWeight: 550, lineHeight: 1, color: '#1C1B19', marginBottom: 16, flexShrink: 0 }}>
                {wand.label}.
              </h2>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={wand.bron_afbeelding_url!}
                    alt={wand.label}
                    style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', borderRadius: 10, border: '1px solid #DDD8D2' }}
                  />
                  {wand.pins.map((pin) => {
                    const item = pin.connection_item_id ? aansluitschemaItems.find((i) => i.id === pin.connection_item_id) : null
                    const nummer = item ? itemNumbers.get(item.id) ?? 0 : 0
                    return (
                      <div
                        key={pin.id}
                        style={{
                          position: 'absolute',
                          left: `${pin.x * 100}%`,
                          top: `${pin.y * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#fff',
                          border: `2px solid ${PIN_TYPE_COLORS[pin.type]}`,
                          color: PIN_TYPE_COLORS[pin.type],
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {nummer ? formatItemNumber(nummer) : '?'}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ flexShrink: 0, marginTop: 12, fontSize: 10, lineHeight: 1.6, color: '#3d3a37' }}>
                {pinRows.map(({ pin, nummer, omschrijving }, i) => (
                  <span key={pin.id}>
                    <strong>{nummer ? formatItemNumber(nummer) : '?'}</strong> {omschrijving}
                    {pin.hoogte_cm ? `, ${pin.hoogte_cm} cm` : ''}
                    {i < pinRows.length - 1 ? '  ·  ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
