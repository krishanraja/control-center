-- One-off: clear the content decision backlog that had no way to age out.
--
-- Context (2026-08-25): the Content tab's Queue had 74 pending decision cards
-- reaching back to 2026-W28. The top card was the brief review for "The
-- Governance Gap Is Now a Balance Sheet Problem", assembled 10 July, still on
-- screen 46 days later.
--
-- Three faults produced it, all fixed in the same change as this file:
--
--   1. The read had no week bound. src/hooks/useContentV2.ts asked for
--      status='pending' ordered created_at ASC, limit 30 — the thirty OLDEST
--      cards ever written. With 74 pending, W32/W33/W34 were unreachable, so
--      the current week's brief never appeared at all. The deck then sorts
--      brief_review first (MobileDecisionDeck.tsx), which pinned the oldest
--      unreviewed brief to slot 1 permanently.
--
--   2. Nothing aged the rows. api/purge/run.ts swept kind='purge_preview' and
--      nothing else, so brief_review, shift_proposal, shift_fading, graduation
--      and investigation cards were cleared only by Krish tapping them.
--
--   3. The brief archive never fired. The same cron archived briefs filtered
--      to status IN ('pushed','sent'), but no brief has ever been pushed or
--      sent — all eight runs logged briefs_archived: []. Seven briefs sat at
--      ready/in_review/approved forever, and the hero read accepts exactly
--      those three statuses.
--
-- The code fix ages both surfaces from now on. This file is the one-off that
-- clears what accumulated before it, applied once via the Management API.
--
-- BOUNDARY: '2026-W34', the start of the deck's read window on the day this
-- ran (QUEUE_WEEK_SPAN = 2). Not the current week. The rule the purge now
-- follows is "sweep only what has already scrolled out of view", so W34 — last
-- week, still visible, still the only brief until Friday's assemble — is left
-- alone. W28 through W33 go.
--
-- Reversible: nothing is deleted. Decisions move pending -> dismissed with a
-- resolution naming this sweep, briefs move to 'archived' with their bodies and
-- versions intact. Both are recoverable by week from the resolution stamp.

begin;

-- 64 rows: W28 (6), W29 (1), W31 (40), W32 (8), W33 (9).
--
-- 'dismissed', not 'done', and no feedback_queue row: nothing here was judged,
-- so nothing should teach. api/content-decisions/[id].ts draws the same line —
-- only an explicit reject writes the -1 that Vera clusters.
update public.content_decisions
   set status      = 'dismissed',
       resolved_at = now(),
       resolution  = jsonb_build_object(
         'action',    'expired_unreviewed',
         'at',        now(),
         'swept_by',  'backlog-sweep-2026-08-25',
         'note',      'Aged out by the one-off sweep; never reviewed.'
       )
 where status = 'pending'
   and week  < '2026-W34';

-- 6 rows: W28 in_review, W29 in_review, W30 approved, W31 ready, W32 ready,
-- W33 in_review. W30 is the one that shows why 'approved' is included — it has
-- sat approved-but-never-pushed since 24 July, and every filter that exempted
-- it is why it never left.
update public.weekly_briefs
   set status       = 'archived',
       purge_ran_at = now(),
       updated_at   = now()
 where week < '2026-W34'
   and status in ('ready', 'in_review', 'approved', 'pushed', 'sent');

insert into public.audit_log (event_type, actor, target, details)
values (
  'content_backlog_sweep',
  'content-engine-v2',
  'content_decisions,weekly_briefs',
  jsonb_build_object(
    'boundary',       '2026-W34',
    'reason',         'one-off clear of the backlog that predates the ageing fix',
    'migration',      '2026-08-25-content-queue-backlog-sweep.sql'
  )::text   -- audit_log.details is text, not jsonb
);

commit;
