-- Allow guests to be 'skipped' from triage.
--
-- The Visibility → Inbound swipe deck rejects a guest via /api/triage/reject,
-- which sets status='skipped' + skipped_at. But the original guests CHECK
-- constraint (2026-05-22 pr4) never included 'skipped' and the column never
-- existed, so every left-swipe failed the constraint, returned {ok:false}, and
-- bounced the card back with "Could not update — try again". 'skipped' was
-- always the intended terminal state (the 2026-05-26 classification backfill
-- already references status NOT IN ('skipped','done')); this catches the schema
-- up. Additive + backward-compatible: widens the constraint and adds a nullable
-- column, no data rewrite.
--
-- Applied to the live project via Supabase MCP apply_migration. This file is the
-- canonical record for the repo.

ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS guests_status_check;

ALTER TABLE public.guests ADD CONSTRAINT guests_status_check
  CHECK (status IN (
    'scouted','enriched','pitched','responded','scheduled',
    'confirmed','recorded','published','dropped','skipped'
  ));

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS skipped_at timestamptz;
