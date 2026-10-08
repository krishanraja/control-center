-- A note starts a walkthrough.
--
-- Krish, 2026-10-08: "Whenever I give a long ramble into control centre about
-- what I want to get done, it's probably best that it triggers something in
-- this session ... I'd rather walk through what I actually need on each piece
-- with you like this and have options to choose from, and then have you draft
-- it from the Claude subscription (as opposed to from the API control centre)."
--
-- When a note read completes, api/strategist.ts fires a Claude Code routine
-- (api/_walkthrough.ts). The routine starts a session on his subscription that
-- runs .claude/skills/walkthrough/SKILL.md against the read. Two tables:
--
--   walkthrough_runs   one row per read: did a session start, and where.
--                      The unique read_id is the idempotency key the fire
--                      endpoint does not have: a second fire for the same read
--                      is refused here, before any HTTP call is made.
--   walkthrough_steps  what actually happened to each step, in his words.
--                      The outcome vocabulary exists because on 2026-10-08 a
--                      "Done" chip was read as "he did it" when he meant "help
--                      me do it". Only did_it and done_together are done.
--
-- Additive and idempotent. Service role only, like strategist_reads.

create table if not exists public.walkthrough_runs (
  id            uuid primary key default gen_random_uuid(),
  read_id       uuid not null unique references public.strategist_reads(id) on delete cascade,
  status        text not null default 'firing',
  fired_by      text not null default 'auto',
  attempts      int  not null default 1,
  session_id    text,
  session_url   text,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint walkthrough_runs_status_check check (status in ('firing', 'started', 'failed', 'not_configured')),
  constraint walkthrough_runs_fired_by_check check (fired_by in ('auto', 'button')),
  -- A started run says where it started; a failed one says why.
  constraint walkthrough_runs_started_has_url check (status <> 'started' or session_url is not null),
  constraint walkthrough_runs_failed_says_why check (status not in ('failed', 'not_configured') or error is not null),
  constraint walkthrough_runs_error_is_short check (error is null or length(error) <= 300)
);

comment on table public.walkthrough_runs is
  'One Claude Code walkthrough session per strategist note read. Written by api/_walkthrough.ts. The unique read_id is the idempotency key: the routine fire endpoint has none, so a retry without this row would start a second session.';

create table if not exists public.walkthrough_steps (
  id             uuid primary key default gen_random_uuid(),
  read_id        uuid not null references public.strategist_reads(id) on delete cascade,
  step_key       text not null,
  suggestion_id  uuid,
  title          text not null,
  outcome        text not null,
  artifact       text,
  note           text,
  session_url    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint walkthrough_steps_read_step_unique unique (read_id, step_key),
  constraint walkthrough_steps_outcome_check check (
    outcome in ('done_together', 'did_it', 'drafted', 'later', 'dropped')
  ),
  constraint walkthrough_steps_title_fits check (length(title) between 1 and 300),
  constraint walkthrough_steps_artifact_fits check (artifact is null or length(artifact) <= 20000)
);

comment on table public.walkthrough_steps is
  'What happened to each step of a walkthrough. done_together and did_it are the only outcomes that mean done; drafted means the words exist and he still has to send or post them; later and dropped are his calls. A later session reads this first and resumes.';

comment on column public.walkthrough_steps.outcome is
  'done_together: finished in the session. did_it: he says he did it himself. drafted: the draft exists, his action (send, post, order) is still to come. later: moved, with the day in note. dropped: not doing it.';

create index if not exists walkthrough_steps_read_idx on public.walkthrough_steps (read_id, created_at);

alter table public.walkthrough_runs enable row level security;
revoke all on public.walkthrough_runs from anon, authenticated;
grant all on public.walkthrough_runs to service_role;
drop policy if exists "walkthrough_runs service all" on public.walkthrough_runs;
create policy "walkthrough_runs service all" on public.walkthrough_runs
  for all to service_role using (true) with check (true);

alter table public.walkthrough_steps enable row level security;
revoke all on public.walkthrough_steps from anon, authenticated;
grant all on public.walkthrough_steps to service_role;
drop policy if exists "walkthrough_steps service all" on public.walkthrough_steps;
create policy "walkthrough_steps service all" on public.walkthrough_steps
  for all to service_role using (true) with check (true);
