-- FINKA Dashboard database schema
-- Run this in Supabase SQL editor

-- Klanten
CREATE TABLE IF NOT EXISTS finka_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','actief','afgerond','on-hold')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-increment referentienummer: 2026-001-FK
CREATE SEQUENCE IF NOT EXISTS finka_customer_seq START 1;

CREATE OR REPLACE FUNCTION generate_customer_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference_number := EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('finka_customer_seq')::TEXT, 3, '0') || '-FK';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_customer_reference ON finka_customers;
CREATE TRIGGER set_customer_reference
  BEFORE INSERT ON finka_customers
  FOR EACH ROW
  WHEN (NEW.reference_number = '' OR NEW.reference_number IS NULL)
  EXECUTE FUNCTION generate_customer_reference();

-- Leveranciers
CREATE TABLE IF NOT EXISTS finka_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apparatuur bibliotheek
CREATE TABLE IF NOT EXISTS finka_appliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('kookplaat','oven','vaatwasser','afzuigkap','koelkast','koelvries','combi-oven','kokendwaterkraan','anders')),
  supplier_id UUID REFERENCES finka_suppliers(id) ON DELETE SET NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  price DECIMAL(10,2),
  category TEXT CHECK (category IN ('budget','midden','premium')),
  specs JSONB DEFAULT '{}',
  notes TEXT,
  source_email_subject TEXT,
  quote_date DATE,
  price_history JSONB DEFAULT '[]'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gmail inbox queue
CREATE TABLE IF NOT EXISTS finka_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  body_preview TEXT,
  has_attachments BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','skipped')),
  ai_extracted JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gmail OAuth token opslag
CREATE TABLE IF NOT EXISTS finka_gmail_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  gmail_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offertes (oude conceptofferte/sfeerpresentatie — blijft ongewijzigd naast de nieuwe finka_quotes uit Fase 1)
CREATE TABLE IF NOT EXISTS finka_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES finka_customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'concept' CHECK (status IN ('concept','verstuurd','geaccepteerd')),
  cover_image_url TEXT,
  subtitle TEXT,
  intro_text TEXT,
  inspiration_images JSONB DEFAULT '[]'::jsonb,
  bezinken_text TEXT,
  specs JSONB DEFAULT '{}'::jsonb,
  total_price INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cover_images JSONB DEFAULT '[]'::jsonb,
  render_image_url TEXT,
  sfeerfoto_url TEXT,
  attachments JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE finka_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_gmail_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE finka_offers ENABLE ROW LEVEL SECURITY;

-- RLS policies: alleen ingelogde gebruikers
CREATE POLICY "Authenticated users only" ON finka_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_appliances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_email_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_gmail_token FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users only" ON finka_offers FOR ALL TO authenticated USING (true) WITH CHECK (true);
