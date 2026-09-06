-- The scorecard (2026-09-06): job 2, keep him honest.
--
-- Twelve weeks ending on Fridays, 11 September to 27 November 2026, six
-- columns: approaches sent, calls taken, paid rooms, cash invoiced (GBP),
-- pieces published, hours building unasked. Targets by day 90 (5 December):
-- 25, 5, 1, 15000, 12, 0. Stop rule read on 5 October: fewer than 2 of 25
-- took a call, or no paid room (docs/plans/one-swing/CHARTER.md).
--
-- Two tables.
--   scorecard_weeks       one row per Friday. The six derived columns are
--                         written by the Friday freeze (api/scorecard/friday.ts)
--                         from the ships ledger, room_targets and
--                         build_activity_weeks; until then the GET route derives
--                         the week live. The six override_* twins are the
--                         operator's corrections and win when not null, so a
--                         call taken off the record can still be counted without
--                         inventing a ledger row for it. plan_sent and
--                         variance_note are the Friday note; frozen_at marks the
--                         week as closed.
--   build_activity_weeks  the Rule 6 tripwire's evidence. Commits by Krish across
--                         GITHUB_REPOS in the week (api/scorecard/github-sync.ts)
--                         and the hours those imply at hours_per_commit. The
--                         hours are an estimate and are labelled as one wherever
--                         they render; the commit count is the fact.
--
-- Both are read and written through api/scorecard/* with the service role.
-- RLS is enabled and forced with no policies, and the anon and authenticated
-- roles are revoked, so the browser bundle cannot read or edit the score
-- straight from PostgREST. Same posture as bridge_candidates
-- (docs/DECISIONS/011).

CREATE TABLE IF NOT EXISTS public.scorecard_weeks (
  week_ending                 date PRIMARY KEY,
  approaches_sent             integer NOT NULL DEFAULT 0,
  calls_taken                 integer NOT NULL DEFAULT 0,
  paid_rooms                  integer NOT NULL DEFAULT 0,
  cash_invoiced_gbp           numeric NOT NULL DEFAULT 0,
  pieces_published            integer NOT NULL DEFAULT 0,
  unasked_hours               numeric NOT NULL DEFAULT 0,
  override_approaches_sent    integer,
  override_calls_taken        integer,
  override_paid_rooms         integer,
  override_cash_invoiced_gbp  numeric,
  override_pieces_published   integer,
  override_unasked_hours      numeric,
  plan_sent                   integer,
  variance_note               text,
  frozen_at                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scorecard_weeks IS
  'One row per scorecard Friday. Derived columns are frozen by api/scorecard/friday.ts; override_* columns are operator corrections and win when not null.';

CREATE TABLE IF NOT EXISTS public.build_activity_weeks (
  week_ending       date PRIMARY KEY,
  commits           integer NOT NULL DEFAULT 0,
  hours_estimate    numeric NOT NULL DEFAULT 0,
  hours_per_commit  numeric NOT NULL DEFAULT 0.5,
  repos             jsonb NOT NULL DEFAULT '[]'::jsonb,
  author            text,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.build_activity_weeks IS
  'Rule 6 tripwire evidence: commits by the operator per scorecard week and the hours they imply. hours_estimate is an estimate (commits times hours_per_commit), never a measurement.';

-- Service role only. No policies on purpose: a table with RLS forced and no
-- policy is readable by nobody but the role that bypasses RLS, and every read
-- and write goes through api/scorecard/*.
ALTER TABLE public.scorecard_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_weeks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.scorecard_weeks FROM anon, authenticated;

ALTER TABLE public.build_activity_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_activity_weeks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.build_activity_weeks FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
