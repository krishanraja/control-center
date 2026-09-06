\set ON_ERROR_STOP on

do $$
begin
  if (select pg_catalog.count(*) from public.video_studio_projection_events
      where job_id = 'job-concurrent-idempotency') <> 1
    or (select pg_catalog.count(*) from public.video_studio_review_requests
        where job_id = 'job-concurrent-idempotency') <> 1 then
    raise exception 'concurrent idempotency retry left duplicate durable state';
  end if;

  if (select pg_catalog.count(*) from public.video_studio_projection_events
      where job_id = 'job-concurrent-new') <> 2
    or (select pg_catalog.count(*) from public.video_studio_job_platform_states
        where job_id = 'job-concurrent-new') <> 2 then
    raise exception 'different-key first projections did not serialize into one job';
  end if;

  if (select pg_catalog.count(*) from public.video_studio_commands
      where job_id = 'job-concurrent-command' and status in ('queued', 'leased')) <> 1
    or exists (
      select 1 from public.video_studio_commands
      where id = '44000000-0000-4000-8000-000000000002'::uuid
    ) then
    raise exception 'competing cross-platform commands survived the global in-flight fence';
  end if;
end;
$$;

drop schema video_studio_concurrency_test cascade;
