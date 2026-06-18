-- Content tab rebuild — P-3 DB hygiene (2026-06-17)
--
-- Problem (see docs/plans/content-tab-rebuild/CORE_PROBLEM.md):
-- the relabel-only "advance" buttons (deck →, "Greenlight → drafting",
-- "Send to research") push cards into `drafting`/`review` WITHOUT producing a
-- body. The result: empty-body cards masquerading as "in review / drafting".
-- Dry-run on prod 2026-06-17: 25 active = 13 review (4 empty-body) + 12 drafting
-- (11 empty-body). 15 zombie rows total. All 15 carry a thesis (researched but
-- never drafted), so the honest state for every one is `researching`.
--
-- Em-dash backfill: NOT NEEDED. Audit of all 309 rows found zero em/en dashes in
-- idea/thesis/body — sanitizeVoice() on write already keeps stored data clean.
--
-- This migration is REVERSIBLE. Per-row prior state is captured in
-- docs/plans/content-tab-rebuild/p3-reversal-snapshot.json. Rollback query at
-- the bottom.
--
-- Honest mapping (J-01):
--   empty body + has thesis -> 'researching'  (researched, not yet drafted)
--   empty body + no thesis   -> 'seeded'        (raw idea)

with corrected as (
  update content_ideas
  set state = case
    when coalesce(nullif(btrim(thesis), ''), '') <> '' then 'researching'
    else 'seeded'
  end
  where state in ('review', 'drafting')
    and buried_at is null
    and coalesce(length(btrim(body)), 0) = 0
  returning id, state as to_state
)
insert into audit_log (event_type, actor, target, details)
select
  'content_state_corrected',
  'content-tab-rebuild-p3',
  id,
  json_build_object(
    'to', to_state,
    'reason', 'empty body advanced to review/drafting by relabel-only action; demoted to honest state'
  )::text
from corrected;

-- Verify (expect 0):
--   select count(*) from content_ideas
--   where state in ('review','drafting') and buried_at is null
--     and coalesce(length(btrim(body)),0) = 0;

-- Rollback (restore prior states from the snapshot file). Example for the
-- review rows; adjust ids from p3-reversal-snapshot.json:
--   update content_ideas set state = 'review'
--   where id in ( /* the 4 review ids from the snapshot */ );
--   update content_ideas set state = 'drafting'
--   where id in ( /* the 11 drafting ids from the snapshot */ );
