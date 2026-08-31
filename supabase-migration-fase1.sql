-- FINKA Dashboard — Fase 1 migratie
-- Voer uit in de Supabase SQL editor NA supabase-schema.sql.
-- Bevat: (1) reconciliatie van bestaande tabellen met wat live al stond maar
-- niet in supabase-schema.sql was vastgelegd, en (2) alle nieuwe Fase 1-tabellen.

-- =========================================================
-- 1. Reconciliatie bestaande tabellen (live schema had al kolommen
--    die niet in het oude supabase-schema.sql stonden; deze ALTERs
--    zijn idempotent en veilig om opnieuw te draaien)
-- =========================================================

ALTER TABLE finka_appliances ADD COLUMN IF NOT EXISTS price_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finka_appliances ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE finka_appliances DROP CONSTRAINT IF EXISTS finka_appliances_type_check;
ALTER TABLE finka_appliances ADD CONSTRAINT finka_appliances_type_check
  CHECK (type IN ('kookplaat','oven','vaatwasser','afzuigkap','koelkast','koelvries','combi-oven','kokendwaterkraan','anders'));

ALTER TABLE finka_offers ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finka_offers ADD COLUMN IF NOT EXISTS render_image_url TEXT;
ALTER TABLE finka_offers ADD COLUMN IF NOT EXISTS sfeerfoto_url TEXT;
ALTER TABLE finka_offers ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

ALTER TABLE finka_customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- =========================================================
-- 2. Projecten (CRM-pijplijn los van de klantkaart zelf)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_project_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#DDD8D2',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO finka_project_statuses (label, sort_order, color)
SELECT * FROM (VALUES
  ('Lead', 0, '#9CA3AF'),
  ('Offerte', 1, '#C9A96E'),
  ('Akkoord', 2, '#22C55E'),
  ('Gepland', 3, '#3B82F6'),
  ('In uitvoering', 4, '#F59E0B'),
  ('Opgeleverd', 5, '#6B7280')
) AS seed(label, sort_order, color)
WHERE NOT EXISTS (SELECT 1 FROM finka_project_statuses);

CREATE TABLE IF NOT EXISTS finka_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES finka_customers(id) ON DELETE CASCADE,
  reference_number TEXT UNIQUE,
  title TEXT NOT NULL,
  status_id UUID REFERENCES finka_project_statuses(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Format: FP-2026-0105 (4 cijfers, sluit aan op de foldernummering die al
-- buiten het dashboard in gebruik was — zie migratie die de seq ophoogt).
CREATE SEQUENCE IF NOT EXISTS finka_project_seq START 1;

CREATE OR REPLACE FUNCTION generate_project_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference_number := 'FP-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('finka_project_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_project_reference ON finka_projects;
CREATE TRIGGER set_project_reference
  BEFORE INSERT ON finka_projects
  FOR EACH ROW
  WHEN (NEW.reference_number IS NULL)
  EXECUTE FUNCTION generate_project_reference();

-- =========================================================
-- 3. Nieuwe offertebouwer (los van de oude finka_offers-sfeerpresentatie)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'concept' CHECK (status IN ('concept','verstuurd','akkoord')),
  plattegrond_url TEXT,
  render_urls JSONB DEFAULT '[]'::jsonb,
  standaard_afbeeldingen JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2) DEFAULT 0,
  subtotal_source TEXT NOT NULL DEFAULT 'auto' CHECK (subtotal_source IN ('in','auto','def')),
  korting_percentage NUMERIC(5,2) DEFAULT 0,
  korting_percentage_source TEXT NOT NULL DEFAULT 'def' CHECK (korting_percentage_source IN ('in','auto','def')),
  btw_percentage NUMERIC(5,2) DEFAULT 21,
  total_price NUMERIC(10,2) DEFAULT 0,
  total_price_source TEXT NOT NULL DEFAULT 'auto' CHECK (total_price_source IN ('in','auto','def')),
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finka_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES finka_quotes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'product' CHECK (type IN ('apparaat','product','dienst','maatwerk')),
  appliance_id UUID REFERENCES finka_appliances(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_price_source TEXT NOT NULL DEFAULT 'in' CHECK (unit_price_source IN ('in','auto','def')),
  line_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total_source TEXT NOT NULL DEFAULT 'auto' CHECK (line_total_source IN ('in','auto','def')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 4. Facturen (handmatig, MVP — klaar voor latere boekhoudkoppeling)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','betaald')),
  invoice_date DATE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 5. Klantportaal-moodboard (los van de offerte, zie plan)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_moodboard_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finka_moodboard_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES finka_moodboard_categories(id) ON DELETE CASCADE,
  image_url TEXT,
  name TEXT NOT NULL,
  price_indication TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finka_moodboard_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES finka_moodboard_categories(id) ON DELETE CASCADE,
  chosen_option_id UUID REFERENCES finka_moodboard_options(id) ON DELETE SET NULL,
  customer_comment TEXT,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 6. Klantportaal-toegang via token (geen klant-account/wachtwoord)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS finka_portal_tokens_token_idx ON finka_portal_tokens(token) WHERE revoked_at IS NULL;

-- =========================================================
-- 7. Audit trail (generiek, hergebruikt door alle nieuwe modules)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL CHECK (action IN ('create','update','archive')),
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finka_audit_log_record_idx ON finka_audit_log(table_name, record_id);

-- =========================================================
-- 8. Generieke import-route (Excel/CSV/Winner Flex/Compusoft)
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'excel' CHECK (source_type IN ('excel','winnerflex','compusoft')),
  original_filename TEXT,
  column_mapping JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','mapped','imported','failed')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 9. RLS — zelfde patroon als bestaande tabellen (elke ingelogde
--    interne gebruiker heeft volledige toegang; rollen komen in Fase 2)
-- =========================================================

ALTER TABLE finka_project_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_moodboard_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_moodboard_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_moodboard_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users only" ON finka_project_statuses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_moodboard_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_moodboard_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_moodboard_selections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_portal_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_import_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Portaalroutes gebruiken de service-role client server-side (bypassed RLS,
-- token wordt in de route zelf gevalideerd) — geen aparte "anon"-policy nodig
-- voor finka_moodboard_*/finka_quotes/finka_projects zolang de klant nooit
-- rechtstreeks met de anon-key bij deze tabellen kan komen.

-- =========================================================
-- 10. Expliciete table-grants (nodig omdat nieuwe tabellen via de SQL editor
--    soms niet automatisch de default privileges van het project overerven)
-- =========================================================

GRANT ALL ON TABLE
  finka_project_statuses,
  finka_projects,
  finka_quotes,
  finka_quote_items,
  finka_invoices,
  finka_moodboard_categories,
  finka_moodboard_options,
  finka_moodboard_selections,
  finka_portal_tokens,
  finka_audit_log,
  finka_import_jobs
TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON SEQUENCE finka_project_seq TO anon, authenticated, service_role;

-- =========================================================
-- 11. Storage-policy voor de 'offer-images' bucket (ontbrak kennelijk al
--    langer — treft zowel de oude conceptofferte als de nieuwe offertebouwer)
-- =========================================================

CREATE POLICY "Authenticated kunnen offer-images uploaden"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'offer-images');

CREATE POLICY "Authenticated kunnen offer-images bijwerken"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'offer-images');

CREATE POLICY "Authenticated kunnen offer-images verwijderen"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'offer-images');

-- =========================================================
-- 12. Winner Flex/Compusoft-uitdraai als bijlage + AI-samenvatting
--    van de belangrijkste keukenonderdelen op de offerte
-- =========================================================

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS technical_attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS kitchen_summary JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS kitchen_summary_source TEXT NOT NULL DEFAULT 'def' CHECK (kitchen_summary_source IN ('in','auto','def'));

-- =========================================================
-- 13. Strikte scheiding intern vs. klantversie op de offerte.
--    Interne regels/prijzen gaan NOOIT automatisch mee naar de klant —
--    alleen via een expliciete actie (zie include_in_customer_view) en
--    daarna losstaand bewerkbaar in customer_sections.
-- =========================================================

