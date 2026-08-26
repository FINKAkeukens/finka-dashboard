export const dynamic = 'force-dynamic'

import { Fragment } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/aansluitschema'
import { ConnectionItem, ConnectionSchema, Project } from '@/lib/types'
import PrintButton from './PrintButton'
import DownloadButton from './DownloadButton'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function AansluitschemaPrintPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('finka_projects')
    .select('*, customer:finka_customers(id, first_name, last_name)')
    .eq('id', projectId)
    .single() as { data: Project | null }
  if (!project) notFound()

  const [{ data: itemsData }, { data: schemaData }] = await Promise.all([
    supabase.from('finka_connection_items').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('finka_connection_schema').select('*').eq('project_id', projectId).maybeSingle(),
  ])
  const items = (itemsData ?? []) as ConnectionItem[]
  const schema = schemaData as ConnectionSchema | null
  const applicableItems = items.filter((i) => i.van_toepassing)
  const letOpLines = (schema?.let_op_notities ?? '').split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
  const today = new Date().toISOString()

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', Arial, sans-serif; background: #fff; color: #1C1B19; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .a4 { width: 210mm; min-height: 297mm; position: relative; padding: 16mm 14mm; background: #fff; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #DDD8D2; padding: 5px 8px; text-align: left; vertical-align: top; }
        th { background: #F7F5F2; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #6B6560; }
        .cat-row td { background: #EFEAE0; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
        .watermark { position: absolute; top: 6mm; left: 14mm; font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: #9A948D; }
        .watermark-bottom { position: absolute; bottom: 6mm; left: 14mm; font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: #9A948D; }
        @media print {
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .a4 { page-break-after: always; break-after: page; }
        }
        @media screen {
          body { background: #e5e5e5; }
          .pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px 0 48px; }
          .a4 { box-shadow: 0 2px 16px rgba(0,0,0,0.12); }
        }
      `}</style>

      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a href={`/projecten/${projectId}?tab=aansluitschema`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Terug naar editor
        </a>
        <div className="flex items-center gap-3">
          <DownloadButton projectId={projectId} />
          <PrintButton />
        </div>
      </div>
      <div className="no-print" style={{ height: 57 }} />

      <div className="pages">
        <div className="a4">
          <div className="watermark">Intern</div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.08em' }}>FINKA KEUKENS</div>
            <div style={{ fontSize: 12, color: '#6B6560' }}>Aansluitschema — ingevuld</div>
          </div>

          <table style={{ marginBottom: 16 }}>
            <tbody>
              <tr>
                <td style={{ width: '18%', fontWeight: 600 }}>Project</td>
                <td style={{ width: '32%' }}>{project.title}</td>
                <td style={{ width: '18%', fontWeight: 600 }}>Klant</td>
                <td>{project.customer ? `${project.customer.first_name} ${project.customer.last_name}, ${project.reference_number}` : project.reference_number}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Adres</td>
                <td>{schema?.adres || '—'}</td>
                <td style={{ fontWeight: 600 }}>Datum / versie</td>
                <td>{formatDate(today)} · versie {schema?.versie ?? 1}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Opsteller</td>
                <td>{schema?.opsteller || 'FINKA Keukens'}</td>
                <td style={{ fontWeight: 600 }}>Behorend bij tekening</td>
                <td>{schema?.behorend_bij_tekening || '—'}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ fontSize: 10.5, lineHeight: 1.5, marginBottom: 4 }}>
            Voordat de keuken gemonteerd kan worden, is het van belang dat een aantal zaken met betrekking tot de leidingen goed geregeld is.
            Indien u rekening houdt met onderstaande richtlijnen, kunnen wij ervoor zorgen dat uw keuken strak, netjes en helemaal volgens uw
            wensen geplaatst wordt. Alleen de aangekruiste regels zijn van toepassing op dit project; alle maten zijn hartmaten gemeten vanaf
            de afgewerkte vloer.
          </p>
          <p style={{ fontSize: 10.5, fontStyle: 'italic', color: '#6B6560', marginBottom: 16 }}>Heeft u vragen over onderstaande richtlijnen? Laat het ons weten.</p>

          <table>
            <thead>
              <tr>
                <th style={{ width: '6%' }}>Nr.</th>
                <th style={{ width: '44%' }}>Omschrijving aansluiting</th>
                <th style={{ width: '10%' }}>Aantal</th>
                <th style={{ width: '12%' }}>Hoogte (cm)</th>
                <th>Positie / toelichting</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map((category) => {
                const rows = applicableItems.filter((i) => i.category === category)
                if (!rows.length) return null
                return (
                  <Fragment key={category}>
                    <tr className="cat-row">
                      <td colSpan={5}>{CATEGORY_LABELS[category]}</td>
                    </tr>
                    {rows.map((item, idx) => (
                      <tr key={item.id}>
                        <td>{idx + 1}</td>
                        <td>{item.omschrijving}</td>
                        <td>{item.aantal || '—'}</td>
                        <td>{item.hoogte_cm || '—'}</td>
                        <td>{item.positie_toelichting || '—'}</td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {!applicableItems.length && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9A948D' }}>Nog geen regels aangevinkt</td></tr>
              )}
            </tbody>
          </table>

          <div className="watermark-bottom">Intern</div>
        </div>

        {(schema?.groepenverdeling_tekst || schema?.extra_secties?.length || letOpLines.length) && (
          <div className="a4">
            <div className="watermark">Intern</div>

            {schema?.groepenverdeling_tekst && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, marginBottom: 4 }}>Groepenverdeling</h3>
                <p style={{ fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{schema.groepenverdeling_tekst}</p>
              </div>
            )}

            {schema?.extra_secties?.map((sectie, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, marginBottom: 4 }}>{sectie.titel}</h3>
                <p style={{ fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{sectie.tekst}</p>
              </div>
            ))}

            {letOpLines.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Let op</h3>
                <ul style={{ fontSize: 10.5, lineHeight: 1.6, paddingLeft: 16 }}>
                  {letOpLines.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>Akkoord</h3>
              <table>
                <thead>
                  <tr>
                    <th>Klant</th>
                    <th>Installateur</th>
                    <th>FINKA Keukens</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ height: 60 }}>
                    <td style={{ color: '#9A948D', fontSize: 9 }}>Naam / datum</td>
                    <td style={{ color: '#9A948D', fontSize: 9 }}>Naam / datum</td>
                    <td style={{ color: '#9A948D', fontSize: 9 }}>Naam / datum</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 9, fontStyle: 'italic', color: '#9A948D', marginTop: 8 }}>
                Wijzigingen in de opstelling na akkoord kunnen leiden tot extra kosten en een langere levertijd. Definitief inmeten vindt plaats nadat wanden en vloer zijn afgewerkt.
              </p>
            </div>

            <div className="watermark-bottom">Intern</div>
          </div>
        )}

        {/* De visuele kastenrij-tekening (voorheen hier gerenderd per wand)
           is nog niet af, zie AansluitschemaTekening.tsx — komt terug zodra
           die klaar is. */}
      </div>
    </>
  )
}
