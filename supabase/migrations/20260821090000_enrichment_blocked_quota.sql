-- A terminal state for "the enrichment could not finish because an API was out
-- of credits", distinct from "the enrichment failed".
--
-- ── Why this is not just `failed` ──────────────────────────────────────────
-- Because they need opposite responses, and merging them loses the one signal
-- that matters.
--
--   failed         something went wrong in this run. Transient. Retry.
--   blocked_quota  the account cannot serve the call at all. Retrying changes
--                  nothing until somebody tops up or rotates a key.
--
-- Before this, api/contacts/[id]/enrich.ts had two outcomes: 'enriched', or
-- 'failed' on a thrown error. A provider that answered 402 did not throw — the
-- provider helpers in _enrich.ts catch everything and return '' — so a run
-- where People Data Labs was dry and Perplexity was rate limited wrote a thin
-- Claude-only summary and set 'enriched'. Nothing anywhere recorded that three
-- of four sources never ran, and because the row then carried a dossier, the
-- `already_enriched` guard meant it would never be attempted again.
--
-- Krish, on the requirement: "if there are not enough api credits anywhere, I
-- need an alert rather than just half enriching."
--
-- So api/network/enrich-person.ts writes this status instead of writing a
-- partial record, and raises an alert through _alert.ts (Telegram +
-- api_usage_state.last_status + audit_log). The row keeps its old judgment
-- layer untouched and stays eligible for a re-run.
--
-- Additive only: every existing value stays legal, so nothing needs backfilling
-- and the pre-v2 surfaces that read this column are unaffected.

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_enrichment_status_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_enrichment_status_check
  CHECK (enrichment_status = ANY (ARRAY[
    'none'::text,
    'queued'::text,
    'enriching'::text,
    'enriched'::text,
    'failed'::text,
    'blocked_quota'::text
  ]));

COMMENT ON COLUMN public.contacts.enrichment_status IS
  'none | queued | enriching | enriched | failed | blocked_quota. blocked_quota means a paid API refused for credit/auth/rate reasons and NOTHING partial was written — retry after a top-up, not before. Never set alongside a dossier.';

-- Partial index over the rows an operator has to act on. Both are small and
-- both are questions asked by hand ("what is stuck?"), so this stays cheap.
CREATE INDEX IF NOT EXISTS contacts_enrichment_attention_idx
  ON public.contacts (enrichment_status, updated_at DESC)
  WHERE enrichment_status IN ('blocked_quota', 'failed');
