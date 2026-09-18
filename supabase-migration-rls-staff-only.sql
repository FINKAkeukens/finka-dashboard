-- RLS-fix: elke finka_*-tabel had een policy "Authenticated users only" met
-- USING (true) — dat betekent in de praktijk "elke ingelogde gebruiker mag
-- alles lezen/schrijven", niet alleen staff. Sinds het klantenportaal
-- bestaat, hebben klanten ook een `authenticated`-sessie (via Supabase Auth)
-- en de publieke NEXT_PUBLIC_SUPABASE_ANON_KEY staat in elke browserbundel.
-- Een klant kan dus, buiten de Next.js-app om, rechtstreeks de Supabase
-- REST-API aanspreken met zijn eigen sessie en zo bij alle andere klanten,
-- alle interne kostprijzen/marges, het volledige financieel-overzicht en de
-- lijst van staff-accounts komen.
--
-- Controle: alle klant-portaal-code (src/app/portaal/**, src/app/api/portaal/**)
-- leest/schrijft uitsluitend via de service-role-client (die RLS altijd
-- omzeilt) — geen enkel klant-gericht scherm doet een rechtstreekse
-- tabel-call vanuit de browser. Alleen het interne staff-dashboard
-- ((dashboard)/**) doet dat wél. Deze migratie kan dus voor élke tabel
-- gewoon "staff-only" worden zonder dat er iets voor staff kapot gaat, en
-- zonder dat er ergens apart per-klant-scoped beleid nodig is.
--
-- Uitvoeren: plak dit in de Supabase SQL editor van het project en run het.
-- Veilig te herhalen (DROP POLICY IF EXISTS + CREATE POLICY).

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM finka_staff_users WHERE id = auth.uid()
  );
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'finka_appliances', 'finka_assets', 'finka_audit_log', 'finka_checklist_categories',
    'finka_checklist_items', 'finka_checklist_templates', 'finka_configurator_options',
    'finka_configurator_scenarios', 'finka_connection_items', 'finka_connection_schema',
    'finka_customers', 'finka_default_texts', 'finka_delivery_times', 'finka_email_queue',
    'finka_euroline_rates', 'finka_financial_settings', 'finka_gmail_token', 'finka_import_jobs',
    'finka_invoices', 'finka_maatformulier_categories', 'finka_maatformulier_items',
    'finka_maatformulier_signoff', 'finka_maatformulier_templates', 'finka_moodboard_categories',
    'finka_moodboard_options', 'finka_moodboard_selections', 'finka_offers',
    'finka_operating_expenses', 'finka_portal_activity', 'finka_portal_tokens',
    'finka_project_documents', 'finka_project_financials', 'finka_project_milestones',
    'finka_project_notes', 'finka_project_statuses', 'finka_projects',
    'finka_questionnaire_categories', 'finka_questionnaire_responses', 'finka_questionnaire_templates',
    'finka_quote_downloads', 'finka_quote_items', 'finka_quotes', 'finka_staff_users',
    'finka_supplier_documents', 'finka_supplier_folders', 'finka_suppliers', 'finka_werkblad_rates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Authenticated users only', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff())',
      'Staff only', t
    );
  END LOOP;
END $$;

-- Zelfde probleem, zelfde fix, voor de 4 storage-buckets die staff rechtstreeks
-- vanuit de dashboard-UI beschrijft (upload/update/delete). Lezen (SELECT)
-- blijft ongewijzigd publiek via de random-UUID-paden — dat was al een
-- bewuste, geaccepteerde afweging (zie de code-comments in de migratie) en
-- geen onderdeel van dit lek. `klant-uploads` staat hier bewust niet bij: die
-- bucket heeft nooit een "authenticated"-schrijfpolicy gehad, alleen de
-- service-role-route (/api/portaal/upload) schrijft daar.
DO $$
DECLARE
  b text;
  buckets text[] := ARRAY['offer-images', 'offerte-pdfs', 'project-documenten', 'leverancier-documenten'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated kunnen ' || b || ' uploaden');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated kunnen ' || b || ' bijwerken');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated kunnen ' || b || ' verwijderen');

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND is_staff())',
      'Staff kan ' || b || ' uploaden', b
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND is_staff())',
      'Staff kan ' || b || ' bijwerken', b
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND is_staff())',
      'Staff kan ' || b || ' verwijderen', b
    );
  END LOOP;
END $$;