ALTER TABLE finka_quotes DROP COLUMN IF EXISTS kitchen_summary;
ALTER TABLE finka_quotes DROP COLUMN IF EXISTS kitchen_summary_source;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_sections JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_intro_text TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_closing_text TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_price NUMERIC(10,2);
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_price_source TEXT NOT NULL DEFAULT 'def' CHECK (customer_price_source IN ('in','auto','def'));

ALTER TABLE finka_quote_items ADD COLUMN IF NOT EXISTS include_in_customer_view BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_headline TEXT;

-- =========================================================
-- 14. Kostprijs-opbouw per categorie (Keukenkastjes/Apparatuur/Werkblad/
--    Accessoires/Inmeten/Opslag/Levering/Installatie/Service), gebaseerd
--    op het interne prijsindicatie-sjabloon. Keukenkastjes en Apparatuur
--    worden automatisch gevuld (Winner Flex-uitdraai resp. gekozen
--    apparatuur); de rest heeft Euroline-standaardtarieven als default,
--    alles blijft overschrijfbaar (IN/AUTO/DEF, zie cost_breakdown-items).
-- =========================================================

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS cost_breakdown JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS werkblad_attachments JSONB DEFAULT '[]'::jsonb;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_subtitle TEXT;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_document_label TEXT NOT NULL DEFAULT 'Prijsindicatie';

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_closing_quote TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_disclaimer_text TEXT;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_cost_lines JSONB DEFAULT '[]'::jsonb;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS connections_image_url TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_connections_intro TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_connections_disclaimer TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_connections JSONB DEFAULT '[]'::jsonb;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS apparatuur_attachments JSONB DEFAULT '[]'::jsonb;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS customer_closing_heading TEXT;

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS euroline_inputs JSONB DEFAULT '{}'::jsonb;

-- =========================================================
-- 15. Euroline-tarieven — los instelbaar (i.p.v. hardcoded in de code),
--    zodat een tariefwijziging op één plek wordt doorgerekend in alle
--    offertes. Eén-rij-tabel: er bestaat altijd precies één actieve set.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_euroline_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opslag_base NUMERIC NOT NULL DEFAULT 139.75,
  opslag_per_week_extra NUMERIC NOT NULL DEFAULT 23.75,
  levering_base NUMERIC NOT NULL DEFAULT 282.75,
  levering_groter_toeslag NUMERIC NOT NULL DEFAULT 124.75,
  levering_niet_begane_grond NUMERIC NOT NULL DEFAULT 120.25,
  levering_extra_lostijd_per_halfuur NUMERIC NOT NULL DEFAULT 64.50,
  levering_buiten_werkgebied NUMERIC NOT NULL DEFAULT 124.75,
  werkblad_multiplex NUMERIC NOT NULL DEFAULT 33.50,
  werkblad_composiet NUMERIC NOT NULL DEFAULT 77.50,
  installatie_per_m1 NUMERIC NOT NULL DEFAULT 207.50,
  installatie_buitengebied_per_m1 NUMERIC NOT NULL DEFAULT 250,
  service_tarief_per_uur NUMERIC NOT NULL DEFAULT 75,
  service_minimum NUMERIC NOT NULL DEFAULT 250,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO finka_euroline_rates (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM finka_euroline_rates);

ALTER TABLE finka_euroline_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_euroline_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_euroline_rates TO anon, authenticated, service_role;

-- =========================================================
-- 16. Werkblad-rekentool — richtprijzen voor eigen berekeningen (i.p.v.
--    wachten op een leveranciersofferte). Zelfde één-rij-patroon als
--    finka_euroline_rates: materialen/uitsparingen/diktetoeslag als JSONB
--    zodat de lijst vrij uitbreidbaar is, aanpasbaar via
--    Instellingen → Werkblad-prijzen. Voedt zowel de rekentool binnen een
--    offerte als de losstaande /gereedschap/werkblad-pagina.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_werkblad_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materials JSONB NOT NULL DEFAULT '[
    {"id": "composiet-cebin", "name": "Composiet – CEBIN (mat.+rand)", "price_per_m2": 320},
    {"id": "composiet-premium-cebin", "name": "Composiet Premium – CEBIN", "price_per_m2": 400},
    {"id": "composiet-pg4-gh", "name": "Composiet pg4 opgedikt – Werkbladen GH", "price_per_m2": 900},
    {"id": "keramiek-cebin", "name": "Keramiek – CEBIN", "price_per_m2": 480},
    {"id": "greengridz-cebin", "name": "Greengridz 25mm – CEBIN", "price_per_m2": 200},
    {"id": "quartzite-cebin", "name": "Quartzite 20mm – CEBIN", "price_per_m2": 700},
    {"id": "multiplex-cebin", "name": "Multiplex 38mm – CEBIN", "price_per_m2": 260},
    {"id": "rvs-20mm", "name": "RVS 20mm – RVSWerkblad", "price_per_m2": 600},
    {"id": "rvs-4mm", "name": "RVS 4mm massief – RVSWerkblad", "price_per_m2": 900},
    {"id": "unistone-luxstone", "name": "Composiet Unistone 2cm – Luxstone", "price_per_m2": 440},
    {"id": "dekton-luxstone", "name": "Dekton – Luxstone", "price_per_m2": 600},
    {"id": "kwartsiet-luxstone", "name": "Kwartsiet opgedikt 4cm – Luxstone", "price_per_m2": 850},
    {"id": "cosmostone-kemie", "name": "Composiet Cosmostone tg4 – KEMIE (netto)", "price_per_m2": 380},
    {"id": "dekton-kemie", "name": "Keramiek Dekton tg1 – KEMIE (netto)", "price_per_m2": 400},
    {"id": "ceramistone-kemie", "name": "Keramiek Ceramistone tg3 – KEMIE (netto)", "price_per_m2": 425},
    {"id": "corian-cebin", "name": "Corian / Solid surface – CEBIN", "price_per_m2": 1300}
  ]'::jsonb,
  cutouts JSONB NOT NULL DEFAULT '{"kookplaat": 120, "spoelbak": 260, "kraan": 32}'::jsonb,
  thicknesses JSONB NOT NULL DEFAULT '[
    {"mm": 4, "surcharge": 0}, {"mm": 12, "surcharge": 0}, {"mm": 20, "surcharge": 0},
    {"mm": 25, "surcharge": 0}, {"mm": 30, "surcharge": 0}, {"mm": 38, "surcharge": 0}
  ]'::jsonb,
  hoekverbinding NUMERIC NOT NULL DEFAULT 0,
  inmeten NUMERIC NOT NULL DEFAULT 0,
  montage NUMERIC NOT NULL DEFAULT 0,
  transport NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO finka_werkblad_rates (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM finka_werkblad_rates);

ALTER TABLE finka_werkblad_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_werkblad_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_werkblad_rates TO anon, authenticated, service_role;

-- Per-offerte bewaarde invoer voor de rekentool (delen + marge/btw-keuze),
-- zodat een concept-berekening niet verloren gaat bij het herladen van de offerte.
ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS werkblad_calc_inputs JSONB DEFAULT '{}'::jsonb;

-- =========================================================
-- 17. Planning — vaste mijlpalen per project (Meting, Bestelling,
--    Verwachte levering, Montage start, Oplevering). Voedt zowel de
--    Planning-tab op het project als de bedrijfsbrede tijdlijn op /planning.
--    Elk project krijgt automatisch dezelfde 5 (lege) mijlpalen, zodat de
--    tijdlijn overal dezelfde structuur heeft.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL CHECK (milestone_key IN ('meting', 'bestelling', 'levering', 'montage_start', 'oplevering')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  date DATE,
  status TEXT NOT NULL DEFAULT 'gepland' CHECK (status IN ('nog_doen', 'gepland', 'bevestigd', 'klaar')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, milestone_key)
);

CREATE OR REPLACE FUNCTION create_default_milestones()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO finka_project_milestones (project_id, milestone_key, sort_order)
  VALUES
    (NEW.id, 'meting', 0),
    (NEW.id, 'bestelling', 1),
    (NEW.id, 'levering', 2),
    (NEW.id, 'montage_start', 3),
    (NEW.id, 'oplevering', 4);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_default_milestones ON finka_projects;
