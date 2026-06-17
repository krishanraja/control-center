-- Cross-surface dedup keys + narrative synthesis enablement.
--
-- Two coordinated changes:
--
--   1. Dedup at ingest. Every triage surface (content_ideas, leads, contacts,
--      guests, visibility_targets) gets the same dedup fingerprint columns so a
--      single shared utility (api/_dedup.ts) can collapse duplicates before
--      they ever land in a triage deck. Until today only `leads` (UNIQUE on
--      lower(email)) and `contacts` (lookup-by-email/linkedin at CSV import)
--      had any dedup; `guests` and `visibility_targets` had none, and
--      `content_ideas` claimed "embedding dedupe" but the N8N webhook was
--      doing zero dedup steps.
--
--   2. Narrative synthesis. content_ideas grows a 'synthesis' source_type and
--      an 'absorbed' state. A synthesis row is the parent narrative; the
--      cards folded into it are flipped to 'absorbed' (NOT 'dropped') with a
--      pointer in meta.absorbed_into.
--
-- Idempotent. Safe to re-run.

-- ── pgvector extension ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Dedup keys: content_ideas ────────────────────────────────────────────────
ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS title_norm    text,
  ADD COLUMN IF NOT EXISTS content_hash  text,
  ADD COLUMN IF NOT EXISTS embedding     vector(1536);

-- Unique partial index on canonical_url is the backstop: app-level dedup may
-- regress, but the DB will refuse a second row for the same canonical URL.
CREATE UNIQUE INDEX IF NOT EXISTS content_ideas_canonical_url_uniq
  ON public.content_ideas (canonical_url)
  WHERE canonical_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_ideas_title_norm_idx
  ON public.content_ideas (title_norm)
  WHERE title_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_ideas_content_hash_idx
  ON public.content_ideas (content_hash)
  WHERE content_hash IS NOT NULL;

-- ivfflat needs a populated column to choose a good list count. We start with
-- 100 lists (tunable later via REINDEX). Cosine distance for normalized
-- embeddings.
CREATE INDEX IF NOT EXISTS content_ideas_embedding_ivfflat
  ON public.content_ideas
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Dedup keys: leads ────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_url_norm text,
  ADD COLUMN IF NOT EXISTS email_norm        text,
  ADD COLUMN IF NOT EXISTS identity_embedding vector(1536);

CREATE UNIQUE INDEX IF NOT EXISTS leads_linkedin_url_norm_uniq
  ON public.leads (linkedin_url_norm)
  WHERE linkedin_url_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_email_norm_idx
  ON public.leads (email_norm)
  WHERE email_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_identity_embedding_ivfflat
  ON public.leads
  USING ivfflat (identity_embedding vector_cosine_ops)
  WITH (lists = 50);

-- Backfill email_norm from existing email column. The leads_email_dedupe
-- unique index is on lower(email); email_norm gives a real column the dedup
-- utility can read without recomputing.
UPDATE public.leads
  SET email_norm = lower(trim(email))
  WHERE email IS NOT NULL AND email_norm IS NULL;

UPDATE public.leads
  SET linkedin_url_norm = lower(regexp_replace(trim(linkedin_url), '/+$', ''))
  WHERE linkedin_url IS NOT NULL AND linkedin_url_norm IS NULL;

-- ── Dedup keys: contacts ─────────────────────────────────────────────────────
-- contacts already has email_normalized; add the rest for parity.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS linkedin_url_norm  text,
  ADD COLUMN IF NOT EXISTS identity_embedding vector(1536);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_linkedin_url_norm_uniq
  ON public.contacts (linkedin_url_norm)
  WHERE linkedin_url_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_identity_embedding_ivfflat
  ON public.contacts
  USING ivfflat (identity_embedding vector_cosine_ops)
  WITH (lists = 50);

