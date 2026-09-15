-- A partial enrichment is a status, not a footnote in the response body.
--
-- api/network/enrich-person.ts already told the caller the truth. Its response
-- carries status 'enriched_degraded' when a provider refused but the run found
-- enough to keep, and it raises the quota alert for that case. What it wrote to
-- the row was 'enriched', flat, so the contacts table said a clean enrichment for
-- a person enriched without LinkedIn, or without the judgment layer, and every
-- surface that reads the row rather than that one response believed it.
--
-- check-enrichment-honesty.mts caught it, correctly, and main sat red on it.
--
-- Additive only: every existing value stays legal, nothing needs backfilling. A
-- row already written 'enriched' during a degraded run stays 'enriched'. It is
-- not worth guessing which ones those were, and the next enrichment of that
-- person records it properly.

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_enrichment_status_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_enrichment_status_check
  CHECK (enrichment_status = ANY (ARRAY[
    'none'::text,
    'queued'::text,
    'enriching'::text,
    'enriched'::text,
    'enriched_degraded'::text,
    'failed'::text,
    'blocked_quota'::text
  ]));

COMMENT ON COLUMN public.contacts.enrichment_status IS
  'none | queued | enriching | enriched | enriched_degraded | failed | blocked_quota. '
  'blocked_quota means a paid API refused for credit/auth/rate reasons and NOTHING '
  'partial was written, so retry after a top-up and not before. enriched_degraded '
  'means a provider refused and the run kept what it found anyway: the row is usable, '
  'it is not complete, and it is worth re-running once the provider is back. Never '
  'set blocked_quota alongside a dossier.';

-- The rows an operator has to act on. A degraded row is one of them: it is the
-- only way to find who was enriched without a provider once the alert email has
-- been read and forgotten.
DROP INDEX IF EXISTS contacts_enrichment_attention_idx;
CREATE INDEX IF NOT EXISTS contacts_enrichment_attention_idx
  ON public.contacts (enrichment_status, updated_at DESC)
  WHERE enrichment_status IN ('blocked_quota', 'failed', 'enriched_degraded');