CREATE TRIGGER set_default_milestones
  AFTER INSERT ON finka_projects
  FOR EACH ROW EXECUTE FUNCTION create_default_milestones();

-- Backfill: bestaande projecten (aangemaakt vóór deze migratie) krijgen
-- alsnog de 5 mijlpalen.
INSERT INTO finka_project_milestones (project_id, milestone_key, sort_order)
SELECT p.id, m.key, m.sort_order
FROM finka_projects p
CROSS JOIN (VALUES ('meting',0), ('bestelling',1), ('levering',2), ('montage_start',3), ('oplevering',4)) AS m(key, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM finka_project_milestones fm WHERE fm.project_id = p.id AND fm.milestone_key = m.key
);

ALTER TABLE finka_project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_project_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_project_milestones TO anon, authenticated, service_role;

-- =========================================================
-- 18. Planning — eigen items toevoegen naast de 5 vaste mijlpalen.
--    milestone_key krijgt een 6e toegestane waarde 'custom'; zo'n rij
--    heeft een eigen, vrij te typen label (kolom `label`). De unieke
--    combinatie geldt daarna alleen nog voor de vaste mijlpalen — een
--    project mag meerdere 'custom'-items hebben.
-- =========================================================

ALTER TABLE finka_project_milestones ADD COLUMN IF NOT EXISTS label TEXT;

ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_milestone_key_check;
ALTER TABLE finka_project_milestones ADD CONSTRAINT finka_project_milestones_milestone_key_check
  CHECK (milestone_key IN ('meting', 'bestelling', 'levering', 'montage_start', 'oplevering', 'custom'));

ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_project_id_milestone_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS finka_project_milestones_fixed_unique
  ON finka_project_milestones (project_id, milestone_key)
  WHERE milestone_key <> 'custom';

-- =========================================================
-- 19. Planning — 3 extra vaste mijlpalen vóór de bestaande 5: Kennismaking,
--    Bespreken eerste offerte, Bespreken finale offerte. Sort_order van alle
--    vaste mijlpalen wordt herzet zodat de volgorde ook in al bestaande
--    projecten klopt.
-- =========================================================

ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_milestone_key_check;
ALTER TABLE finka_project_milestones ADD CONSTRAINT finka_project_milestones_milestone_key_check
  CHECK (milestone_key IN (
    'kennismaking', 'meting', 'bespreken_eerste_offerte', 'bespreken_finale_offerte',
    'bestelling', 'levering', 'montage_start', 'oplevering', 'custom'
  ));

UPDATE finka_project_milestones SET sort_order = 1 WHERE milestone_key = 'meting';
UPDATE finka_project_milestones SET sort_order = 4 WHERE milestone_key = 'bestelling';
UPDATE finka_project_milestones SET sort_order = 5 WHERE milestone_key = 'levering';
UPDATE finka_project_milestones SET sort_order = 6 WHERE milestone_key = 'montage_start';
UPDATE finka_project_milestones SET sort_order = 7 WHERE milestone_key = 'oplevering';

-- Nieuwe projecten krijgen voortaan meteen alle 8 vaste mijlpalen.
CREATE OR REPLACE FUNCTION create_default_milestones()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO finka_project_milestones (project_id, milestone_key, sort_order)
  VALUES
    (NEW.id, 'kennismaking', 0),
    (NEW.id, 'meting', 1),
    (NEW.id, 'bespreken_eerste_offerte', 2),
    (NEW.id, 'bespreken_finale_offerte', 3),
    (NEW.id, 'bestelling', 4),
    (NEW.id, 'levering', 5),
    (NEW.id, 'montage_start', 6),
    (NEW.id, 'oplevering', 7);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: bestaande projecten krijgen de 3 nieuwe mijlpalen erbij.
INSERT INTO finka_project_milestones (project_id, milestone_key, sort_order)
SELECT p.id, m.key, m.sort_order
FROM finka_projects p
CROSS JOIN (VALUES
  ('kennismaking', 0),
  ('bespreken_eerste_offerte', 2),
  ('bespreken_finale_offerte', 3)
) AS m(key, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM finka_project_milestones fm WHERE fm.project_id = p.id AND fm.milestone_key = m.key
);

-- =========================================================
-- 20. Projectnotities — vrije aantekeningen per project, los van de
--    offerte/klantversie en los van de audit-historie. Nieuwste bovenaan.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_project_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_project_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_project_notes TO anon, authenticated, service_role;

-- =========================================================
-- 21. Apparatuur-bibliotheek uitgebreid met 'kraan' en 'spoelbak' — voedt
--    de nieuwe "Accessoires"-categorie in de klantversie van de offerte
--    (naast Kasten/Werkblad/Apparatuur/Overig).
-- =========================================================

ALTER TABLE finka_appliances DROP CONSTRAINT IF EXISTS finka_appliances_type_check;
ALTER TABLE finka_appliances ADD CONSTRAINT finka_appliances_type_check
  CHECK (type IN ('kookplaat','oven','vaatwasser','afzuigkap','koelkast','koelvries','combi-oven','kokendwaterkraan','kraan','spoelbak','anders'));

-- =========================================================
-- 22. Euroline-tarieven uitgebreid met verhuislift — optionele toeslag bij
--    levering (zelfde patroon als "niet begane grond").
-- =========================================================

ALTER TABLE finka_euroline_rates ADD COLUMN IF NOT EXISTS levering_verhuislift DECIMAL(10,2) NOT NULL DEFAULT 250;

-- =========================================================
-- 23. Per-pagina disclaimer-tekst in de klantversie — los instelbaar per
--    paginatype (voorpagina/toelichting/wat_zit_erin/kosten/ontwerp/vervolg/
--    afsluiting), naast de al bestaande losse velden voor de prijs- en
--    aansluitingenpagina.
-- =========================================================

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS page_disclaimers JSONB DEFAULT '{}'::jsonb;

-- =========================================================
-- 24. Aansluitschema — checklistregels (leidingwerk/elektra) per project,
--    te overhandigen aan de installateur. Elk project start met een vaste
--    standaardlijst (zie DEFAULT_CONNECTION_ITEMS in src/lib/aansluitschema.ts,
--    die de rijen bij eerste bezoek van het tabblad client-side seedt — geen
--    DB-trigger nodig, in tegenstelling tot de mijlpalen, omdat staff de
--    seed-lijst incidenteel kan willen aanpassen zonder een migratie).
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_connection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('water_afvoer', 'elektra', 'overig')),
  standard_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  omschrijving TEXT NOT NULL DEFAULT '',
  van_toepassing BOOLEAN NOT NULL DEFAULT false,
  aantal TEXT,
  hoogte_cm TEXT,
  positie_toelichting TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_connection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_connection_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_connection_items TO anon, authenticated, service_role;

