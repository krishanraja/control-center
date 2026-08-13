-- Make the lens radar's upsert actually able to land.
--
-- THE BUG. lens_seed_candidates was created with a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX lens_seed_candidates_fp_uidx
--     ON public.lens_seed_candidates (fingerprint)
--     WHERE fingerprint IS NOT NULL;
--
-- Postgres will only use a partial unique index for ON CONFLICT if the
-- statement repeats the index predicate: ON CONFLICT (fingerprint) WHERE
-- fingerprint IS NOT NULL. PostgREST's `onConflict: 'fingerprint'` emits the
-- plain form, so every write failed with
--
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- api/discover-lens-radar.ts returns that as a 500. It has therefore failed on
-- every run since the table was created on 2026-06-30, and the table has never
-- held a row. The cron fires Mondays at 09:00, so that is six weeks of a
-- working radar throwing away everything it found: a dry run on 2026-08-13
-- surfaced 24 on-thesis candidates including named authors.
--
-- It stayed invisible because the only symptom was a non-2xx on a cron nobody
-- reads, and the one consumer (the seed rail, and now the guest scout's radar
-- source) degrades quietly to an empty list rather than complaining.
--
-- THE FIX. A full unique index. fingerprint is always computed from the title
-- by the writer, so the partial predicate was never buying anything; and
-- Postgres treats NULLs as distinct in a unique index by default, so rows
-- without a fingerprint still insert freely, exactly as the partial index
-- intended.

drop index if exists public.lens_seed_candidates_fp_uidx;

create unique index if not exists lens_seed_candidates_fp_uidx
  on public.lens_seed_candidates (fingerprint);

comment on index public.lens_seed_candidates_fp_uidx is
  'Full, not partial. A partial unique index cannot satisfy PostgREST''s ON CONFLICT (fingerprint), which is what kept this table empty from 2026-06-30 to 2026-08-13.';
