-- Retire the synthetic validation jobs and give the queue a way to hide them.
--
-- Two video_studio_jobs were written into production by hand on 5 September
-- as activation proof ("Private vertical slice", "Private vertical slice
-- baseline"). They are not content, they have no media, and the queue
-- faithfully showed them with a live decision button. A retired job keeps
-- every row and every event (the ledgers are append-only) and simply leaves
-- the actionable queue and the runner watch.

begin;

alter table public.video_studio_jobs
  add column if not exists retired_at timestamptz,
  add column if not exists retired_reason text check (retired_reason is null or retired_reason ~ '^[a-z][a-z0-9_]{1,63}$');

create index if not exists video_studio_jobs_retired_idx
  on public.video_studio_jobs (retired_at)
  where retired_at is not null;

update public.video_studio_jobs
set retired_at = now(), retired_reason = 'synthetic_validation_2026_09_05'
where job_id in ('20260905-built_with_ai-e999681c', '20260905-built_with_ai-5ae182f0')
  and retired_at is null;

comment on column public.video_studio_jobs.retired_at is
  'Set when a job leaves the review queue for good: synthetic validation rows, abandoned work. Rows and events are kept.';

commit;