-- =========================================================
-- 25. Aansluitschema — documentmetadata, vrije tekstblokken en de visuele
--    vooraanzicht-tekening (kastenrij + aansluitpunten) als JSONB. Eén rij
--    per project (singleton), zelfde patroon als de JSONB-lijsten die de
--    offerte-module al gebruikt (Quote.technical_attachments e.d.) — cabinets
--    en pins horen altijd bij dit ene document en hebben geen losse query's
--    elders nodig.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_connection_schema (
  project_id UUID PRIMARY KEY REFERENCES finka_projects(id) ON DELETE CASCADE,
  klant_referentie TEXT,
  adres TEXT,
  opsteller TEXT,
  behorend_bij_tekening TEXT,
  versie INTEGER NOT NULL DEFAULT 1,
  groepenverdeling_tekst TEXT,
  extra_secties JSONB NOT NULL DEFAULT '[]'::jsonb,
  let_op_notities TEXT,
  wand_hoogte_mm INTEGER NOT NULL DEFAULT 2700,
  plint_hoogte_mm INTEGER NOT NULL DEFAULT 150,
  cabinets JSONB NOT NULL DEFAULT '[]'::jsonb,
  pins JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_connection_schema ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_connection_schema FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_connection_schema TO anon, authenticated, service_role;

-- =========================================================
-- 26. Vooraanzicht-upload bij de offerte — los van de bestaande "Plattegrond"
--    (dat is een aanzicht van bovenaf en dus ongeschikt als bron voor het
--    aansluitschema, dat een vooraanzicht van de kastenwand met
--    kastbreedtes/artikelcodes nodig heeft om posities uit af te lezen).
-- =========================================================

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS vooraanzicht_url TEXT;

-- =========================================================
-- 27. Meerdere vooraanzichten per offerte (bv. hoofdwand + kookeiland van 2
--    kanten) i.p.v. één losse vooraanzicht_url. En: het aansluitschema krijgt
--    meerdere "wanden" — elk met een eigen kastenrij + aansluitpunten,
--    gekoppeld aan één van deze vooraanzicht-afbeeldingen — i.p.v. één vaste
--    kastenrij per project.
-- =========================================================

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS vooraanzicht_urls JSONB DEFAULT '[]'::jsonb;
UPDATE finka_quotes SET vooraanzicht_urls = jsonb_build_array(vooraanzicht_url)
  WHERE vooraanzicht_url IS NOT NULL AND (vooraanzicht_urls IS NULL OR vooraanzicht_urls = '[]'::jsonb);
ALTER TABLE finka_quotes DROP COLUMN IF EXISTS vooraanzicht_url;

ALTER TABLE finka_connection_schema ADD COLUMN IF NOT EXISTS wanden JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE finka_connection_schema SET wanden = jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(),
    'label', 'Hoofdwand',
    'bron_afbeelding_url', NULL,
    'wand_hoogte_mm', wand_hoogte_mm,
    'plint_hoogte_mm', plint_hoogte_mm,
    'cabinets', cabinets,
    'pins', pins
  ))
  WHERE wanden = '[]'::jsonb AND (jsonb_array_length(cabinets) > 0 OR jsonb_array_length(pins) > 0);
ALTER TABLE finka_connection_schema DROP COLUMN IF EXISTS wand_hoogte_mm;
ALTER TABLE finka_connection_schema DROP COLUMN IF EXISTS plint_hoogte_mm;
ALTER TABLE finka_connection_schema DROP COLUMN IF EXISTS cabinets;
ALTER TABLE finka_connection_schema DROP COLUMN IF EXISTS pins;

