'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Offer, Customer, InspirationImage, OfferSpecs, OfferAttachment } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Upload, Paperclip, FileText } from 'lucide-react'

const DEFAULT_SPECS: OfferSpecs = {
  fronten: [
    'Hoogwaardige fronten in hoofdkleur — kleur mag je kiezen',
    'Greeplijsten bij hoge kasten en bovenste rij lades',
    'Push to open in onderste lades van de onderkasten',
  ],
  werkblad: [
    'RVS blad van 4 mm dik, werkdiepte 96 cm',
    'Gootsteen ingelast in het RVS blad',
    'Levering, installatie en inmeting van het blad ná installatie van de keukenkasten',
  ],
  klimuur: [],
  kookeiland: [],
  apparatuur: [],
  maatwerk: ['Levering en installatie van de keuken'],
}

const SPEC_CATEGORIES = [
  { key: 'fronten', label: 'Fronten' },
  { key: 'werkblad', label: 'Werkblad' },
  { key: 'klimuur', label: 'Klimuur / accent' },
  { key: 'kookeiland', label: 'Kookeiland' },
  { key: 'apparatuur', label: 'Apparatuur' },
  { key: 'maatwerk', label: 'Maatwerk & installatie' },
]

function defaultIntro(firstName: string) {
  return `Hi ${firstName},\n\nWe hebben onze plannen voor jouw keuken op papier gezet. Hieronder vind je een overzicht van wat we voor ogen hebben — qua stijl, materialen en uitvoering.\n\nNeem de tijd om het rustig door te lezen. We zijn benieuwd wat je ervan vindt.\n\nMet vriendelijke groet,\nMerel & Kieke\nFINKA keukens`
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDD8D2] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#DDD8D2] flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-[#1C1B19]">{title}</h3>
        {subtitle && <span className="text-xs text-[#9B9591]">{subtitle}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function SingleImageUpload({
  url,
  onUpload,
  uploading,
  inputRef,
  placeholder = 'Foto uploaden',
}: {
  url: string
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  placeholder?: string
}) {
  return (
    <div>
      {url ? (
        <div className="relative rounded-lg overflow-hidden h-52 bg-[#F7F5F2] group">
          <img src={url} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={() => inputRef.current?.click()}
              className="text-white text-sm bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg"
            >
              Vervangen
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-36 border-2 border-dashed border-[#DDD8D2] rounded-lg flex flex-col items-center justify-center gap-2 hover:border-[#C9A96E] transition-colors text-[#6B6560] hover:text-[#1C1B19]"
        >
          <Upload size={18} />
          <span className="text-sm">{uploading ? 'Uploaden...' : placeholder}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
    </div>
  )
}

export default function OfferteEditor({
  offer: initialOffer,
  customerId,
  customer,
}: {
  offer: Offer | null
  customerId: string
  customer: Customer
}) {
  const supabase = createClient()
  const [offer, setOffer] = useState<Offer | null>(initialOffer)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [status, setStatus] = useState(initialOffer?.status ?? 'concept')
  const [renderImageUrl, setRenderImageUrl] = useState(initialOffer?.render_image_url ?? '')
  const [sfeerfotoUrl, setSfeerfotoUrl] = useState(initialOffer?.sfeerfoto_url ?? '')
  const [subtitle, setSubtitle] = useState(
    initialOffer?.subtitle ?? (customer.city ? `Een woonkeuken in ${customer.city}.` : '')
  )
  const [introText, setIntroText] = useState(
    initialOffer?.intro_text ?? defaultIntro(customer.first_name)
  )
  const [inspirationImages, setInspirationImages] = useState<InspirationImage[]>(
    (initialOffer?.inspiration_images as InspirationImage[]) ?? []
  )
  const [bezinkenText, setBezinkenText] = useState(initialOffer?.bezinken_text ?? '')
  const [specs, setSpecs] = useState<OfferSpecs>(
    (initialOffer?.specs as OfferSpecs) ?? DEFAULT_SPECS
  )
  const [totalPrice, setTotalPrice] = useState(initialOffer?.total_price?.toString() ?? '')
  const [attachments, setAttachments] = useState<OfferAttachment[]>(
    (initialOffer?.attachments as OfferAttachment[]) ?? []
  )
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const [uploadingRender, setUploadingRender] = useState(false)
  const [uploadingSfeerfoto, setUploadingSfeerfoto] = useState(false)
  const [uploadingInspiration, setUploadingInspiration] = useState(false)
  const renderInputRef = useRef<HTMLInputElement>(null)
  const sfeerfotoInputRef = useRef<HTMLInputElement>(null)
  const inspirationInputRef = useRef<HTMLInputElement>(null)

  async function createOffer() {
    setCreating(true)
    setCreateError('')

    // Kopieer sfeerfoto van meest recente offerte
    const { data: latest } = await supabase
      .from('finka_offers')
      .select('sfeerfoto_url')
      .not('sfeerfoto_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('finka_offers')
      .insert({
        customer_id: customerId,
        sfeerfoto_url: latest?.sfeerfoto_url ?? null,
        subtitle: customer.city ? `Een woonkeuken in ${customer.city}.` : '',
        intro_text: defaultIntro(customer.first_name),
        specs: DEFAULT_SPECS,
        inspiration_images: [],
      })
      .select()
      .single()

    if (error) {
      setCreateError(error.message)
    } else if (data) {
      setOffer(data as Offer)
      if (latest?.sfeerfoto_url) setSfeerfotoUrl(latest.sfeerfoto_url)
    }
    setCreating(false)
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('offer-images').upload(path, file, { upsert: true })
    if (error) return null
    return supabase.storage.from('offer-images').getPublicUrl(path).data.publicUrl
  }

  async function handleRenderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !offer) return
    setUploadingRender(true)
    const ext = file.name.split('.').pop()
    const url = await uploadImage(file, `${offer.id}/render-${Date.now()}.${ext}`)
    if (url) setRenderImageUrl(url)
    setUploadingRender(false)
  }

  async function handleSfeerfotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !offer) return
    setUploadingSfeerfoto(true)
    const ext = file.name.split('.').pop()
    const url = await uploadImage(file, `shared/sfeerfoto-${Date.now()}.${ext}`)
    if (url) setSfeerfotoUrl(url)
    setUploadingSfeerfoto(false)
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !offer) return
    setUploadingAttachment(true)
    const newAttachments = [...attachments]
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${offer.id}/bijlagen-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('offer-images').upload(path, file, { upsert: true })
      if (!error) {
        const url = supabase.storage.from('offer-images').getPublicUrl(path).data.publicUrl
        newAttachments.push({ name: file.name, url, size: file.size })
      }
    }
    setAttachments(newAttachments)
    setUploadingAttachment(false)
    e.target.value = ''
  }

  async function handleInspirationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !offer) return
    setUploadingInspiration(true)
    const newImages = [...inspirationImages]
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const url = await uploadImage(file, `${offer.id}/insp-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
      if (url) newImages.push({ url })
    }
    setInspirationImages(newImages)
    setUploadingInspiration(false)
  }

  function updateSpecItem(category: string, index: number, value: string) {
    setSpecs(prev => ({ ...prev, [category]: prev[category].map((item, i) => i === index ? value : item) }))
  }

  function addSpecItem(category: string) {
    setSpecs(prev => ({ ...prev, [category]: [...(prev[category] ?? []), ''] }))
  }

  function removeSpecItem(category: string, index: number) {
    setSpecs(prev => ({ ...prev, [category]: prev[category].filter((_, i) => i !== index) }))
  }

  async function handleSave() {
    if (!offer) return
    setSaving(true)
    const { error } = await supabase.from('finka_offers').update({
      status,
      render_image_url: renderImageUrl || null,
      sfeerfoto_url: sfeerfotoUrl || null,
      subtitle: subtitle || null,
      intro_text: introText || null,
      inspiration_images: inspirationImages,
      bezinken_text: bezinkenText || null,
      specs,
      total_price: totalPrice ? parseInt(totalPrice.replace(/\D/g, '')) : null,
      attachments,
      updated_at: new Date().toISOString(),
    }).eq('id', offer.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (!offer) {
    return (
      <div className="bg-white rounded-xl border border-[#DDD8D2] p-12 text-center">
        <p className="text-sm text-[#6B6560] mb-4">Er is nog geen conceptofferte voor deze klant.</p>
        <Button onClick={createOffer} disabled={creating}>
          {creating ? 'Aanmaken...' : 'Conceptofferte aanmaken'}
        </Button>
        {createError && <p className="text-sm text-red-600 mt-3">{createError}</p>}
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    concept: 'bg-amber-50 text-amber-700 border-amber-100',
    verstuurd: 'bg-blue-50 text-blue-700 border-blue-100',
    geaccepteerd: 'bg-green-50 text-green-700 border-green-100',
  }

  return (
    <div className="space-y-5">
      {/* Status + opslaan */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#6B6560]">Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Offer['status'])}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium focus:outline-none cursor-pointer ${statusColors[status]}`}
          >
            <option value="concept">Concept</option>
            <option value="verstuurd">Verstuurd</option>
            <option value="geaccepteerd">Geaccepteerd</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/offerte-preview/${customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm border border-[#DDD8D2] rounded-lg text-[#6B6560] hover:border-[#1C1B19] hover:text-[#1C1B19] transition-colors"
          >
            Offerte bekijken →
          </a>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Opslaan...' : saved ? '✓ Opgeslagen' : 'Opslaan'}
          </Button>
        </div>
      </div>

      {/* 1. Hoofdrender */}
      <Section title="Hoofdrender" subtitle="per klant — pagina 1">
        <SingleImageUpload
          url={renderImageUrl}
          onUpload={handleRenderUpload}
          uploading={uploadingRender}
          inputRef={renderInputRef}
          placeholder="Render uploaden"
        />
      </Section>

      {/* 2. Sfeerfoto & intro */}
      <Section title="Sfeerfoto & intro" subtitle="vaste FINKA-foto — pagina 2">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-[#6B6560] uppercase tracking-wide mb-2">
              Sfeerfoto
              <span className="ml-2 font-normal normal-case text-[#B8B3AE]">— zelfde voor alle klanten, eenmalig instellen</span>
            </p>
            <SingleImageUpload
              url={sfeerfotoUrl}
              onUpload={handleSfeerfotoUpload}
              uploading={uploadingSfeerfoto}
              inputRef={sfeerfotoInputRef}
              placeholder="Sfeerfoto uploaden"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6B6560] uppercase tracking-wide">Titel</label>
            <input
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Een woonkeuken in Amsterdam."
              className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6B6560] uppercase tracking-wide">Intro tekst</label>
            <textarea
              value={introText}
              onChange={e => setIntroText(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
            />
          </div>
        </div>
      </Section>

      {/* 3. Inspiratie */}
      <Section title="Inspiratie — 'Zoals wij het zien'">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {inspirationImages.map((img, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden aspect-square bg-[#F7F5F2] group">
                <img src={img.url} alt={`Inspiratie ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => setInspirationImages(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {inspirationImages.length < 6 && (
              <button
                onClick={() => inspirationInputRef.current?.click()}
                disabled={uploadingInspiration}
                className="aspect-square border-2 border-dashed border-[#DDD8D2] rounded-lg flex flex-col items-center justify-center gap-2 hover:border-[#C9A96E] transition-colors text-[#6B6560] hover:text-[#1C1B19]"
              >
                <Upload size={16} />
                <span className="text-xs">{uploadingInspiration ? 'Uploaden...' : "Foto's toevoegen"}</span>
              </button>
            )}
          </div>
          <input ref={inspirationInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleInspirationUpload} />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6B6560] uppercase tracking-wide">"Even laten bezinken" tekst</label>
            <textarea
              value={bezinkenText}
              onChange={e => setBezinkenText(e.target.value)}
              rows={4}
              placeholder="Beschrijving van de ontwerpaanpak en materiaalkeuzes..."
              className="w-full px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19] resize-none"
            />
          </div>
        </div>
      </Section>

      {/* 4. Specificaties */}
      <Section title="Specificaties — 'Wat zit erin'">
        <div className="divide-y divide-[#F0ECE8]">
          {SPEC_CATEGORIES.map(({ key, label }) => (
            <div key={key} className="py-5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#6B6560] uppercase tracking-widest">{label}</span>
                <button
                  onClick={() => addSpecItem(key)}
                  className="text-xs text-[#C9A96E] hover:text-[#b8935a] flex items-center gap-1"
                >
                  <Plus size={12} />
                  Toevoegen
                </button>
              </div>
              {(specs[key] ?? []).length === 0 ? (
                <p className="text-xs text-[#B8B3AE] italic">Nog geen specificaties</p>
              ) : (
                <div className="space-y-2">
                  {(specs[key] ?? []).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[#C9A96E] shrink-0 text-sm">—</span>
                      <input
                        value={item}
                        onChange={e => updateSpecItem(key, i, e.target.value)}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
                      />
                      <button onClick={() => removeSpecItem(key, i)} className="text-[#B8B3AE] hover:text-red-500 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* 5. Prijs */}
      <Section title="Prijs">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold text-[#1C1B19]">€</span>
            <input
              value={totalPrice}
              onChange={e => setTotalPrice(e.target.value)}
              placeholder="29.870"
              className="w-44 px-3 py-2 text-xl font-semibold bg-white border border-[#DDD8D2] rounded-lg focus:outline-none focus:border-[#1C1B19]"
            />
            <span className="text-sm text-[#6B6560]">incl. BTW</span>
          </div>
          <p className="text-xs text-[#B8B3AE]">
            Deze prijsindicatie is onder voorbehoud van definitieve prijzen en onderbouwing door FINKA keukens.
          </p>
        </div>
      </Section>

      {/* 6. Bijlagen */}
      <Section title="Bijlagen">
        <div className="space-y-3">
          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#F7F5F2] rounded-lg">
                  <FileText size={16} className="text-[#6B6560] shrink-0" />
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-[#1C1B19] hover:text-[#C9A96E] truncate"
                  >
                    {file.name}
                  </a>
                  {file.size && (
                    <span className="text-xs text-[#9B9591] shrink-0">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-[#B8B3AE] hover:text-red-500 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => attachmentInputRef.current?.click()}
            disabled={uploadingAttachment}
            className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-[#DDD8D2] rounded-lg text-sm text-[#6B6560] hover:border-[#C9A96E] hover:text-[#1C1B19] transition-colors w-full justify-center"
          >
            <Paperclip size={15} />
            {uploadingAttachment ? 'Uploaden...' : 'Bijlage toevoegen (PDF, Word, …)'}
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            multiple
            className="hidden"
            onChange={handleAttachmentUpload}
          />
        </div>
      </Section>

      {/* Opslaan onderaan */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Opslaan...' : saved ? '✓ Opgeslagen' : 'Wijzigingen opslaan'}
        </Button>
      </div>
    </div>
  )
}
