\set ON_ERROR_STOP on

begin;
select * from public.video_studio_project_review(
  repeat('a', 64), 'unknown',
  '42000000-0000-4000-8000-000000000002'::uuid,
  repeat('4', 64),
  video_studio_concurrency_test.projection(
    'job-concurrent-new', 'youtube_shorts', repeat('c', 64), repeat('d', 64),
    '43000000-0000-4000-8000-000000000002'::uuid
  )
);
select pg_catalog.pg_sleep(5);
commit;
