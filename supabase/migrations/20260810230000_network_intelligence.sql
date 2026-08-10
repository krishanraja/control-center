-- The network intelligence layer.
--
-- `contacts` has always been an identity spine: who someone is, how we got
-- them, and three externally-written numbers (heat_score, fit_scores,
-- relationship_strength) that arrive from the n8n RE Dossier Engine. What it
-- has never held is a judgment — why this person is worth Krish's time, what
-- to open with, what would make contacting them a waste.
--
-- 10,670 resolved people now carry exactly that. Verified against live data
-- before writing this: 2,466 of the 2,470 rows already in `contacts` resolve
-- into that file, so this is an enrichment of the existing spine, not a
-- parallel one. 8,163 people are new.
--
-- ── Why a sibling table and not 20 more columns on contacts ────────────────
--
-- `contacts` carries an RLS policy `contacts_anon_select ... USING (true)`, so
-- the anon key shipped in the browser bundle can read every row through
-- PostgREST. That is tolerable for names and companies. It is NOT tolerable for
-- `why_them` and `risk`, which are private judgments about named people written
-- for one reader.
--
-- So the judgment layer lives here, with no anon policy at all, and is served
-- exclusively through the access-gated /api/network/* routes. Splitting on the
-- sensitivity boundary is the whole point; putting these columns on `contacts`
-- would publish them.
--
-- This does not fork the person spine. contact_id is a FK to contacts.id, 1:1,
-- ON DELETE CASCADE. contacts remains the identity of record.

-- ── 1. The column migration 20260617120000 promised and never delivered ────
-- That migration declared contacts.identity_embedding but was never applied to
-- production (verified: no such column live, and its UNIQUE index on
-- linkedin_url_norm was superseded by the non-unique one in 20260617220000
-- because contacts.linkedin_url holds junk placeholders a UNIQUE would reject).
-- The dedup_nearest RPC it created DOES exist live and already allow-lists
-- ('contacts', 'identity_embedding'), so this column makes a live RPC work
-- rather than introducing a new capability.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS identity_embedding vector(1536);

COMMENT ON COLUMN public.contacts.identity_embedding IS
  'Identity embedding (name + title + company) for dedup_nearest. Distinct from contact_intelligence.embedding, which embeds the judgment text for search.';

CREATE INDEX IF NOT EXISTS contacts_identity_embedding_ivfflat
  ON public.contacts USING ivfflat (identity_embedding vector_cosine_ops) WITH (lists = 100);

-- ── 2. The judgment layer ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_intelligence (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,

  -- The four judgment fields. `why_them` is the one that was missing.
  who      text,
  why_them text,
  hook     text,
  risk     text,

  -- roles: buyer, partner, introducer, guest, operator_peer, investor, hire,
  -- none. '{none}' is a valid and useful answer, held deliberately rather than
  -- left null.
  roles text[] NOT NULL DEFAULT '{}',

  -- surface_when: the trigger vocabulary that lets the OS surface a person at
  -- the right MOMENT rather than on a schedule. Each code maps to a watcher.
  surface_when text[] NOT NULL DEFAULT '{}',

  -- Per-venture 0-100. Kept as jsonb rather than four columns because the
  -- venture set has already changed twice (meliora and adfixus retired Jul 2026)
  -- and a fifth venture must not require a migration.
  venture_scores         jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_venture        text,
  mindmaker_buyer_family text,

  -- Relationship tier from source overlap. Distinct from contacts.consent_tier,
  -- which is a permission statement; this is an evidence statement.
  --   1_reciprocated (172) they have replied to an email
  --   2_core_network (128) present in 3+ independent sources
  --   3_known_network (575) present in 2
  --   4_owned_network (5,960) one source we own
  --   5_cold_lead (3,835) prospecting lists and outbound-only
  network_tier text NOT NULL,
  tier_weight  int  NOT NULL DEFAULT 0,
  priority     numeric,
  fit          numeric,
  warmth       int,

  -- Honesty about provenance. intel_method = 'rules_v1' means title and company
  -- were pattern-matched and nothing was read; 4,486 rows are in that state.
  -- The scorer penalises them and the UI marks them. Neither hides them.
  confidence   text NOT NULL DEFAULT 'low',
  intel_method text NOT NULL DEFAULT 'rules_v1',
  evidence     text[] NOT NULL DEFAULT '{}',

  seniority text,
  country   text,
  industry  text,

  reachable_via text[] NOT NULL DEFAULT '{}',
  best_channel  text,

  source_count int    NOT NULL DEFAULT 0,
  source_list  text[] NOT NULL DEFAULT '{}',

  -- is_person is false on 52 shared mailboxes and system aliases. This is the
  -- one hard filter the search applies.
  is_person    boolean NOT NULL DEFAULT true,
  -- full | partial (a single token, usually a first name or an IG handle) |
  -- missing. 651 rows carry a name and nothing else.
  name_quality text NOT NULL DEFAULT 'missing',

  reciprocated_email boolean NOT NULL DEFAULT false,
  email_inbound  int DEFAULT 0,
  email_outbound int DEFAULT 0,
  email_last     date,

  -- The retrieval surface. intel_doc is who + why_them + hook + title +
  -- company + industry + location + the LinkedIn headline/about, assembled at
  -- import so the lexical and semantic tiers index exactly the same text.
  intel_doc text,
  intel_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(intel_doc, ''))) STORED,
  embedding vector(1536),

  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contact_intelligence IS
  'Per-person judgment layer over contacts. Service-role only: why_them and risk are private assessments of named people and must never reach the anon key.';
COMMENT ON COLUMN public.contact_intelligence.intel_doc IS
  'Assembled retrieval text. Both intel_tsv and embedding derive from this, so lexical and semantic tiers never disagree about what was indexed.';
COMMENT ON COLUMN public.contact_intelligence.network_tier IS
  'Evidence tier from source overlap. Distinct from contacts.consent_tier, which states what we are permitted to do.';

-- ── 3. Indexes ─────────────────────────────────────────────────────────────
-- lists = 100 for ~10.7k rows: pgvector's guidance is rows/1000 for under a
-- million, and 100 keeps probe recall sane at this size.
CREATE INDEX IF NOT EXISTS ci_embedding_ivfflat ON public.contact_intelligence
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS ci_intel_tsv_gin  ON public.contact_intelligence USING gin (intel_tsv);
CREATE INDEX IF NOT EXISTS ci_roles_gin      ON public.contact_intelligence USING gin (roles);
CREATE INDEX IF NOT EXISTS ci_surface_gin    ON public.contact_intelligence USING gin (surface_when);
CREATE INDEX IF NOT EXISTS ci_vscores_gin    ON public.contact_intelligence USING gin (venture_scores jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ci_network_tier   ON public.contact_intelligence (network_tier);
CREATE INDEX IF NOT EXISTS ci_primary_vent   ON public.contact_intelligence (primary_venture);
CREATE INDEX IF NOT EXISTS ci_seniority      ON public.contact_intelligence (seniority);
CREATE INDEX IF NOT EXISTS ci_country        ON public.contact_intelligence (country);
-- The browse default (tiers 1-3, real judgment, actual humans) as one partial
-- index, since that is the predicate the Network tab opens with every time.
CREATE INDEX IF NOT EXISTS ci_working_set ON public.contact_intelligence (priority DESC)
  WHERE is_person AND intel_method <> 'rules_v1'
    AND network_tier IN ('1_reciprocated', '2_core_network', '3_known_network');

-- ── 4. RLS: service role only. No anon policy, deliberately. ───────────────
ALTER TABLE public.contact_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ci_service_all ON public.contact_intelligence;
CREATE POLICY ci_service_all ON public.contact_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.contact_intelligence FROM anon;
