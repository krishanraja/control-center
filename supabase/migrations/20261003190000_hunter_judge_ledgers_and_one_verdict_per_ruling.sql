-- hunter: one verdict per ruling, a judge's record on every role, and ledgers
-- for the two things that cost money.
--
-- Written 2026-10-03 from the audit of hunter's sourcing and judging. Each part
-- names the failure it answers.
--
-- 1. hunter_verdict_events held 1,537 rows for 243 roles. The unique key was
--    (job_id, verdict, reason_code, reason_text), and Postgres treats NULLs as
--    distinct, so every "go" with a NULL reason_code was appended again on
--    every run (1,290 duplicates). The duplicates are MOVED to a dated backup
--    table, not deleted, so this is reversible: insert them back and restore
--    the old constraint. The key becomes NULLS NOT DISTINCT (Postgres 15+),
--    which the existing upserts (on_conflict on the same four columns) match.
--
-- 2. hunter_commands accepted only 'source' and 'packages', so the Process
--    button in Control Center could never queue, and there was no way to
--    record a scheduled full run. Adds 'process' and 'run'.
--
-- 3. hunter_seen_roles gains the judge's record: what it decided, how sure it
--    was, its answer to each question with the quotes it relied on, and which
--    model actually answered. A refusal nobody can read is a refusal nobody
--    can correct.
--
-- 4. hunter_apify_runs: every paid run, its cap as Apify applied it, and what
--    it cost. Until now the only record of spend was a summary line.
--
-- 5. hunter_judge_calls: tokens and dollars per judgement, so the judge's cost
--    is measured rather than estimated.
--
-- 6. hunter_misses: a role he found somewhere else that hunter never surfaced,
--    with the cause and the fix. Recall is measured from these.
--
-- RLS is enabled with no policies on the new tables: hunter writes with the
-- service role, which bypasses RLS, and nothing anonymous should read them.

begin;

-- 1. verdict events -----------------------------------------------------------
-- Defaults only: the copy must not inherit the unique key, or two identical
-- duplicates could not both be kept.
create table if not exists hunter_verdict_events_dupes_20261003
  (like hunter_verdict_events including defaults);
alter table hunter_verdict_events_dupes_20261003 enable row level security;

with ranked as (
  select id, row_number() over (
    partition by job_id, verdict, coalesce(reason_code, ''), coalesce(reason_text, '')
    order by recorded_at, id) as rn
  from hunter_verdict_events
), moved as (
  delete from hunter_verdict_events e
  using ranked r
  where e.id = r.id and r.rn > 1
  returning e.*
)
insert into hunter_verdict_events_dupes_20261003 select * from moved;

alter table hunter_verdict_events
  drop constraint if exists hunter_verdict_events_job_id_verdict_reason_code_reason_tex_key;
alter table hunter_verdict_events
  add constraint hunter_verdict_events_one_per_ruling
  unique nulls not distinct (job_id, verdict, reason_code, reason_text);

-- 2. commands -----------------------------------------------------------------
alter table hunter_commands drop constraint if exists hunter_commands_command_check;
alter table hunter_commands add constraint hunter_commands_command_check
  check (command = any (array['source', 'packages', 'process', 'run']));

-- 3. the judge's record on every role -----------------------------------------
alter table hunter_seen_roles
  add column if not exists judge_verdict text
    check (judge_verdict in ('present', 'hold', 'reject')),
  add column if not exists judge_fit smallint check (judge_fit between 0 and 10),
  add column if not exists judge_confidence text,
  add column if not exists judge_answers jsonb,
  add column if not exists judge_red_flags jsonb,
  add column if not exists judge_model text,
  add column if not exists judge_served_model text,
  add column if not exists judge_prompt_version text,
  add column if not exists judge_at timestamptz,
  add column if not exists audit_sample boolean not null default false;
create index if not exists hunter_seen_roles_judge
  on hunter_seen_roles (judge_verdict, judge_at desc);

-- 4. every paid Apify run -----------------------------------------------------
create table if not exists hunter_apify_runs (
  run_id text primary key,
  actor_id text not null,
  purpose text not null,
  query_key text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  max_charge_usd numeric,
  applied_cap_usd numeric,
  max_items integer,
  status text,
  items integer,
  usage_usd numeric
);
create index if not exists hunter_apify_runs_started on hunter_apify_runs (started_at desc);
alter table hunter_apify_runs enable row level security;

-- 5. every judgement's cost ---------------------------------------------------
create table if not exists hunter_judge_calls (
  id bigint generated always as identity primary key,
  job_id text,
  purpose text not null default 'judge',
  model text not null,
  served_model text,
  input_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  output_tokens integer,
  usd numeric,
  at timestamptz not null default now()
);
create index if not exists hunter_judge_calls_at on hunter_judge_calls (at desc);
alter table hunter_judge_calls enable row level security;

-- 6. roles he found that hunter did not ---------------------------------------
create table if not exists hunter_misses (
  id bigint generated always as identity primary key,
  url text,
  company text,
  title text,
  found_via text,
  cause text,
  fixed_by text,
  at timestamptz not null default now()
);
alter table hunter_misses enable row level security;

commit;
