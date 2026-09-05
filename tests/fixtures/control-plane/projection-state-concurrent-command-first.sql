\set ON_ERROR_STOP on

begin;
insert into public.video_studio_commands (
  id, job_id, platform, review_id, command_kind, status,
  expected_parent_revision_hash, expected_parent_artifact_hash,
  semantic_target_map_hash, candidate_hash, payload, payload_hash,
  command_hash, idempotency_key, requested_by
) values (
  '44000000-0000-4000-8000-000000000001'::uuid,
  'job-concurrent-command', 'youtube_shorts',
  '41000000-0000-4000-8000-000000000001'::uuid,
  'magic_edit_activate', 'queued', repeat('a', 64), repeat('c', 64),
  repeat('d', 64), repeat('8', 64), '{}'::jsonb, repeat('9', 64), repeat('1', 64),
  '44000000-0000-4000-8000-000000000001'::uuid, 'operator'
);
select pg_catalog.pg_sleep(5);
commit;
