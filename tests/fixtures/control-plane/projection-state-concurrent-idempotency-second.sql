\set ON_ERROR_STOP on

do $$
declare
  v_result record;
begin
  select * into v_result
  from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '42000000-0000-4000-8000-000000000001'::uuid,
  pg_catalog.md5('concurrent-idempotency') || pg_catalog.md5('projection:exact'),
    video_studio_concurrency_test.projection(
      'job-concurrent-idempotency', 'youtube_shorts', repeat('c', 64), repeat('d', 64),
      '43000000-0000-4000-8000-000000000001'::uuid
    )
  );
  if not v_result.duplicate then
    raise exception 'concurrent exact retry did not return the committed projection event';
  end if;
end;
$$;
