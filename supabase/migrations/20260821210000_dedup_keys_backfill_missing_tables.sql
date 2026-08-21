-- The dedup fingerprint columns for leads, guests and visibility_targets.
--
-- 20260617120000_dedup_keys_and_synthesis is in the applied ledger, but its
-- column additions for these three tables were never in the database.
-- content_ideas and contacts have theirs only because LATER migrations happened
-- to add them (content_ideas_embedding_and_synthesis,
-- contacts_guest_promotion_keys, network_intelligence). So _dedup.ts
-- checkDuplicate() — the shared helper "called from every ingest path" — had
-- been erroring for three of its five tables, and api/_dedup-backfill.ts's
-- visibility_targets pass could not run at all.
--
-- Verified missing before this ran: 10 of 10 columns absent. Verified present
-- and backfilled after: leads 261/261, guests 41/41, visibility_targets 62/62.
--
-- Idempotent throughout, so it is safe regardless of what the original did.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_url_norm  text,
  ADD COLUMN IF NOT EXISTS email_norm         text,
  ADD COLUMN IF NOT EXISTS identity_embedding vector(1536);

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS email_norm         text,
  ADD COLUMN IF NOT EXISTS linkedin_url_norm  text,
  ADD COLUMN IF NOT EXISTS personal_url_norm  text,
  ADD COLUMN IF NOT EXISTS identity_embedding vector(1536);

ALTER TABLE public.visibility_targets
  ADD COLUMN IF NOT EXISTS event_url_norm   text,
  ADD COLUMN IF NOT EXISTS title_norm       text,
  ADD COLUMN IF NOT EXISTS title_embedding  vector(1536);

UPDATE public.leads SET email_norm = lower(trim(email))
  WHERE email IS NOT NULL AND email_norm IS NULL;
UPDATE public.leads SET linkedin_url_norm = lower(regexp_replace(trim(linkedin_url), '/+$', ''))
  WHERE linkedin_url IS NOT NULL AND linkedin_url_norm IS NULL;

UPDATE public.guests SET email_norm = lower(trim(email))
  WHERE email IS NOT NULL AND email_norm IS NULL;
UPDATE public.guests SET linkedin_url_norm = lower(regexp_replace(trim(linkedin_url), '/+$', ''))
  WHERE linkedin_url IS NOT NULL AND linkedin_url_norm IS NULL;
UPDATE public.guests SET personal_url_norm = lower(regexp_replace(trim(personal_url), '/+$', ''))
  WHERE personal_url IS NOT NULL AND personal_url_norm IS NULL;

UPDATE public.visibility_targets SET event_url_norm = lower(regexp_replace(trim(event_url), '/+$', ''))
  WHERE event_url IS NOT NULL AND event_url_norm IS NULL;
UPDATE public.visibility_targets SET title_norm = regexp_replace(lower(trim(title)), '[^a-z0-9]+', ' ', 'g')
  WHERE title IS NOT NULL AND title_norm IS NULL;

-- Unique where the data supports it. leads and guests were verified clean
-- (zero duplicate groups on either key) before this ran.
CREATE UNIQUE INDEX IF NOT EXISTS leads_linkedin_url_norm_uniq
  ON public.leads (linkedin_url_norm) WHERE linkedin_url_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_email_norm_idx
  ON public.leads (email_norm) WHERE email_norm IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS guests_email_norm_uniq
  ON public.guests (email_norm) WHERE email_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS guests_linkedin_url_norm_uniq
  ON public.guests (linkedin_url_norm) WHERE linkedin_url_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS guests_personal_url_norm_idx
  ON public.guests (personal_url_norm) WHERE personal_url_norm IS NOT NULL;

-- visibility_targets.event_url_norm is deliberately NOT unique: two duplicate
-- event_url groups already exist, created by the very dedup gap this closes.
-- A unique index would fail the migration, and deleting an operator's rows to
-- force it is not this migration's call. Non-unique keeps the lookup fast and
-- lets checkDuplicate() work. The two pairs (cxgoalkeeper.com/podcast and
-- sectionai.com/events/apply-to-speak) are recorded in docs/DB_HEALTH.md for a
-- human to merge; make this unique afterwards.
CREATE INDEX IF NOT EXISTS visibility_targets_event_url_norm_idx
  ON public.visibility_targets (event_url_norm) WHERE event_url_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS visibility_targets_title_norm_idx
  ON public.visibility_targets (title_norm) WHERE title_norm IS NOT NULL;

-- No ivfflat indexes on the new embedding columns. They are entirely NULL, and
-- an ivfflat built on zero vectors trains its centroids on nothing and
-- permanently mis-clusters whatever a later backfill writes — the lesson
-- recorded in 20260810230000_network_intelligence.sql. Build them in the same
-- change that populates the column.
