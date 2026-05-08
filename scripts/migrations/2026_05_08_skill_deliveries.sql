-- Skill Forge: client skill delivery tracking
-- Apply via Supabase Management API (project: gojpffsrxybbpbdzzrvs).
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS skill_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_email TEXT,
  skill_names TEXT[] NOT NULL DEFAULT '{}',
  transcript TEXT NOT NULL,
  additional_context TEXT,
  skills_data JSONB DEFAULT '[]',
  quality_gate JSONB DEFAULT '{}',
  zip_url TEXT,
  drive_url TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  version INT NOT NULL DEFAULT 1,
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_deliveries_client
  ON skill_deliveries(client_name);

CREATE INDEX IF NOT EXISTS idx_skill_deliveries_created
  ON skill_deliveries(created_at DESC);
