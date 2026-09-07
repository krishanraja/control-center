-- content_engine_runs: one row per run of a Content Engine cron.
--
-- Until now a cron that skipped itself (pool not configured, corpus too
-- thin, nothing to surface) returned 200 with a reason nobody read, and a
-- cron that stopped firing left no trace at all. This ledger is what the
-- Content tab reads to say "the feed has not run since Tuesday" in the same
-- strip as every other obligation. The OS is pull-only, so a stale job is
-- surfaced here, never pushed.

begin;

create table public.content_engine_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job ~ '^[a-z][a-z0-9_]{1,63}$'),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual', 'watch')),
  status text not null check (status in ('ok', 'skipped', 'failed')),
  reason text check (reason is null or char_length(reason) <= 600),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  constraint content_engine_runs_time_order check (finished_at >= started_at)
);

create index content_engine_runs_job_finished_idx
  on public.content_engine_runs (job, finished_at desc);

alter table public.content_engine_runs enable row level security;

-- The dashboard reads the ledger with the anon key like every other Content
-- table; only the service role (the crons) writes it.
grant select on public.content_engine_runs to anon;
grant select, insert on public.content_engine_runs to service_role;

create policy content_engine_runs_anon_read on public.content_engine_runs
  for select to anon using (true);
create policy content_engine_runs_service_all on public.content_engine_runs
  for all to service_role using (true) with check (true);

comment on table public.content_engine_runs is
  'One row per Content Engine cron run: ok, skipped with a reason, or failed. Read by the Content tab to surface a job that stopped running.';

commit;
