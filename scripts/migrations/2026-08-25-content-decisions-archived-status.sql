-- 'archived' becomes a first-class resting place for content decisions.
--
-- Context (2026-08-25): the ageing sweep added in the same change had nowhere
-- honest to put a card that timed out. content_decisions.status allowed only
-- pending / done / dismissed, so a card Krish never saw landed in 'dismissed'
-- — the same bucket as a card he looked at and refused.
--
-- That conflation is cheap to create and expensive to undo. The two mean
-- opposite things:
--
--   dismissed = Krish ruled on it. "Not now" or "not for me". A signal about
--               his taste, however small, and the thing a future comparison is
--               actually asking about.
--   archived  = nobody ruled on it. The week passed and it aged out unseen.
--               Evidence about what the engine PRODUCED, not about what he
--               wanted. Counting these as rejections would teach the opposite
--               of the truth.
--
-- Nothing is deleted at either status. Both keep their full payload — title,
-- summary, implication, category, source and story counts — plus `ref` to the
-- shift or brief they came from and the original created_at. The Content tab
-- reads status='pending' and nothing else, so archived rows simply stop
-- competing for attention while staying queryable forever.
--
-- Safe to apply against live data: widening a CHECK never rejects an existing
-- row, and every reader in api/ and src/ selects on status='pending'.

begin;

alter table public.content_decisions
  drop constraint if exists content_decisions_status_check;

alter table public.content_decisions
  add constraint content_decisions_status_check
  check (status = any (array['pending', 'done', 'dismissed', 'archived']::text[]));

-- Re-home the 64 rows the backlog sweep moved an hour earlier. They were
-- written as 'dismissed' only because 'archived' did not exist yet; the
-- resolution already recorded the truth (action = 'expired_unreviewed'), so
-- this promotes that from a JSON detail to the column that queries use.
update public.content_decisions
   set status = 'archived'
 where status = 'dismissed'
   and resolution->>'action' = 'expired_unreviewed';

-- The archive is meant to be read. The existing (status, week desc, kind)
-- index serves it, but this makes the intent explicit for the comparison
-- queries this status exists to support.
create index if not exists content_decisions_archived_idx
  on public.content_decisions (week desc, kind)
  where status = 'archived';

insert into public.audit_log (event_type, actor, target, details)
values (
  'content_decisions_archived_status',
  'content-engine-v2',
  'content_decisions',
  jsonb_build_object(
    'reason',    'separate aged-out cards from cards Krish actually ruled on',
    'migration', '2026-08-25-content-decisions-archived-status.sql'
  )::text
);

commit;
