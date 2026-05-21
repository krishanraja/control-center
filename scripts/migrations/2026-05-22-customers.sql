-- Central customer-acquisition ledger. Sources of truth across the 6 SaaS
-- products (gutted, onalert, merciless, fractionl_circle, fractionl_pulse,
-- mm_ctrl). Today the 5 active Stripe revenue alert workflows ping Telegram
-- + log workflow_runs but discard the customer payload — this table is
-- where they'll write going forward, plus where the new Maya | Customer
-- Acquisition Sweeper polls per-product Supabases into.

DO $$ BEGIN
  CREATE TYPE customer_kind AS ENUM ('paid','free_signup','trial','waitlist','churned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_product AS ENUM
    ('gutted','onalert','merciless','fractionl_circle','fractionl_pulse','mm_ctrl');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS customers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product                  customer_product NOT NULL,
  kind                     customer_kind    NOT NULL,
  email                    text,
  full_name                text,
  -- Stripe
  stripe_customer_id       text,
  stripe_subscription_id   text,
  plan                     text,
  mrr_usd                  numeric(10,2),
  ltv_usd                  numeric(10,2),
  -- lifecycle
  signed_up_at             timestamptz,
  became_paid_at           timestamptz,
  churned_at               timestamptz,
  -- attribution
  source                   text,
  country                  text,
  -- audit
  raw                      jsonb,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_stripe_dedupe
  ON customers (product, stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_dedupe
  ON customers (product, lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_kind_product_idx
  ON customers (kind, product, became_paid_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS customers_recent_idx
  ON customers (created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_customers_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_touch_updated_at ON customers;
CREATE TRIGGER customers_touch_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_customers_updated_at();

-- RLS — anon reads (dashboard), service_role writes (N8N).
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_anon_read ON customers;
CREATE POLICY customers_anon_read ON customers
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS customers_service_all ON customers;
CREATE POLICY customers_service_all ON customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