UPDATE public.contacts
  SET linkedin_url_norm = lower(regexp_replace(trim(linkedin_url), '/+$', ''))
  WHERE linkedin_url IS NOT NULL AND linkedin_url_norm IS NULL;

-- ── Dedup keys: guests (had ZERO dedup) ──────────────────────────────────────
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS email_norm         text,
  ADD COLUMN IF NOT EXISTS linkedin_url_norm  text,
  ADD COLUMN IF NOT EXISTS personal_url_norm  text,
  ADD COLUMN IF NOT EXISTS identity_embedding vector(1536);

CREATE UNIQUE INDEX IF NOT EXISTS guests_email_norm_uniq
  ON public.guests (email_norm)
  WHERE email_norm IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS guests_linkedin_url_norm_uniq
  ON public.guests (linkedin_url_norm)
  WHERE linkedin_url_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS guests_personal_url_norm_idx
  ON public.guests (personal_url_norm)
  WHERE personal_url_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS guests_identity_embedding_ivfflat
  ON public.guests
  USING ivfflat (identity_embedding vector_cosine_ops)
  WITH (lists = 50);

UPDATE public.guests
  SET email_norm = lower(trim(email))
  WHERE email IS NOT NULL AND email_norm IS NULL;

UPDATE public.guests
  SET linkedin_url_norm = lower(regexp_replace(trim(linkedin_url), '/+$', ''))
  WHERE linkedin_url IS NOT NULL AND linkedin_url_norm IS NULL;

UPDATE public.guests
  SET personal_url_norm = lower(regexp_replace(trim(personal_url), '/+$', ''))
  WHERE personal_url IS NOT NULL AND personal_url_norm IS NULL;

-- ── Dedup keys: visibility_targets (had ZERO dedup) ─────────────────────────
ALTER TABLE public.visibility_targets
  ADD COLUMN IF NOT EXISTS event_url_norm    text,
  ADD COLUMN IF NOT EXISTS title_norm        text,
  ADD COLUMN IF NOT EXISTS title_embedding   vector(1536);

CREATE UNIQUE INDEX IF NOT EXISTS visibility_targets_event_url_norm_uniq
  ON public.visibility_targets (event_url_norm)
  WHERE event_url_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS visibility_targets_title_norm_idx
  ON public.visibility_targets (title_norm)
  WHERE title_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS visibility_targets_title_embedding_ivfflat
  ON public.visibility_targets
  USING ivfflat (title_embedding vector_cosine_ops)
  WITH (lists = 50);

UPDATE public.visibility_targets
  SET event_url_norm = lower(regexp_replace(trim(event_url), '/+$', ''))
  WHERE event_url IS NOT NULL AND event_url_norm IS NULL;

UPDATE public.visibility_targets
  SET title_norm = regexp_replace(lower(trim(title)), '[^a-z0-9]+', ' ', 'g')
  WHERE title IS NOT NULL AND title_norm IS NULL;

-- ── Synthesis enablement: extend content_ideas state + source_type ──────────
-- The existing CHECK constraints are anonymous and were defined in an older
-- migration. We don't know their names, so we drop-by-discovery and re-add.

DO $$
DECLARE
  con_name text;
BEGIN
  -- state CHECK
  SELECT conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'content_ideas'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%state%seeded%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.content_ideas DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE public.content_ideas
    ADD CONSTRAINT content_ideas_state_check
    CHECK (state IN ('seeded','researching','drafting','review','approved','published','dropped','absorbed'));

  -- source_type CHECK
  SELECT conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'content_ideas'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%source_type%signal_inbox%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.content_ideas DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE public.content_ideas
    ADD CONSTRAINT content_ideas_source_type_check
    CHECK (source_type IN (
      'signal_inbox','cleo_chat','agatha_chat','openclaw_workspace',
      'zara_signal','manual','inspiration_sweep','synthesis_hypothesis',
      'customer_voice','crm_opportunity','synthesis'
    ));
END $$;

