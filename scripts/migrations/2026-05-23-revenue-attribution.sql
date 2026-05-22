-- Pillar 1 — Money Machine: revenue attribution columns on customers.
-- Every paid signup gets tied back to a lead (if email matches one) and
-- through that lead to the original outreach task. Channel captured for
-- the cases where the customer arrived without a prior `leads` row
-- (organic, newsletter, referral, etc.) via Stripe metadata.utm_source.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS attribution_lead_id    uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_task_id    text REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_channel    text,
  ADD COLUMN IF NOT EXISTS attribution_confidence text;
  -- attribution_confidence: 'exact_email' | 'utm' | 'fuzzy_name' | 'unattributed'

CREATE INDEX IF NOT EXISTS customers_attribution_lead_idx ON customers (attribution_lead_id);
CREATE INDEX IF NOT EXISTS customers_attribution_task_idx ON customers (attribution_task_id);
CREATE INDEX IF NOT EXISTS customers_attribution_channel_idx ON customers (attribution_channel);

-- system_config goal target so the MRR ticker has a denominator.
INSERT INTO system_config (key, value, updated_at)
  VALUES ('mrr_goal_usd', '100000', now())
  ON CONFLICT (key) DO NOTHING;

INSERT INTO system_config (key, value, updated_at)
  VALUES ('mrr_goal_label', 'Path to $100k MRR', now())
  ON CONFLICT (key) DO NOTHING;
