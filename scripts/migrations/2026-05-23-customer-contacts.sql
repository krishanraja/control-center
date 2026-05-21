-- Pillar 3 — Customer Compounding Engine.
-- Track every customer conversation so the dashboard can enforce a cadence
-- (no contact in 30d = surface to the Customer Council queue).

CREATE TABLE IF NOT EXISTS customer_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contacted_at  timestamptz NOT NULL DEFAULT now(),
  channel       text,                              -- 'email' | 'call' | 'video' | 'in_person' | 'message'
  reason        text,                              -- 'welcome' | 'check_in' | 'expansion' | 'save' | 'exit_interview'
  summary       text,                              -- one-paragraph what-was-said
  agent         text,                              -- who from Mindmaker (krish | maya | …)
  next_step     text,
  raw           jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx ON customer_contacts (customer_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS customer_contacts_reason_idx   ON customer_contacts (reason, contacted_at DESC);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_contacts_anon_read ON customer_contacts;
CREATE POLICY customer_contacts_anon_read ON customer_contacts
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS customer_contacts_service_all ON customer_contacts;
CREATE POLICY customer_contacts_service_all ON customer_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
