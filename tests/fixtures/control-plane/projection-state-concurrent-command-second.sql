\set ON_ERROR_STOP on

do $$
declare
  v_failed boolean := false;
begin
  begin
    insert into public.video_studio_commands (
      id, job_id, platform, review_id, command_kind, status,
      expected_parent_revision_hash, expected_parent_artifact_hash,
      semantic_target_map_hash, candidate_hash, payload, payload_hash,
      command_hash, idempotency_key, requested_by
    ) values (
      '44000000-0000-4000-8000-000000000002'::uuid,
      'job-concurrent-command', 'linkedin',
      '41000000-0000-4000-8000-000000000002'::uuid,
      'magic_edit_activate', 'queued', repeat('a', 64), repeat('6', 64),
      repeat('7', 64), repeat('2', 64), '{}'::jsonb, repeat('3', 64), repeat('4', 64),
      '44000000-0000-4000-8000-000000000002'::uuid, 'operator'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'command_in_flight' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'a second platform command queued while another command was in flight';
  end if;
end;
$$;
