-- Pillar 2 — Bet Board. Every initiative is a falsifiable hypothesis with
-- a time-box and a kill-switch. When the time-box expires the UI forces
-- a Won/Lost/Extend decision. Hit-rate over rolling 90d tells Krish
-- which kinds of bets pay.

DO $$ BEGIN
  CREATE TYPE bet_status AS ENUM ('live','won','lost','paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bet_kind AS ENUM ('content','outreach','product','pricing','partnership','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis         text       NOT NULL,
  success_criterion  text       NOT NULL,
  kind               bet_kind   NOT NULL DEFAULT 'other',
  time_box_days      int        NOT NULL DEFAULT 14,
  status             bet_status NOT NULL DEFAULT 'live',
  agent_owner        text,                             -- felix | maya | nell | krish | …
  est_mrr_impact_usd numeric(10,2),                    -- Krish's pre-registration estimate
  actual_mrr_impact_usd numeric(10,2),                 -- filled when decided
  learning           text,                             -- "what I learned" — required on won/lost
  replaces_bet_id    uuid REFERENCES bets(id) ON DELETE SET NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz,
  -- audit
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bets_status_idx          ON bets (status, started_at DESC);
CREATE INDEX IF NOT EXISTS bets_decided_idx         ON bets (decided_at DESC NULLS LAST) WHERE decided_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS bets_owner_idx           ON bets (agent_owner, status);

CREATE OR REPLACE FUNCTION touch_bets_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bets_touch_updated_at ON bets;
CREATE TRIGGER bets_touch_updated_at
  BEFORE UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION touch_bets_updated_at();

-- RLS — anon read, service_role write.
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bets_anon_read ON bets;
CREATE POLICY bets_anon_read ON bets
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS bets_service_all ON bets;
CREATE POLICY bets_service_all ON bets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
