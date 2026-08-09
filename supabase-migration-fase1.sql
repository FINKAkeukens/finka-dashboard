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

CREATE SEQUENCE IF NOT EXISTS finka_project_seq START 1;

CREATE OR REPLACE FUNCTION generate_project_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference_number := 'FP-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('finka_project_seq')::TEXT, 3, '0');
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
  status TEXT NOT NULL DEFAULT 'gepland' CHECK (status IN ('gepland', 'bevestigd', 'klaar')),
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