-- triage_queue view excludes 'absorbed' state automatically because it filters
-- WHERE state = 'seeded'. No view change needed.

-- ── Cluster summary column for narrative grouping ───────────────────────────
-- The nightly clustering job writes a 2-3 sentence Haiku summary describing
-- the narrative a cluster represents. Lives in meta.cluster_summary; no new
-- column needed, but we add a btree on related_idea_ids cardinality for the
-- "show me the big clusters" filter.

CREATE INDEX IF NOT EXISTS content_ideas_related_count_idx
  ON public.content_ideas ((array_length(related_idea_ids, 1)))
  WHERE related_idea_ids IS NOT NULL;

COMMENT ON COLUMN public.content_ideas.canonical_url IS
  'Normalized source URL (lowercased host, stripped of utm_*/ref/fbclid/trailing slash). Unique-indexed; populated at ingest by api/_dedup.ts.';
COMMENT ON COLUMN public.content_ideas.title_norm IS
  'Title lowercased, punctuation collapsed to single spaces. Used for cheap exact-match dedup before embedding similarity.';
COMMENT ON COLUMN public.content_ideas.content_hash IS
  'SHA-256 of source_snippet (or first 2KB of body). Catches duplicate inserts with the same body but different URLs.';
COMMENT ON COLUMN public.content_ideas.embedding IS
  'OpenAI text-embedding-3-small over idea + thesis + source_snippet. Used for near-dup detection (>0.92) and narrative clustering (>0.78).';

-- ── dedup_nearest RPC ───────────────────────────────────────────────────────
-- Called from api/_dedup.ts to find the nearest neighbor on a given embedding
-- column above a similarity threshold. We expose this as an RPC instead of
-- relying on raw PostgREST because pgvector operators (<=>) aren't exposed
-- through the auto-API.
CREATE OR REPLACE FUNCTION public.dedup_nearest(
  p_table     text,
  p_column    text,
  p_vector    text,
  p_since     timestamptz,
  p_threshold float8
) RETURNS TABLE (id text, similarity float8)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q text;
BEGIN
  -- Allow-list the table + column to prevent injection through this RPC.
  IF p_table NOT IN ('content_ideas','leads','contacts','guests','visibility_targets') THEN
    RAISE EXCEPTION 'dedup_nearest: invalid table %', p_table;
  END IF;
  IF p_column NOT IN ('embedding','identity_embedding','title_embedding') THEN
    RAISE EXCEPTION 'dedup_nearest: invalid column %', p_column;
  END IF;

  -- 1 - cosine_distance = cosine similarity; pgvector's <=> is cosine
  -- distance. We pass through the threshold as similarity (caller-friendly).
  q := format($f$
    SELECT id::text, 1 - (%I <=> $1::vector) AS similarity
    FROM public.%I
    WHERE %I IS NOT NULL
      AND created_at >= $2
      AND 1 - (%I <=> $1::vector) >= $3
    ORDER BY %I <=> $1::vector
    LIMIT 1
  $f$, p_column, p_table, p_column, p_column, p_column);

  RETURN QUERY EXECUTE q USING p_vector, p_since, p_threshold;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedup_nearest(text, text, text, timestamptz, float8) TO anon, authenticated, service_role;

-- ── mark_absorbed RPC ───────────────────────────────────────────────────────
-- Bulk flips a set of source cards into the 'absorbed' state with a pointer
-- to the synthesis parent. Used by api/content-ideas/synthesize.ts after the
-- new narrative row is created.
CREATE OR REPLACE FUNCTION public.mark_absorbed(
  p_source_ids uuid[],
  p_parent_id  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.content_ideas
  SET state = 'absorbed',
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
        'absorbed_into', p_parent_id::text,
        'absorbed_at',   now()
      ),
      updated_at = now()
  WHERE id = ANY(p_source_ids)
    AND state <> 'absorbed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_absorbed(uuid[], uuid) TO service_role;


