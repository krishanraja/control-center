\set ON_ERROR_STOP on

do $$
declare
  v_result record;
begin
  select * into v_result
  from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '42000000-0000-4000-8000-000000000003'::uuid,
    repeat('5', 64),
    video_studio_concurrency_test.projection(
      'job-concurrent-new', 'linkedin', repeat('6', 64), repeat('7', 64),
      '43000000-0000-4000-8000-000000000003'::uuid
    )
  );
  if v_result.duplicate then
    raise exception 'different concurrent projection was incorrectly deduplicated';
  end if;
end;
$$;