-- =========================================================
-- 28. Downloadgeschiedenis van de klant-offerte-PDF — elke keer dat iemand
--    op "Download PDF" klikt (src/app/api/offerte/[projectId]/pdf/route.ts)
--    komt hier een rij bij. snapshot bewaart zowel de klant-zichtbare velden
--    van dat moment (zelfde selectie als wat er daadwerkelijk op de PDF
--    staat) als de interne kostprijs-opbouw (cost_breakdown + de losse
--    regels uit finka_quote_items + de interne totalen), zodat een volgende
--    download daartegen kan diffen (zie src/lib/quote-download-diff.ts) —
--    changes bevat die leesbare diff al kant-en-klaar, zodat de UI niet
--    elke keer opnieuw hoeft te vergelijken.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_quote_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES finka_quotes(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  downloaded_by TEXT,
  snapshot JSONB NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS finka_quote_downloads_quote_id_idx ON finka_quote_downloads (quote_id, downloaded_at DESC);

ALTER TABLE finka_quote_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_quote_downloads FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_quote_downloads TO anon, authenticated, service_role;

-- =========================================================
-- 29. Planning — extra mijlpaal-status 'nog_doen' vóór 'gepland', voor items
--    die nog niet eens ingepland zijn (puur een to-do, nog geen datum/plan).
-- =========================================================

ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_status_check;
ALTER TABLE finka_project_milestones ADD CONSTRAINT finka_project_milestones_status_check
  CHECK (status IN ('nog_doen', 'gepland', 'bevestigd', 'klaar'));

-- =========================================================
-- 30. Planning — mijlpaal toewijzen aan Kieke of Merel, en status/notities
--    ook rechtstreeks bewerkbaar maken vanuit het bedrijfsbrede overzicht
--    (/planning), niet alleen via de Planning-tab van een los project.
-- =========================================================

ALTER TABLE finka_project_milestones ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_assigned_to_check;
ALTER TABLE finka_project_milestones ADD CONSTRAINT finka_project_milestones_assigned_to_check
  CHECK (assigned_to IS NULL OR assigned_to IN ('Kieke', 'Merel', 'Leverancier'));

-- =========================================================
-- 31. Planning — algemene taken die aan geen enkel project hangen (bv.
--    interne to-do's). project_id mag nu NULL zijn; NULL = algemene taak.
--    Verschijnt in een eigen sectie op /planning, los van de projectenlijst.
-- =========================================================

ALTER TABLE finka_project_milestones ALTER COLUMN project_id DROP NOT NULL;

-- =========================================================
-- 32. Planning — extra mijlpaal-status 'bezig' ("Ermee bezig"), tussen
--    Bevestigd en Klaar.
-- =========================================================

ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_status_check;
ALTER TABLE finka_project_milestones ADD CONSTRAINT finka_project_milestones_status_check
  CHECK (status IN ('nog_doen', 'gepland', 'bevestigd', 'bezig', 'klaar'));

-- =========================================================
-- 33. Planning — extra toewijs-optie 'FINKA' (naast Kieke/Merel/Leverancier).
-- =========================================================

ALTER TABLE finka_project_milestones DROP CONSTRAINT IF EXISTS finka_project_milestones_assigned_to_check;
ALTER TABLE finka_project_milestones ADD CONSTRAINT finka_project_milestones_assigned_to_check
  CHECK (assigned_to IS NULL OR assigned_to IN ('Kieke', 'Merel', 'Leverancier', 'FINKA'));

-- =========================================================
-- 34. Apparatuur-type-constraint volledig gelijkgetrokken met ApplianceType
--    in de code — 'kokendwaterkraan' bleek live te ontbreken (ondanks dat
--    'ie in migratie #1 stond), en 'magnetron'/'vriezer'/'wijnklimaatkast'
--    waren nooit toegevoegd sinds ze in de app werden geïntroduceerd.
-- =========================================================

ALTER TABLE finka_appliances DROP CONSTRAINT IF EXISTS finka_appliances_type_check;
ALTER TABLE finka_appliances ADD CONSTRAINT finka_appliances_type_check
  CHECK (type IN (
    'kookplaat','oven','combi-oven','magnetron','vaatwasser','afzuigkap',
    'koelkast','koelvries','vriezer','wijnklimaatkast','kokendwaterkraan',
    'kraan','spoelbak','anders'
  ));

-- =========================================================
-- 35. Configurator-tabblad — per onderdeel (Kasten/Apparatuur/Werkblad/
--    Opslag-levering-montage) meerdere vergelijkbare "opties" kunnen
--    invullen, en die combineren tot één of meerdere "kostenoverzichten"
--    (elk: precies één gekozen optie per onderdeel). De section-constraint
--    bevat meteen alle 4 waarden, ook al krijgt in fase 1 alleen 'kasten'
--    een editor — voorkomt dat de constraint later los bijgewerkt moet
--    worden per fase.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_configurator_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES finka_quotes(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('kasten', 'apparatuur', 'werkblad', 'opslag')),
  name TEXT NOT NULL DEFAULT 'Optie 1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finka_configurator_options_quote ON finka_configurator_options(quote_id);

CREATE TABLE IF NOT EXISTS finka_configurator_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES finka_quotes(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Kostenoverzicht 1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  kasten_option_id UUID REFERENCES finka_configurator_options(id) ON DELETE SET NULL,
  apparatuur_option_id UUID REFERENCES finka_configurator_options(id) ON DELETE SET NULL,
  werkblad_option_id UUID REFERENCES finka_configurator_options(id) ON DELETE SET NULL,
  opslag_option_id UUID REFERENCES finka_configurator_options(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finka_configurator_scenarios_quote ON finka_configurator_scenarios(quote_id);

ALTER TABLE finka_configurator_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_configurator_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users only" ON finka_configurator_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_configurator_scenarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_configurator_options TO anon, authenticated, service_role;
GRANT ALL ON TABLE finka_configurator_scenarios TO anon, authenticated, service_role;

-- =========================================================
-- 36. Checklist-tabblad — voortgangschecklist per project (verkoop t/m
--    afronding). Elk project krijgt automatisch de vaste standaardpunten
--    (zie de trigger hieronder), staff kan daarnaast losse eigen punten
--    toevoegen. item_key is bewust vrije tekst zonder CHECK-constraint
--    (zelfde aanpak als finka_connection_items.standard_key) — voorkomt dat
--    de constraint uit de pas loopt zodra er een standaardpunt bijkomt.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  item_key TEXT,
  category TEXT NOT NULL,
  label TEXT,
  checked BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finka_checklist_items_fixed_unique
  ON finka_checklist_items (project_id, item_key)
  WHERE item_key IS NOT NULL;

CREATE OR REPLACE FUNCTION create_default_checklist_items()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO finka_checklist_items (project_id, item_key, category, sort_order)
  VALUES
    (NEW.id, 'wensen_genoteerd', 'verkoop', 0),
    (NEW.id, 'eerste_offerte_verstuurd', 'verkoop', 1),
    (NEW.id, 'finale_offerte_akkoord', 'verkoop', 2),
    (NEW.id, 'aanbetaling_ontvangen', 'verkoop', 3),
    (NEW.id, 'keuken_ingemeten', 'ontwerp_meten', 4),
    (NEW.id, 'tekening_goedgekeurd', 'ontwerp_meten', 5),
    (NEW.id, 'apparatuur_gekozen', 'ontwerp_meten', 6),
    (NEW.id, 'werkblad_gekozen', 'ontwerp_meten', 7),
    (NEW.id, 'kasten_besteld', 'bestellen', 8),
    (NEW.id, 'apparatuur_besteld', 'bestellen', 9),
    (NEW.id, 'werkblad_besteld', 'bestellen', 10),
    (NEW.id, 'accessoires_besteld', 'bestellen', 11),
    (NEW.id, 'aansluitschema_gedeeld', 'bestellen', 12),
    (NEW.id, 'levering_ingepland', 'levering_montage', 13),
    (NEW.id, 'keuken_geleverd', 'levering_montage', 14),
    (NEW.id, 'montage_ingepland', 'levering_montage', 15),
    (NEW.id, 'montage_afgerond', 'levering_montage', 16),
    (NEW.id, 'eindcontrole', 'levering_montage', 17),
    (NEW.id, 'restbetaling_ontvangen', 'afronding', 18),
    (NEW.id, 'garantiepapieren', 'afronding', 19);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_default_checklist_items ON finka_projects;
CREATE TRIGGER set_default_checklist_items
  AFTER INSERT ON finka_projects
  FOR EACH ROW EXECUTE FUNCTION create_default_checklist_items();

-- Backfill: bestaande projecten (aangemaakt vóór deze migratie) krijgen
-- alsnog alle standaardpunten.
INSERT INTO finka_checklist_items (project_id, item_key, category, sort_order)
SELECT p.id, m.key, m.category, m.sort_order
FROM finka_projects p
CROSS JOIN (VALUES
  ('wensen_genoteerd', 'verkoop', 0),
  ('eerste_offerte_verstuurd', 'verkoop', 1),
  ('finale_offerte_akkoord', 'verkoop', 2),
  ('aanbetaling_ontvangen', 'verkoop', 3),
  ('keuken_ingemeten', 'ontwerp_meten', 4),
  ('tekening_goedgekeurd', 'ontwerp_meten', 5),
  ('apparatuur_gekozen', 'ontwerp_meten', 6),
  ('werkblad_gekozen', 'ontwerp_meten', 7),
  ('kasten_besteld', 'bestellen', 8),
  ('apparatuur_besteld', 'bestellen', 9),
  ('werkblad_besteld', 'bestellen', 10),
  ('accessoires_besteld', 'bestellen', 11),
  ('aansluitschema_gedeeld', 'bestellen', 12),
  ('levering_ingepland', 'levering_montage', 13),
  ('keuken_geleverd', 'levering_montage', 14),
  ('montage_ingepland', 'levering_montage', 15),
  ('montage_afgerond', 'levering_montage', 16),
  ('eindcontrole', 'levering_montage', 17),
  ('restbetaling_ontvangen', 'afronding', 18),
  ('garantiepapieren', 'afronding', 19)
) AS m(key, category, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM finka_checklist_items ci WHERE ci.project_id = p.id AND ci.item_key = m.key
);

ALTER TABLE finka_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_checklist_items TO anon, authenticated, service_role;

-- =========================================================
-- 37. Financieel-pagina — moment van accorderen bijhouden per offerte, zodat
--    omzet per maand/jaar te rapporteren is (zie /financieel). Wordt vanaf nu
--    automatisch gezet door QuoteEditor zodra de status voor het eerst op
--    'akkoord' komt te staan. Bestaande al-geaccordeerde offertes krijgen als
--    beste schatting hun updated_at-moment mee.
-- =========================================================

ALTER TABLE finka_quotes ADD COLUMN IF NOT EXISTS akkoord_at TIMESTAMPTZ;

UPDATE finka_quotes SET akkoord_at = updated_at
WHERE status = 'akkoord' AND akkoord_at IS NULL;

-- =========================================================
-- 38. Financieel-tabblad per project — begroot vs. werkelijk per kosten-
--    categorie (Kasten, Apparatuur, Werkblad, ...). begroot_bedrag wordt
--    automatisch vastgelegd (snapshot van cost_breakdown) zodra een offerte
--    voor het eerst op 'akkoord' komt te staan, zie QuoteEditor's
--    handleSave. category is bewust vrije tekst zonder CHECK-constraint
--    (zelfde aanpak als bij Checklist) i.p.v. gekoppeld aan CostCategoryKey.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_project_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  begroot_bedrag NUMERIC(10,2) NOT NULL DEFAULT 0,
  werkelijk_bedrag NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, category)
);

ALTER TABLE finka_project_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_project_financials FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE finka_project_financials TO anon, authenticated, service_role;

-- Backfill: offertes die al vóór deze migratie op 'akkoord' stonden, halen
-- de "eerste keer akkoord"-snapshot in de app nooit (die triggert alleen op
-- de overgang náár 'akkoord'). Vult 'm hier één keer met de huidige
-- cost_breakdown-inhoud van die offertes.
INSERT INTO finka_project_financials (project_id, category, begroot_bedrag)
SELECT q.project_id, row->>'key', COALESCE((row->>'werkelijke_kosten')::numeric, 0)
FROM finka_quotes q
CROSS JOIN LATERAL jsonb_array_elements(q.cost_breakdown) AS row
WHERE q.status = 'akkoord' AND q.archived_at IS NULL
ON CONFLICT (project_id, category) DO NOTHING;

-- =========================================================
-- 39. Financieel-tabblad — ook de marge% van het moment van accorderen
--    vastleggen, niet alleen het kostenbedrag. Samen bepalen ze de vaste
--    "prijs klant" per categorie (begroot_bedrag * (1 + marge_percentage/100)),
--    waarmee de werkelijke bruto marge (prijs klant - werkelijke kosten)
--    te berekenen is zodra staff de werkelijke kosten invult.
-- =========================================================

ALTER TABLE finka_project_financials ADD COLUMN IF NOT EXISTS marge_percentage NUMERIC(6,2) NOT NULL DEFAULT 0;

UPDATE finka_project_financials pf
SET marge_percentage = sub.marge_percentage
FROM (
  SELECT q.project_id, row->>'key' AS category, COALESCE((row->>'marge_percentage')::numeric, 0) AS marge_percentage
  FROM finka_quotes q
  CROSS JOIN LATERAL jsonb_array_elements(q.cost_breakdown) AS row
  WHERE q.status = 'akkoord' AND q.archived_at IS NULL
) sub
WHERE pf.project_id = sub.project_id AND pf.category = sub.category;

-- =========================================================
-- 40. Financieel-tabblad — werkelijke kosten staan standaard al gelijk aan
--    begroot (staff hoeft dus niet blind te typen, alleen te corrigeren),
--    en een "betaald"-vinkje geeft aan of dat bedrag écht bevestigd is —
--    pas dan telt het mee als werkelijke kosten in de marge-berekening
--    i.p.v. als nog-onbevestigde standaardwaarde.
-- =========================================================

ALTER TABLE finka_project_financials ADD COLUMN IF NOT EXISTS betaald BOOLEAN NOT NULL DEFAULT false;

UPDATE finka_project_financials SET werkelijk_bedrag = begroot_bedrag WHERE werkelijk_bedrag IS NULL;

-- =========================================================
-- 41. Winst- en verliesrekening (/financieel) — bedrijfskosten die niet aan
--    één project hangen (huur, personeel, ...), en één instellingenrij met
--    het belastingpercentage om door te rekenen naar nettowinst.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_operating_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  label TEXT,
  bedrag NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_operating_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_operating_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_operating_expenses TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS finka_financial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belasting_percentage NUMERIC(5,2) NOT NULL DEFAULT 21,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Precies één instellingenrij (singleton).
INSERT INTO finka_financial_settings (belasting_percentage)
SELECT 21
WHERE NOT EXISTS (SELECT 1 FROM finka_financial_settings);

ALTER TABLE finka_financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_financial_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_financial_settings TO anon, authenticated, service_role;

-- =========================================================
-- 42. Bedrijfskosten — voorgeschoten kosten bijhouden: wie het betaald
--    heeft, of het al in Moneybird staat, en of het verrekend is met
--    diegene. Zelfde mensen-lijst als Planning (Kieke/Merel/Leverancier/
--    FINKA), geen nieuwe CHECK-constraint nodig.
-- =========================================================

ALTER TABLE finka_operating_expenses ADD COLUMN IF NOT EXISTS betaald_door TEXT;
ALTER TABLE finka_operating_expenses ADD COLUMN IF NOT EXISTS ingeboekt_moneybird BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE finka_operating_expenses ADD COLUMN IF NOT EXISTS verrekend BOOLEAN NOT NULL DEFAULT false;

-- =========================================================
-- 43. Kosten-pagina — losse tabel voor vaste activa (laptops, inventaris,
--    ...), naast de bedrijfskosten-tabel. Zelfde velden als
--    finka_operating_expenses, maar bewust gescheiden: activa horen niet
--    als kosten in de winst-en-verliesrekening (die telt alleen
--    finka_operating_expenses mee).
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date DATE NOT NULL,
  category TEXT NOT NULL,
  label TEXT,
  bedrag NUMERIC(10,2) NOT NULL DEFAULT 0,
  betaald_door TEXT,
  ingeboekt_moneybird BOOLEAN NOT NULL DEFAULT false,
  verrekend BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_assets TO anon, authenticated, service_role;

-- =========================================================
-- 44. Checklist-instellingen (/instellingen/checklist) — het standaard-
--    lijstje is niet langer hardcoded in een trigger, maar aanpasbare data.
--    Nieuwe projecten krijgen niet langer automatisch een checklist: die
--    wordt bewust aangemaakt via een knop op het Checklist-tabblad, die op
--    dat moment een kopie maakt van deze instellingen. Latere wijzigingen
--    aan de instellingen werken dus niet met terugwerkende kracht door op
--    al aangemaakte project-checklists.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_checklist_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_checklist_templates TO anon, authenticated, service_role;

-- Eenmalig gevuld met de huidige standaardlijst als startpunt, zodat
-- bestaand gedrag behouden blijft totdat staff het aanpast.
INSERT INTO finka_checklist_templates (category, label, sort_order)
SELECT * FROM (VALUES
  ('verkoop', 'Wensen en eisen genoteerd', 0),
  ('verkoop', 'Eerste offerte verstuurd', 1),
  ('verkoop', 'Finale offerte akkoord', 2),
  ('verkoop', 'Aanbetaling ontvangen', 3),
  ('ontwerp_meten', 'Keuken ingemeten', 4),
  ('ontwerp_meten', 'Tekening/ontwerp goedgekeurd door klant', 5),
  ('ontwerp_meten', 'Apparatuur definitief gekozen', 6),
  ('ontwerp_meten', 'Werkblad definitief gekozen', 7),
  ('bestellen', 'Kasten besteld', 8),
  ('bestellen', 'Apparatuur besteld', 9),
  ('bestellen', 'Werkblad besteld', 10),
  ('bestellen', 'Accessoires besteld', 11),
  ('bestellen', 'Aansluitschema gedeeld met klant/installateur', 12),
  ('levering_montage', 'Levering ingepland', 13),
  ('levering_montage', 'Keuken geleverd (zonder schade)', 14),
  ('levering_montage', 'Montage ingepland', 15),
  ('levering_montage', 'Montage afgerond', 16),
  ('levering_montage', 'Eindcontrole met klant', 17),
  ('afronding', 'Restbetaling ontvangen', 18),
  ('afronding', 'Garantiepapieren overhandigd', 19)
) AS defaults(category, label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM finka_checklist_templates);

-- Nieuwe projecten krijgen niet langer automatisch een checklist — die
-- ontstaat nu bewust via de "Checklist aanmaken"-knop op het tabblad.
DROP TRIGGER IF EXISTS set_default_checklist_items ON finka_projects;
DROP FUNCTION IF EXISTS create_default_checklist_items();

-- =========================================================
-- 45. Checklist-instellingen — ook de kopjes (categorieën) zelf aanpasbaar
--    maken (hernoemen/toevoegen/verwijderen), niet alleen de items erbinnen.
--    finka_checklist_templates verwijst voortaan naar een categorie via
--    category_id i.p.v. losse tekst, zodat een naamswijziging overal in
--    één keer doorwerkt. Per-project finka_checklist_items blijft ongemoeid:
--    category is daar bewust nog steeds losse tekst — een kopie/snapshot
--    van het label op het moment van "Checklist aanmaken", zodat een
--    kopje hernoemen/verwijderen geen al aangemaakte project-checklists
--    raakt.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_checklist_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_checklist_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_checklist_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_checklist_categories TO anon, authenticated, service_role;

INSERT INTO finka_checklist_categories (label, sort_order)
SELECT * FROM (VALUES
  ('Verkoop', 0),
  ('Ontwerp & meten', 1),
  ('Bestellen', 2),
  ('Levering & montage', 3),
  ('Afronding', 4)
) AS defaults(label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM finka_checklist_categories);

ALTER TABLE finka_checklist_templates ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES finka_checklist_categories(id) ON DELETE CASCADE;

UPDATE finka_checklist_templates t
SET category_id = c.id
FROM finka_checklist_categories c
WHERE t.category_id IS NULL
  AND c.label = CASE t.category
    WHEN 'verkoop' THEN 'Verkoop'
    WHEN 'ontwerp_meten' THEN 'Ontwerp & meten'
    WHEN 'bestellen' THEN 'Bestellen'
    WHEN 'levering_montage' THEN 'Levering & montage'
    WHEN 'afronding' THEN 'Afronding'
    ELSE t.category
  END;

ALTER TABLE finka_checklist_templates ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE finka_checklist_templates DROP COLUMN category;

-- =========================================================
-- 46. Klantportaal — fundament (login, alleen-lezen planning + status).
--    Klant-accounts leven in dezelfde Supabase Auth-pool als staff, maar
--    het klantportaal praat nooit rechtstreeks (met de open "authenticated"
--    RLS die dit hele project gebruikt) met de tabellen — elke
--    portaalpagina/actie loopt server-side via de service-role client en
--    controleert zelf of het opgevraagde project bij de ingelogde klant
--    hoort (zelfde aanpak als de bestaande finka_portal_tokens-routes:
--    "token wordt in de route zelf gevalideerd", nu met een sessie i.p.v.
--    een token). finka_staff_users is de expliciete allowlist voor het
--    interne dashboard — zonder deze tabel zou een ingelogde klant zomaar
--    bij /klanten, /financieel etc. kunnen komen, want de RLS-policies in
--    dit hele project staan overal open voor "authenticated".
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_staff_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_staff_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_staff_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_staff_users TO anon, authenticated, service_role;

-- Backfill: alle bestaande auth-accounts zijn op dit moment staff (er
-- bestaan nog geen klant-accounts). Nieuwe accounts na deze migratie
-- (klant-uitnodigingen) komen hier NIET automatisch bij te staan.
INSERT INTO finka_staff_users (id, email)
SELECT id, email FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM finka_staff_users s WHERE s.id = auth.users.id);

ALTER TABLE finka_customers ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finka_customers_auth_user_id_idx ON finka_customers(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- =========================================================
-- 47. Klantportaal — per checklist-item aan/uit kunnen zetten of het
--    zichtbaar is voor de klant (bv. interne stappen als "Kasten betaald"
--    hoeven klanten niet te zien). Staat op de sjabloon (het standaard-
--    lijstje uit /instellingen/checklist, als startwaarde voor nieuwe
--    project-checklists) én los per project-item (voor uitzonderingen),
--    zelfde snapshot-principe als label/category.
-- =========================================================

ALTER TABLE finka_checklist_templates ADD COLUMN IF NOT EXISTS visible_to_customer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE finka_checklist_items ADD COLUMN IF NOT EXISTS visible_to_customer BOOLEAN NOT NULL DEFAULT true;

-- =========================================================
-- 48. Klantportaal — omgekeerde standaard: nieuwe checklist-items staan nu
--    standaard verborgen voor de klant (opt-in per item via de oog-knop),
--    i.p.v. standaard zichtbaar (opt-out). Bestaande items worden hierop
--    ook teruggezet, zodat staff bewust per item aanzet wat een klant mag
--    zien i.p.v. dat er per ongeluk al iets zichtbaar staat.
-- =========================================================

ALTER TABLE finka_checklist_templates ALTER COLUMN visible_to_customer SET DEFAULT false;
ALTER TABLE finka_checklist_items ALTER COLUMN visible_to_customer SET DEFAULT false;

UPDATE finka_checklist_templates SET visible_to_customer = false;
UPDATE finka_checklist_items SET visible_to_customer = false;

-- =========================================================
-- 49. Klantportaal — vragenlijst. Anders dan de checklist is dit bewust
--    GEEN snapshot-per-project: finka_questionnaire_responses verwijst
--    rechtstreeks naar het sjabloon-item (question_id), zodat een nieuwe
--    vraag die staff later toevoegt meteen voor alle projecten verschijnt —
--    logisch voor een intakeformulier (je wil alsnog een antwoord), anders
--    dan de checklist (die juist een vaste momentopname van toen moet
--    blijven). Antwoorden komen alleen via een API-route binnen
--    (/api/portaal/antwoord) die valideert dat het project bij de
--    ingelogde klant hoort — nooit rechtstreeks vanuit de klant-browser.
-- =========================================================

CREATE TABLE IF NOT EXISTS finka_questionnaire_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'tekst' CHECK (type IN ('tekst','lange_tekst')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_questionnaire_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_questionnaire_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_questionnaire_templates TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS finka_questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES finka_projects(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES finka_questionnaire_templates(id) ON DELETE CASCADE,
  answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, question_id)
);

ALTER TABLE finka_questionnaire_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_questionnaire_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_questionnaire_responses TO anon, authenticated, service_role;

-- =========================================================
-- 50. Vragenlijst — multi-select vraagtype (met eigen, per vraag instelbare
--    opties) + kopjes (categorieën, zelfde patroon als de checklist) om de
--    langere vragenlijst overzichtelijk te houden. finka_questionnaire_
--    responses.answer blijft bewust TEXT: bij multi_select staat daar een
--    JSON-array (bv. '["Oven","Vriezer"]') in, zodat er geen aparte kolom
--    per vraagtype nodig is. Meteen ook de eerste echte inhoud (aangeleverd
--    door de gebruiker) i.p.v. het testvraagje van hiervoor.
-- =========================================================

DELETE FROM finka_questionnaire_templates WHERE question = 'test vraag lavala';

ALTER TABLE finka_questionnaire_templates DROP CONSTRAINT IF EXISTS finka_questionnaire_templates_type_check;
ALTER TABLE finka_questionnaire_templates ADD CONSTRAINT finka_questionnaire_templates_type_check CHECK (type IN ('tekst','lange_tekst','multi_select'));
ALTER TABLE finka_questionnaire_templates ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS finka_questionnaire_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finka_questionnaire_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users only" ON finka_questionnaire_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE finka_questionnaire_categories TO anon, authenticated, service_role;

ALTER TABLE finka_questionnaire_templates ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES finka_questionnaire_categories(id) ON DELETE CASCADE;

INSERT INTO finka_questionnaire_categories (label, sort_order) VALUES
  ('Afmetingen van de ruimte', 0),
  ('Positie van aansluitingen', 1),
  ('Wensen en voorkeuren', 2),
  ('Indeling en functionaliteit', 3),
  ('Budget', 4),
  ('Eventuele extra''s', 5),
  ('Inspiratievoorbeelden', 6),
  ('Praktische informatie', 7),
  ('Overige opmerkingen', 8);

INSERT INTO finka_questionnaire_templates (category_id, question, type, options, sort_order)
SELECT c.id, q.question, q.type, to_jsonb(q.options), q.sort_order
FROM (VALUES
  ('Afmetingen van de ruimte', 'Plattegrond met exacte maten van de keuken (lengte, breedte, hoogte)', 'lange_tekst', ARRAY[]::text[], 0),
  ('Afmetingen van de ruimte', 'Locatie en afmetingen van ramen, deuren, en eventuele schuine wanden of plafonds', 'lange_tekst', ARRAY[]::text[], 1),
  ('Afmetingen van de ruimte', 'Hoogte van het plafond en eventuele balken of obstakels', 'lange_tekst', ARRAY[]::text[], 2),

  ('Positie van aansluitingen', 'Locatie van water- en afvoeraansluitingen', 'lange_tekst', ARRAY[]::text[], 0),
  ('Positie van aansluitingen', 'Plaats van stopcontacten en elektriciteitspunten', 'lange_tekst', ARRAY[]::text[], 1),
  ('Positie van aansluitingen', 'Eventuele ventilatie- of afzuigkanalen', 'lange_tekst', ARRAY[]::text[], 2),

  ('Wensen en voorkeuren', 'Gewenste stijl', 'lange_tekst', ARRAY[]::text[], 0),
  ('Wensen en voorkeuren', 'Kleurvoorkeuren voor kasten, werkblad en achterwand', 'lange_tekst', ARRAY[]::text[], 1),
  ('Wensen en voorkeuren', 'Greeploos of handgrepen?', 'multi_select', ARRAY['Greeploos','Handgrepen'], 2),
  ('Wensen en voorkeuren', 'Type werkblad', 'multi_select', ARRAY['Composiet','Natuursteen','Keramiek','RVS','Anders'], 3),
  ('Wensen en voorkeuren', 'Werkblad: meeleveren of zelf regelen?', 'multi_select', ARRAY['Meeleveren','Zelf regelen'], 4),
  ('Wensen en voorkeuren', 'Welke apparatuur wil je? (meerdere mogelijk)', 'multi_select', ARRAY[
    'Oven','Magnetron','Combi magnetron','Combi oven','Stoomoven',
    'Koelkast','Vriezer','Koel/vriescombinatie','Inductie kookplaat',
    'Kookplaat met geïntegreerde afzuiging','Afzuigkap','Quooker',
    'Wijnklimaatkast','Bordenwarmer','Anders, namelijk...'
  ], 5),
  ('Wensen en voorkeuren', 'Apparatuur: meeleveren of zelf regelen?', 'multi_select', ARRAY['Meeleveren','Zelf regelen'], 6),

  ('Indeling en functionaliteit', 'Specifieke behoeften zoals extra opbergruimte, apothekerskast, verhoogde werkhoogte of een bar', 'lange_tekst', ARRAY[]::text[], 0),

  ('Budget', 'Indicatie van het beschikbare budget voor de keuken (incl. of excl. apparatuur en blad)', 'lange_tekst', ARRAY[]::text[], 0),

  ('Eventuele extra''s', 'Speciale wensen zoals ingebouwde verlichting, specifieke handgreepjes', 'lange_tekst', ARRAY[]::text[], 0),
  ('Eventuele extra''s', 'Eventuele beperkingen, zoals draagkracht van de vloer voor een zwaar werkblad', 'lange_tekst', ARRAY[]::text[], 1),

  ('Inspiratievoorbeelden', 'Foto''s, moodboards of Pinterest-borden (upload of link)', 'lange_tekst', ARRAY[]::text[], 0),

  ('Praktische informatie', 'Tijdlijn: wanneer moet de keuken geplaatst worden?', 'tekst', ARRAY[]::text[], 0),
  ('Praktische informatie', 'Adres van de locatie en eventuele bijzonderheden (bijv. appartement zonder lift)', 'lange_tekst', ARRAY[]::text[], 1),
  ('Praktische informatie', 'Toegang tot de woning (smalle deuren, trappen, etc.)', 'lange_tekst', ARRAY[]::text[], 2),

  ('Overige opmerkingen', 'Overige opmerkingen', 'lange_tekst', ARRAY[]::text[], 0)
) AS q(category_label, question, type, options, sort_order)
JOIN finka_questionnaire_categories c ON c.label = q.category_label;

ALTER TABLE finka_questionnaire_templates ALTER COLUMN category_id SET NOT NULL;

-- =========================================================
-- 51. Vragenlijst — vraagtype "Bestand" (jpg/png/pdf), voor bv. plattegrond-
--    of inspiratiefoto's. Eigen storage-bucket (publiek, want er zit geen
--    concurrentiegevoelige data in — alleen door de klant zelf aangeleverde
--    foto's/pdf's van hun eigen keuken). Net als bij multi_select staat het
--    antwoord als JSON in finka_questionnaire_responses.answer (een array
--    van {url, name}) — geen aparte tabel/kolom nodig. Upload gaat altijd
--    via /api/portaal/upload (service-role, valideert projecteigendom) —
--    nooit rechtstreeks vanuit de klant-browser naar Storage.
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('klant-uploads', 'klant-uploads', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE finka_questionnaire_templates DROP CONSTRAINT IF EXISTS finka_questionnaire_templates_type_check;
ALTER TABLE finka_questionnaire_templates ADD CONSTRAINT finka_questionnaire_templates_type_check CHECK (type IN ('tekst','lange_tekst','multi_select','bestand'));

-- De twee vragen die in het aangeleverde document al om een upload vroegen,
-- meteen op het nieuwe type gezet.
UPDATE finka_questionnaire_templates
SET type = 'bestand'
WHERE question = 'Plattegrond met exacte maten van de keuken (lengte, breedte, hoogte)';

UPDATE finka_questionnaire_templates
SET type = 'bestand', question = 'Foto''s, moodboards of Pinterest-borden (upload)'
WHERE question = 'Foto''s, moodboards of Pinterest-borden (upload of link)';

-- =========================================================
-- 52. Vragenlijst — per project een vraag kunnen verbergen voor de klant.
--    Anders dan bij de checklist bestaat er geen per-project kopie van een
--    vraag (finka_questionnaire_templates is bewust live/gedeeld, zie
--    migratie-sectie 49) — dus "verborgen" hoort hier op de al bestaande
--    project+vraag-koppeling: finka_questionnaire_responses. Staff kan een
--    vraag verbergen nog vóórdat de klant 'm heeft beantwoord; de rij wordt
--    dan aangemaakt met answer = NULL en hidden = true.
-- =========================================================

ALTER TABLE finka_questionnaire_responses ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- =========================================================
-- 53. Vragenlijst — "Anders, namelijk..." (met een los invulveld zodra
--    gekozen) is voortaan een ingebakken optie bij élke multi_select-vraag
--    (zie MULTI_SELECT_OTHER_OPTION in src/lib/questionnaire.ts), niet iets
--    dat losstaand in q.options hoeft te staan. Bestaande vragen die 'm al
--    letterlijk als optie hadden staan ("Anders"/"Anders, namelijk...")
--    worden hier opgeschoond, anders zou hij dubbel verschijnen.
-- =========================================================

UPDATE finka_questionnaire_templates
SET options = COALESCE(
  (SELECT jsonb_agg(opt) FROM jsonb_array_elements_text(options) AS opt WHERE opt NOT IN ('Anders', 'Anders, namelijk...')),
  '[]'::jsonb
)
WHERE type = 'multi_select';

-- =========================================================
-- 54. "Documenten"-tabblad — elke gedownloade offerte-PDF wordt nu ook zelf
--    bewaard (naast de snapshot/diff die er al lag, zie sectie 28), zodat
--    'm terug te vinden is op het project via het Documenten-tabblad, met de
--    datum waarop 'm gedownload/toegevoegd is. Eigen storage-bucket, publiek
--    (zelfde afweging als klant-uploads/offer-images: geen concurrentie-
--    gevoelige data, obscuur pad via random UUID). Upload gebeurt server-side
--    in /api/offerte/[projectId]/pdf/route.ts, altijd door een ingelogde
--    staff-gebruiker — vandaar dezelfde policy-vorm als offer-images
--    (sectie 11): alleen authenticated mag schrijven, lezen kan iedereen via
--    de publieke bucket-URL.
-- =========================================================

ALTER TABLE finka_quote_downloads ADD COLUMN IF NOT EXISTS pdf_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('offerte-pdfs', 'offerte-pdfs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated kunnen offerte-pdfs uploaden"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'offerte-pdfs');

CREATE POLICY "Authenticated kunnen offerte-pdfs bijwerken"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'offerte-pdfs');

CREATE POLICY "Authenticated kunnen offerte-pdfs verwijderen"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'offerte-pdfs');

-- =========================================================
-- 55. Leesbare bestandsnaam per download: "Titel - Klantnaam - Datum - vN"
--    (Titel = customer_document_label, bv. "Prijsindicatie"/"Offerte"; vN =
--    hoeveelste download van déze offerte op déze kalenderdag). Opgebouwd en
--    weggeschreven op het moment van downloaden (zie buildQuoteFilename in
--    /api/offerte/[projectId]/pdf/route.ts), zodat 'm ongewijzigd blijft ook
--    als het documentlabel later verandert — en gebruikt voor zowel de
--    daadwerkelijke download (Content-Disposition) als de weergave in het
--    Documenten-tabblad.
-- =========================================================

ALTER TABLE finka_quote_downloads ADD COLUMN IF NOT EXISTS filename TEXT;

-- =========================================================
-- 56. Documenten in het klantenportaal — staff kan per gedownloade offerte
--    kiezen of die ook in het portaal te zien is (zelfde oog-knop-patroon
--    als bij Checklist-items en Vragenlijst-vragen). Standaard verborgen:
--    een download is in eerste instantie een intern werkexemplaar, pas
--    expliciet aanzetten maakt 'm klant-zichtbaar.
-- =========================================================

ALTER TABLE finka_quote_downloads ADD COLUMN IF NOT EXISTS visible_to_customer BOOLEAN NOT NULL DEFAULT false;

-- =========================================================
-- 57. Checklist — datum bijhouden waarop een punt is afgevinkt, zichtbaar
--    zowel intern (project-tabblad) als in het klantportaal. Wordt gezet
--    zodra checked op true gaat, en weer op NULL gezet zodra iemand het
--    vinkje uitzet (geen geschiedenis van eerdere keren, gewoon de laatste
--    afvink-datum).
-- =========================================================

ALTER TABLE finka_checklist_items ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

-- =========================================================
-- 58. Klant-akkoord op een document — staff kan per gedownloade offerte
--    aangeven dat de klant 'm officieel moet accorderen (bv. de offerte-PDF
--    zelf), naast het oog-knopje dat alleen zichtbaarheid regelt. De klant
--    accordeert in het portaal via /api/portaal/documenten/akkoord, die dan
--    approved_at/approved_by hier vastlegt. Diezelfde route zet — als het om
--    de nog actieve (niet-gearchiveerde) offerte van het project gaat — ook
--    de offerte zelf op status 'akkoord' (akkoord_at), zodat het meteen
--    meetelt in de omzet-rapportage (/financieel), net als wanneer staff dat
--    handmatig in de Offerte-tab zou zetten.
-- =========================================================

ALTER TABLE finka_quote_downloads ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE finka_quote_downloads ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE finka_quote_downloads ADD COLUMN IF NOT EXISTS approved_by TEXT;
