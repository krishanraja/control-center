-- Pilots reads the enrichment that was already paid for.
--
-- The 14-15 September chain (ADR-021, ADR-022, PRs #321-#345) built typed
-- profile, quality and intent columns on contact_intelligence and wired them
-- into network_search. The Network lane reads them. The Pilots lane, which
-- runs the same scorer through runNetworkSearch, mapped six fields out of the
-- forty-four the RPC returns and dropped the rest on the floor:
--
--   intent_evidence      a verbatim, source-checked quote
--   intent_evidence_url  where it came from
--   intent_stance        asking | struggling | hiring | evaluating | ...
--   last_post_at         when they said it
--   followers            real reach, where Coresignal had it
--   is_influencer/creator LinkedIn's own scarce badges
--   completeness         0-100, what thin_evidence is now derived from
--
-- So a card could say "No live trigger found" for someone who had published
-- about being stuck on an AI rollout three weeks earlier, with the quote and
-- the URL sitting in the same database. Worse, findTrigger then paid for a
-- fresh web-research call per person to look for a trigger we already held.
--
-- These columns are carried onto the deal at accept time rather than joined
-- at read time on purpose: the evidence that justified listing someone is
-- part of the deal's own record, and re-reading it later would silently
-- rewrite the reason a decision was made.

ALTER TABLE public.pilot_deals
  ADD COLUMN IF NOT EXISTS intent_score        smallint,
  ADD COLUMN IF NOT EXISTS intent_stance       text,
  ADD COLUMN IF NOT EXISTS intent_evidence     text,
  ADD COLUMN IF NOT EXISTS intent_evidence_url text,
  ADD COLUMN IF NOT EXISTS intent_topics       text[],
  ADD COLUMN IF NOT EXISTS last_post_at        timestamptz,
  ADD COLUMN IF NOT EXISTS followers           integer,
  ADD COLUMN IF NOT EXISTS is_influencer       boolean,
  ADD COLUMN IF NOT EXISTS is_creator          boolean,
  ADD COLUMN IF NOT EXISTS completeness        smallint;

COMMENT ON COLUMN public.pilot_deals.intent_evidence IS
  'The verbatim sentence that justified listing this person, checked against source before storage by api/_intent.ts. A score is arguable; a quote is not.';
COMMENT ON COLUMN public.pilot_deals.last_post_at IS
  'When the evidence was published. Read through public.intent_live_score so a stale quote stops counting as a live trigger at the same 90-day cliff the ranker uses.';

-- ── The drifted columns ────────────────────────────────────────────────────
-- intent_stance, intent_evidence, intent_evidence_url and posts_sample are
-- written by api/network/enrich-person.ts, constrained by migration
-- 20260915200000, returned by network_search and read by the 20260915230000
-- patch. No migration ever adds them: 20260915180000 adds the other eight.
-- They exist in production (confirmed by readback), so this is a no-op there
-- and a repair for anyone running a clean `supabase db reset`, where
-- migration 20260915200000 currently fails on a column that does not exist.
ALTER TABLE public.contact_intelligence
  ADD COLUMN IF NOT EXISTS intent_stance       text,
  ADD COLUMN IF NOT EXISTS intent_evidence     text,
  ADD COLUMN IF NOT EXISTS intent_evidence_url text,
  ADD COLUMN IF NOT EXISTS posts_sample        jsonb;
