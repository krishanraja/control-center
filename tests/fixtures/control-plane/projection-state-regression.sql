\set ON_ERROR_STOP on

begin;

create function pg_temp.video_studio_test_state(
  p_platform text,
  p_active_revision_hash text,
  p_active_artifact_hash text,
  p_active_candidate_hash text,
  p_parent_revision_hash text,
  p_parent_artifact_hash text,
  p_parent_candidate_hash text,
  p_semantic_target_map_hash text,
  p_editorial_state text,
  p_route_state text
) returns jsonb
language sql
as $$
  select pg_catalog.jsonb_build_object(
    'platform', p_platform,
    'active_revision_hash', p_active_revision_hash,
    'active_artifact_hash', p_active_artifact_hash,
    'active_candidate_hash', p_active_candidate_hash,
    'parent_revision_hash', p_parent_revision_hash,
    'parent_artifact_hash', p_parent_artifact_hash,
    'parent_candidate_hash', p_parent_candidate_hash,
    'semantic_target_map_hash', p_semantic_target_map_hash,
    'editorial_state', p_editorial_state,
    'route_state', p_route_state
  );
$$;

create function pg_temp.video_studio_test_projection(
  p_job_id text,
  p_target_platforms text[],
  p_expected_state jsonb,
  p_desired_state jsonb,
  p_review_id uuid,
  p_source_event_count bigint,
  p_source_event_chain_hash text,
  p_source_revision_hash text
) returns jsonb
language sql
as $$
  select pg_catalog.jsonb_build_object(
    'job', pg_catalog.jsonb_build_object(
      'job_id', p_job_id,
      'series', 'money_of_ai',
      'mode', 'solo',
      'target_platforms', pg_catalog.to_jsonb(p_target_platforms),
      'stage', 'treatment',
      'status', 'active',
      'safe_title', 'Projection state fixture',
      'safe_summary', 'Synthetic metadata-only projection for exact state regression.',
      'source_event_count', p_source_event_count,
      'source_event_chain_hash', p_source_event_chain_hash,
      'source_revision_hash', p_source_revision_hash
    ),
    'expected_platform_state', p_expected_state,
    'platform_state', p_desired_state,
    'review', pg_catalog.jsonb_build_object(
      'id', p_review_id,
      'gate', 'treatment',
      'safe_title', 'Review synthetic treatment',
      'safe_summary', 'The regression fixture carries no media or private content.',
      'parent_revision_hash', p_desired_state ->> 'active_revision_hash',
      'parent_artifact_hash', p_desired_state ->> 'active_artifact_hash',
      'revision_hash', repeat('e', 64),
      'artifact_hash', repeat('f', 64),
      'candidate_hash', null,
      'route_state', p_desired_state ->> 'route_state',
      'safe_payload', pg_catalog.jsonb_build_object(
        'semantic_target_map_hash', p_desired_state ->> 'semantic_target_map_hash',
        'blocking_gates', pg_catalog.jsonb_build_object(
          'truth', pg_catalog.jsonb_build_object('status', 'passed'),
          'rights', pg_catalog.jsonb_build_object('status', 'passed'),
          'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
          'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
          'naming', pg_catalog.jsonb_build_object('status', 'passed')
        )
      ),
      'hard_gates', pg_catalog.jsonb_build_object(
        'truth', pg_catalog.jsonb_build_object('status', 'passed'),
        'rights', pg_catalog.jsonb_build_object('status', 'passed'),
        'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
        'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
        'naming', pg_catalog.jsonb_build_object('status', 'passed')
      ),
      'created_at', '2026-09-05T10:00:00.000Z'
    )
  );
$$;

create function pg_temp.video_studio_legacy_projection(p_projection jsonb)
returns jsonb
language sql
as $$
  select pg_catalog.jsonb_set(
    p_projection - 'expected_platform_state',
    '{job}',
    (p_projection -> 'job')
      - 'source_event_count'
      - 'source_event_chain_hash'
      - 'source_revision_hash'
  );
$$;

create function pg_temp.video_studio_test_projection_hash(
  p_idempotency_key uuid,
  p_salt text default ''
)
returns text
language sql
immutable
as $$
  select pg_catalog.md5('projection:' || p_idempotency_key::text || ':' || p_salt)
    || pg_catalog.md5('fixture:' || p_idempotency_key::text || ':' || p_salt);
$$;

create function pg_temp.video_studio_test_receipt_hash(p_command_id uuid)
returns text
language sql
immutable
as $$
  select pg_catalog.md5('receipt:' || p_command_id::text)
    || pg_catalog.md5('fixture:' || p_command_id::text);
$$;

create function pg_temp.video_studio_expect_projection_error(
  p_idempotency_key uuid,
  p_projection_hash text,
  p_projection jsonb,
  p_expected_error text
) returns void
language plpgsql
as $$
declare
  v_failed boolean := false;
begin
  begin
    perform * from public.video_studio_project_review(
      repeat('a', 64), 'unknown', p_idempotency_key,
      pg_temp.video_studio_test_projection_hash(p_idempotency_key, p_projection_hash), p_projection
    );
  exception when sqlstate 'P0001' then
    if sqlerrm is distinct from p_expected_error then raise; end if;
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'expected %, but projection succeeded', p_expected_error;
  end if;
end;
$$;

create function pg_temp.video_studio_expect_sql_error(
  p_statement text,
  p_expected_error text
) returns void
language plpgsql
as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_statement;
  exception when sqlstate 'P0001' then
    if sqlerrm is distinct from p_expected_error then raise; end if;
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'expected %, but statement succeeded', p_expected_error;
  end if;
end;
$$;

create function pg_temp.video_studio_assert_state(
  p_job_id text,
  p_platform text,
  p_expected jsonb
) returns void
language plpgsql
as $$
declare
  v_actual jsonb;
begin
  select pg_temp.video_studio_test_state(
    platform, active_revision_hash, active_artifact_hash, active_candidate_hash,
    active_parent_revision_hash, active_parent_artifact_hash,
    active_parent_candidate_hash, semantic_target_map_hash,
    editorial_state, route_state
  ) into v_actual
  from public.video_studio_job_platform_states
  where job_id = p_job_id and platform = p_platform;
  if not found or v_actual is distinct from p_expected then
    raise exception 'state assertion failed for %/%: expected %, got %',
      p_job_id, p_platform, p_expected, v_actual;
  end if;
end;
$$;

do $basic$
declare
  v_root_youtube jsonb;
  v_root_linkedin jsonb;
  v_current_youtube jsonb;
  v_current_linkedin jsonb;
  v_desired jsonb;
  v_projection jsonb;
  v_last_projection jsonb;
  v_duplicate boolean;
  v_count integer;
  v_table text;
  v_job_title text;
  v_job_summary text;
begin
  foreach v_table in array array[
    'video_studio_jobs', 'video_studio_job_platform_states',
    'video_studio_review_requests', 'video_studio_commands',
    'video_studio_review_events', 'video_studio_command_receipts',
    'video_studio_preview_upload_slots', 'video_studio_runner_heartbeats',
    'video_studio_rate_limits', 'video_studio_projection_events',
    'video_studio_preview_retention_events', 'video_studio_command_recoveries',
    'video_studio_magic_candidate_lineage'
  ] loop
    if pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'INSERT')
      or pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'UPDATE')
      or pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'DELETE') then
      raise exception 'service_role retains direct DML on %', v_table;
    end if;
  end loop;
  if pg_catalog.has_function_privilege(
    'service_role', 'public.video_studio_preserve_magic_candidate_lineage()', 'EXECUTE'
  ) then
    raise exception 'service_role must not invoke the lineage trigger';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role', 'public.video_studio_project_review(text,text,uuid,text,jsonb)', 'EXECUTE'
  ) then
    raise exception 'service_role lost project-review execute access';
  end if;
  select pg_catalog.count(*) into v_count
  from public.video_studio_magic_candidate_lineage
  where job_id = 'job-upgrade-fixture';
  if v_count <> 1 then
    raise exception 'migration must backfill exactly one valid active upgrade edge';
  end if;
  if (select source_revision_hash from public.video_studio_jobs where job_id = 'job-upgrade-fixture')
      is distinct from repeat('a', 64) then
    raise exception 'unambiguous upgrade revision was not backfilled';
  end if;
  if (select source_revision_hash from public.video_studio_jobs where job_id = 'job-ambiguous-upgrade-fixture')
      is not null then
    raise exception 'ambiguous upgrade revision must remain unset';
  end if;

  v_root_youtube := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  v_projection := pg_temp.video_studio_test_projection(
    'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
    null, v_root_youtube,
    '10000000-0000-4000-8000-000000000001'::uuid,
    1, repeat('3', 64), repeat('0', 64)
  );
  select duplicate into v_duplicate
  from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000001'::uuid),
    v_projection
  );
  if v_duplicate then raise exception 'first projection cannot be duplicate'; end if;
  perform pg_temp.video_studio_assert_state(
    'job-projection-chain', 'youtube_shorts', v_root_youtube
  );
  if (select source_event_count from public.video_studio_jobs where job_id = 'job-projection-chain') <> 1
    or (select source_event_chain_hash from public.video_studio_jobs where job_id = 'job-projection-chain')
      <> repeat('3', 64)
    or (select source_revision_hash from public.video_studio_jobs where job_id = 'job-projection-chain')
      <> repeat('0', 64)
    or (select source_cursor_adopted_at from public.video_studio_job_platform_states
        where job_id = 'job-projection-chain' and platform = 'youtube_shorts') is null then
    raise exception 'first acknowledged projection did not persist its cursor';
  end if;
  select duplicate into v_duplicate
  from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000001'::uuid),
    v_projection
  );
  if not v_duplicate then raise exception 'exact retry must return duplicate'; end if;

  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000002'::uuid, repeat('2', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      null, v_root_youtube,
      '10000000-0000-4000-8000-000000000002'::uuid,
      1, repeat('3', 64), repeat('0', 64)
    ), 'projection_conflict'
  );

  v_root_linkedin := pg_temp.video_studio_test_state(
    'linkedin', repeat('0', 64), repeat('4', 64), null,
    null, null, null, repeat('5', 64), 'needs_visual_review', 'standard'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000003'::uuid, repeat('3', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_root_linkedin, v_root_linkedin,
      '10000000-0000-4000-8000-000000000003'::uuid,
      1, repeat('3', 64), repeat('0', 64)
    ), 'projection_conflict'
  );
  if exists (
    select 1 from public.video_studio_job_platform_states
    where job_id = 'job-projection-chain' and platform = 'linkedin'
  ) then
    raise exception 'failed absent-state CAS created a platform row';
  end if;

  v_projection := pg_temp.video_studio_test_projection(
    'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
    null, v_root_linkedin,
    '10000000-0000-4000-8000-000000000004'::uuid,
    1, repeat('3', 64), repeat('0', 64)
  );
  v_projection := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_projection, '{job,safe_title}',
      pg_catalog.to_jsonb('Second platform display copy'::text)
    ), '{job,safe_summary}',
    pg_catalog.to_jsonb('This review copy must not overwrite global display copy.'::text)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000004'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000004'::uuid),
    v_projection
  );
  select safe_title, safe_summary into v_job_title, v_job_summary
  from public.video_studio_jobs where job_id = 'job-projection-chain';
  if v_job_title <> 'Projection state fixture'
    or v_job_summary <> 'Synthetic metadata-only projection for exact state regression.' then
    raise exception 'equal cursor catch-up rewrote global display copy';
  end if;
  perform pg_temp.video_studio_assert_state(
    'job-projection-chain', 'linkedin', v_root_linkedin
  );

  v_current_youtube := v_root_youtube;
  v_desired := v_current_youtube || pg_catalog.jsonb_build_object(
    'active_revision_hash', repeat('6', 64),
    'semantic_target_map_hash', repeat('7', 64)
  );
  v_projection := pg_temp.video_studio_test_projection(
    'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
    v_current_youtube, v_desired,
    '10000000-0000-4000-8000-000000000005'::uuid,
    2, repeat('8', 64), repeat('6', 64)
  );
  v_projection := pg_catalog.jsonb_set(
    v_projection, '{job,safe_title}',
    pg_catalog.to_jsonb('Higher cursor display copy'::text)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000005'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000005'::uuid),
    v_projection
  );
  v_current_youtube := v_desired;
  if (select source_event_count from public.video_studio_jobs where job_id = 'job-projection-chain') <> 2
    or (select source_event_chain_hash from public.video_studio_jobs where job_id = 'job-projection-chain')
      <> repeat('8', 64)
    or (select source_revision_hash from public.video_studio_jobs where job_id = 'job-projection-chain')
      <> repeat('6', 64)
    or (select safe_title from public.video_studio_jobs where job_id = 'job-projection-chain')
      <> 'Higher cursor display copy' then
    raise exception 'higher cursor did not advance atomically';
  end if;

  v_desired := v_root_linkedin || pg_catalog.jsonb_build_object(
    'active_revision_hash', repeat('6', 64)
  );
  v_projection := pg_temp.video_studio_test_projection(
    'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
    v_root_linkedin, v_desired,
    '10000000-0000-4000-8000-000000000006'::uuid,
    2, repeat('8', 64), repeat('6', 64)
  );
  v_projection := pg_catalog.jsonb_set(
    v_projection, '{job,safe_title}',
    pg_catalog.to_jsonb('Equal cursor display must be inert'::text)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000006'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000006'::uuid),
    v_projection
  );
  v_current_linkedin := v_desired;
  if (select safe_title from public.video_studio_jobs where job_id = 'job-projection-chain')
      <> 'Higher cursor display copy' then
    raise exception 'equal cursor changed global display copy';
  end if;

  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000007'::uuid, repeat('7', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_current_youtube, v_current_youtube,
      '10000000-0000-4000-8000-000000000007'::uuid,
      1, repeat('9', 64), repeat('6', 64)
    ), 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000008'::uuid, repeat('8', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_current_youtube, v_current_youtube,
      '10000000-0000-4000-8000-000000000008'::uuid,
      2, repeat('9', 64), repeat('6', 64)
    ), 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000009'::uuid, repeat('9', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_current_youtube, v_current_youtube,
      '10000000-0000-4000-8000-000000000009'::uuid,
      3, repeat('8', 64), repeat('6', 64)
    ), 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000010'::uuid, repeat('a', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_current_youtube, v_current_youtube,
      '10000000-0000-4000-8000-000000000010'::uuid,
      2, repeat('8', 64), repeat('0', 64)
    ), 'projection_conflict'
  );

  v_projection := pg_temp.video_studio_test_projection(
    'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
    v_current_youtube, v_current_youtube,
    '10000000-0000-4000-8000-000000000011'::uuid,
    2, repeat('8', 64), repeat('6', 64)
  );
  v_projection := pg_catalog.jsonb_set(
    v_projection, '{job,safe_title}', pg_catalog.to_jsonb('Equal cursor review copy'::text)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000011'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000011'::uuid),
    v_projection
  );
  v_last_projection := v_projection;
  select pg_catalog.count(*) into v_count
  from public.video_studio_review_requests
  where job_id = 'job-projection-chain'
    and platform = 'youtube_shorts'
    and gate = 'treatment'
    and status = 'pending'
    and source_command_id is null;
  if v_count <> 1 then
    raise exception 'new projection did not supersede older pure projected reviews';
  end if;

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '30000000-0000-4000-8000-000000000001'::uuid,
    'job-projection-chain', 'youtube_shorts',
    '10000000-0000-4000-8000-000000000011'::uuid,
    'magic_edit_prepare', 'queued', repeat('6', 64), repeat('1', 64),
    repeat('7', 64), null, '{}'::jsonb, repeat('1', 64), repeat('2', 64),
    '30000000-0000-4000-8000-000000000001'::uuid, 'operator'
  );
  select duplicate into v_duplicate
  from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000011'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000011'::uuid),
    v_last_projection
  );
  if not v_duplicate then raise exception 'exact retry did not bypass in-flight fence'; end if;
  perform pg_temp.video_studio_expect_projection_error(
    '20000000-0000-4000-8000-000000000012'::uuid, repeat('c', 64),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_current_youtube, v_current_youtube,
      '10000000-0000-4000-8000-000000000012'::uuid,
      2, repeat('8', 64), repeat('6', 64)
    ), 'command_in_flight'
  );
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      insert into public.video_studio_commands (
        id, job_id, platform, command_kind, status,
        expected_parent_revision_hash, expected_parent_artifact_hash,
        semantic_target_map_hash, candidate_hash, payload, payload_hash,
        command_hash, idempotency_key, requested_by
      ) values (
        '30000000-0000-4000-8000-000000000002'::uuid,
        'job-projection-chain', 'linkedin', 'magic_edit_return_to_parent', 'queued',
        repeat('6', 64), repeat('4', 64), null, null,
        '{}'::jsonb, repeat('3', 64), repeat('4', 64),
        '30000000-0000-4000-8000-000000000002'::uuid, 'operator'
      )
    $sql$, 'command_in_flight'
  );
  if exists (
    select 1 from public.video_studio_projection_events
    where idempotency_key = '20000000-0000-4000-8000-000000000012'::uuid
  ) or exists (
    select 1 from public.video_studio_review_requests
    where id = '10000000-0000-4000-8000-000000000012'::uuid
  ) then
    raise exception 'fenced projection left partial state';
  end if;
  update public.video_studio_commands set status = 'cancelled'
  where id = '30000000-0000-4000-8000-000000000001'::uuid;

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '30000000-0000-4000-8000-000000000003'::uuid,
    'job-projection-chain', 'youtube_shorts',
    '10000000-0000-4000-8000-000000000011'::uuid,
    'review_decision_record', 'succeeded', repeat('6', 64), repeat('1', 64),
    repeat('7', 64), null, '{}'::jsonb, repeat('5', 64), repeat('6', 64),
    '30000000-0000-4000-8000-000000000003'::uuid, 'review_decision'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '20000000-0000-4000-8000-000000000013'::uuid,
    pg_temp.video_studio_test_projection_hash('20000000-0000-4000-8000-000000000013'::uuid),
    pg_temp.video_studio_test_projection(
      'job-projection-chain', array['youtube_shorts', 'linkedin']::text[],
      v_current_youtube, v_current_youtube,
      '10000000-0000-4000-8000-000000000013'::uuid,
      2, repeat('8', 64), repeat('6', 64)
    )
  );
  if (select status from public.video_studio_review_requests
      where id = '10000000-0000-4000-8000-000000000011'::uuid) <> 'pending' then
    raise exception 'projection superseded a command-backed pending review';
  end if;
  perform pg_temp.video_studio_assert_state(
    'job-projection-chain', 'youtube_shorts', v_current_youtube
  );
  perform pg_temp.video_studio_assert_state(
    'job-projection-chain', 'linkedin', v_current_linkedin
  );
end;
$basic$;

do $adoption$
declare
  v_youtube jsonb;
  v_linkedin jsonb;
  v_projection jsonb;
  v_count integer;
begin
  insert into public.video_studio_jobs (
    job_id, target_platforms, series, mode, stage, status,
    safe_title, safe_summary, source_revision_hash
  ) values (
    'job-adoption', array['youtube_shorts', 'linkedin']::text[],
    'money_of_ai', 'solo', 'treatment', 'active',
    'Legacy adoption fixture', 'Two existing platform rows adopt one exact source cursor.',
    repeat('a', 64)
  );
  insert into public.video_studio_job_platform_states (
    job_id, platform, editorial_state, runner_state, route_state,
    active_revision_hash, active_artifact_hash, active_candidate_hash,
    active_parent_revision_hash, active_parent_artifact_hash,
    active_parent_candidate_hash, semantic_target_map_hash
  ) values
    (
      'job-adoption', 'youtube_shorts', 'needs_visual_review', 'idle', 'standard',
      repeat('a', 64), repeat('1', 64), null, null, null, null, repeat('2', 64)
    ),
    (
      'job-adoption', 'linkedin', 'needs_visual_review', 'idle', 'standard',
      repeat('a', 64), repeat('3', 64), null, null, null, null, repeat('4', 64)
    );
  v_youtube := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('a', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  v_linkedin := pg_temp.video_studio_test_state(
    'linkedin', repeat('a', 64), repeat('3', 64), null,
    null, null, null, repeat('4', 64), 'needs_visual_review', 'standard'
  );
  v_projection := pg_temp.video_studio_test_projection(
    'job-adoption', array['youtube_shorts', 'linkedin']::text[],
    null, v_youtube,
    '11000000-0000-4000-8000-000000000001'::uuid,
    7, repeat('b', 64), repeat('a', 64)
  ) - 'expected_platform_state';
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '21000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('21000000-0000-4000-8000-000000000001'::uuid),
    v_projection
  );
  if (select source_event_count from public.video_studio_jobs where job_id = 'job-adoption') <> 7
    or (select source_event_chain_hash from public.video_studio_jobs where job_id = 'job-adoption')
      <> repeat('b', 64) then
    raise exception 'first legacy platform did not initialize source cursor';
  end if;

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '31000000-0000-4000-8000-000000000001'::uuid,
    'job-adoption', 'youtube_shorts',
    '11000000-0000-4000-8000-000000000001'::uuid,
    'magic_edit_prepare', 'queued', repeat('a', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('1', 64), repeat('2', 64),
    '31000000-0000-4000-8000-000000000001'::uuid, 'operator'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000002'::uuid, repeat('2', 64),
    pg_temp.video_studio_test_projection(
      'job-adoption', array['youtube_shorts', 'linkedin']::text[],
      null, v_linkedin,
      '11000000-0000-4000-8000-000000000002'::uuid,
      7, repeat('b', 64), repeat('a', 64)
    ) - 'expected_platform_state', 'command_in_flight'
  );
  update public.video_studio_commands set status = 'cancelled'
  where id = '31000000-0000-4000-8000-000000000001'::uuid;

  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000003'::uuid, repeat('3', 64),
    pg_temp.video_studio_test_projection(
      'job-adoption', array['youtube_shorts', 'linkedin']::text[],
      null, v_linkedin,
      '11000000-0000-4000-8000-000000000003'::uuid,
      6, repeat('c', 64), repeat('a', 64)
    ) - 'expected_platform_state', 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000004'::uuid, repeat('4', 64),
    pg_temp.video_studio_test_projection(
      'job-adoption', array['youtube_shorts', 'linkedin']::text[], null,
      v_linkedin || pg_catalog.jsonb_build_object('editorial_state', 'approved'),
      '11000000-0000-4000-8000-000000000004'::uuid,
      7, repeat('b', 64), repeat('a', 64)
    ) - 'expected_platform_state', 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000005'::uuid, repeat('5', 64),
    pg_temp.video_studio_test_projection(
      'job-adoption', array['youtube_shorts', 'linkedin']::text[], null,
      v_linkedin || pg_catalog.jsonb_build_object(
        'active_candidate_hash', repeat('5', 64),
        'parent_revision_hash', repeat('a', 64),
        'parent_artifact_hash', repeat('3', 64)
      ),
      '11000000-0000-4000-8000-000000000005'::uuid,
      7, repeat('b', 64), repeat('a', 64)
    ) - 'expected_platform_state', 'projection_conflict'
  );

  v_projection := pg_temp.video_studio_test_projection(
    'job-adoption', array['youtube_shorts', 'linkedin']::text[],
    null, v_linkedin,
    '11000000-0000-4000-8000-000000000006'::uuid,
    7, repeat('b', 64), repeat('a', 64)
  ) - 'expected_platform_state';
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '21000000-0000-4000-8000-000000000006'::uuid,
    pg_temp.video_studio_test_projection_hash('21000000-0000-4000-8000-000000000006'::uuid),
    v_projection
  );
  select pg_catalog.count(*) into v_count
  from public.video_studio_job_platform_states
  where job_id = 'job-adoption' and source_cursor_adopted_at is not null;
  if v_count <> 2 then
    raise exception 'both legacy platforms did not adopt shared source cursor';
  end if;
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000007'::uuid, repeat('7', 64),
    pg_temp.video_studio_test_projection(
      'job-adoption', array['youtube_shorts', 'linkedin']::text[],
      null, v_youtube,
      '11000000-0000-4000-8000-000000000007'::uuid,
      7, repeat('b', 64), repeat('a', 64)
    ) - 'expected_platform_state', 'projection_conflict'
  );

  insert into public.video_studio_jobs (
    job_id, target_platforms, series, mode, stage, status,
    safe_title, safe_summary, source_revision_hash
  ) values (
    'job-missing-platform', array['youtube_shorts', 'linkedin']::text[],
    'money_of_ai', 'solo', 'treatment', 'active',
    'Missing platform fixture', 'One declared target has no legacy platform row.',
    repeat('d', 64)
  );
  insert into public.video_studio_job_platform_states (
    job_id, platform, editorial_state, runner_state, route_state,
    active_revision_hash, active_artifact_hash, semantic_target_map_hash
  ) values (
    'job-missing-platform', 'youtube_shorts', 'needs_visual_review', 'idle', 'standard',
    repeat('d', 64), repeat('e', 64), repeat('f', 64)
  );
  v_projection := pg_temp.video_studio_test_projection(
    'job-missing-platform', array['youtube_shorts', 'linkedin']::text[], null,
    pg_temp.video_studio_test_state(
      'linkedin', repeat('d', 64), repeat('1', 64), null,
      null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
    ),
    '11000000-0000-4000-8000-000000000008'::uuid,
    4, repeat('3', 64), repeat('d', 64)
  ) - 'expected_platform_state';
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '21000000-0000-4000-8000-000000000008'::uuid,
    pg_temp.video_studio_test_projection_hash('21000000-0000-4000-8000-000000000008'::uuid),
    v_projection
  );
  if not exists (
    select 1 from public.video_studio_job_platform_states
    where job_id = 'job-missing-platform' and platform = 'linkedin'
      and source_cursor_adopted_at is not null
  ) then
    raise exception 'declared missing legacy platform was not bootstrapped';
  end if;
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000009'::uuid,
    repeat('9', 64), v_projection, 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000010'::uuid, repeat('a', 64),
    pg_temp.video_studio_test_projection(
      'job-missing-platform', array['youtube_shorts', 'linkedin']::text[], null,
      pg_temp.video_studio_test_state(
        'instagram_reels', repeat('d', 64), repeat('1', 64), null,
        null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
      ),
      '11000000-0000-4000-8000-000000000010'::uuid,
      4, repeat('3', 64), repeat('d', 64)
    ) - 'expected_platform_state', 'projection_conflict'
  );

  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000011'::uuid, repeat('b', 64),
    pg_temp.video_studio_test_projection(
      'job-ambiguous-upgrade-fixture', array['youtube_shorts', 'linkedin']::text[], null,
      pg_temp.video_studio_test_state(
        'youtube_shorts', repeat('7', 64), repeat('8', 64), null,
        null, null, null, repeat('9', 64), 'needs_visual_review', 'standard'
      ),
      '11000000-0000-4000-8000-000000000011'::uuid,
      1, repeat('a', 64), repeat('7', 64)
    ) - 'expected_platform_state', 'projection_conflict'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '21000000-0000-4000-8000-000000000012'::uuid, repeat('c', 64),
    pg_temp.video_studio_test_projection(
      'job-upgrade-fixture', array['youtube_shorts', 'linkedin']::text[], null,
      pg_temp.video_studio_test_state(
        'linkedin', repeat('a', 64), repeat('d', 64), null,
        null, null, null, repeat('6', 64), 'needs_final_review', 'standard'
      ),
      '11000000-0000-4000-8000-000000000012'::uuid,
      1, repeat('b', 64), repeat('a', 64)
    ) - 'expected_platform_state', 'cross_platform_magic_lineage'
  );
end;
$adoption$;

do $lineage$
declare
  v_root jsonb;
  v_linkedin jsonb;
  v_active jsonb;
  v_projected jsonb;
  v_count integer;
begin
  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '22000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('22000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-lineage', array['youtube_shorts', 'linkedin']::text[],
      null, v_root,
      '12000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  v_linkedin := pg_temp.video_studio_test_state(
    'linkedin', repeat('0', 64), repeat('2', 64), null,
    null, null, null, repeat('3', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '22000000-0000-4000-8000-000000000002'::uuid,
    pg_temp.video_studio_test_projection_hash('22000000-0000-4000-8000-000000000002'::uuid),
    pg_temp.video_studio_test_projection(
      'job-lineage', array['youtube_shorts', 'linkedin']::text[],
      null, v_linkedin,
      '12000000-0000-4000-8000-000000000002'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );

  update public.video_studio_job_platform_states
  set active_parent_revision_hash = active_revision_hash,
      active_parent_artifact_hash = active_artifact_hash,
      active_parent_candidate_hash = active_candidate_hash,
      active_revision_hash = repeat('3', 64),
      active_artifact_hash = repeat('4', 64),
      active_candidate_hash = repeat('5', 64),
      semantic_target_map_hash = repeat('6', 64),
      editorial_state = 'needs_final_review'
  where job_id = 'job-lineage' and platform = 'youtube_shorts';
  update public.video_studio_job_platform_states
  set active_revision_hash = repeat('7', 64)
  where job_id = 'job-lineage' and platform = 'youtube_shorts';
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      update public.video_studio_job_platform_states
      set active_artifact_hash = repeat('8', 64)
      where job_id = 'job-lineage' and platform = 'youtube_shorts'
    $sql$, 'invalid_lineage'
  );

  update public.video_studio_job_platform_states
  set active_parent_revision_hash = active_revision_hash,
      active_parent_artifact_hash = active_artifact_hash,
      active_parent_candidate_hash = active_candidate_hash,
      active_revision_hash = repeat('8', 64),
      active_artifact_hash = repeat('9', 64),
      active_candidate_hash = repeat('a', 64),
      semantic_target_map_hash = repeat('b', 64)
  where job_id = 'job-lineage' and platform = 'youtube_shorts';

  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      update public.video_studio_magic_candidate_lineage
      set parent_artifact_hash = repeat('f', 64)
      where job_id = 'job-lineage' and platform = 'youtube_shorts'
        and candidate_hash = repeat('5', 64)
    $sql$, 'append_only_violation'
  );
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      delete from public.video_studio_magic_candidate_lineage
      where job_id = 'job-lineage' and platform = 'youtube_shorts'
        and candidate_hash = repeat('5', 64)
    $sql$, 'append_only_violation'
  );
  alter table public.video_studio_magic_candidate_lineage
    disable trigger video_studio_magic_candidate_lineage_append_only;
  delete from public.video_studio_magic_candidate_lineage
  where job_id = 'job-lineage' and platform = 'youtube_shorts'
    and candidate_hash = repeat('5', 64);
  alter table public.video_studio_magic_candidate_lineage
    enable trigger video_studio_magic_candidate_lineage_append_only;
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      update public.video_studio_job_platform_states
      set active_revision_hash = repeat('c', 64),
          active_artifact_hash = active_parent_artifact_hash,
          active_candidate_hash = active_parent_candidate_hash,
          active_parent_revision_hash = null,
          active_parent_artifact_hash = null,
          active_parent_candidate_hash = null
      where job_id = 'job-lineage' and platform = 'youtube_shorts'
    $sql$, 'invalid_lineage'
  );
  insert into public.video_studio_magic_candidate_lineage (
    job_id, platform, candidate_hash,
    parent_revision_hash, parent_artifact_hash, parent_candidate_hash
  ) values (
    'job-lineage', 'youtube_shorts', repeat('5', 64),
    repeat('0', 64), repeat('1', 64), null
  );

  update public.video_studio_job_platform_states
  set active_revision_hash = repeat('c', 64),
      active_artifact_hash = active_parent_artifact_hash,
      active_candidate_hash = active_parent_candidate_hash,
      active_parent_revision_hash = null,
      active_parent_artifact_hash = null,
      active_parent_candidate_hash = null
  where job_id = 'job-lineage' and platform = 'youtube_shorts';
  if (select active_parent_revision_hash from public.video_studio_job_platform_states
      where job_id = 'job-lineage' and platform = 'youtube_shorts') <> repeat('0', 64) then
    raise exception 'nested return did not rehydrate immutable ancestry';
  end if;
  update public.video_studio_job_platform_states
  set active_revision_hash = repeat('d', 64),
      active_artifact_hash = active_parent_artifact_hash,
      active_candidate_hash = active_parent_candidate_hash,
      active_parent_revision_hash = null,
      active_parent_artifact_hash = null,
      active_parent_candidate_hash = null
  where job_id = 'job-lineage' and platform = 'youtube_shorts';
  perform pg_temp.video_studio_assert_state(
    'job-lineage', 'youtube_shorts',
    pg_temp.video_studio_test_state(
      'youtube_shorts', repeat('d', 64), repeat('1', 64), null,
      null, null, null, repeat('b', 64), 'needs_final_review', 'standard'
    )
  );
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      update public.video_studio_job_platform_states
      set active_parent_revision_hash = active_revision_hash,
          active_parent_artifact_hash = active_artifact_hash,
          active_parent_candidate_hash = active_candidate_hash,
          active_revision_hash = repeat('e', 64),
          active_artifact_hash = repeat('f', 64),
          active_candidate_hash = repeat('5', 64)
      where job_id = 'job-lineage' and platform = 'youtube_shorts'
    $sql$, 'invalid_lineage'
  );
  select pg_catalog.count(*) into v_count
  from public.video_studio_magic_candidate_lineage
  where job_id = 'job-lineage' and platform = 'youtube_shorts';
  if v_count <> 2 then
    raise exception 'two activations did not preserve two ancestry edges';
  end if;

  update public.video_studio_job_platform_states
  set active_parent_revision_hash = active_revision_hash,
      active_parent_artifact_hash = active_artifact_hash,
      active_parent_candidate_hash = active_candidate_hash,
      active_revision_hash = repeat('e', 64),
      active_artifact_hash = repeat('f', 64),
      active_candidate_hash = repeat('6', 64)
  where job_id = 'job-lineage' and platform = 'youtube_shorts';
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      update public.video_studio_job_platform_states
      set active_parent_revision_hash = active_revision_hash,
          active_parent_artifact_hash = active_artifact_hash,
          active_parent_candidate_hash = active_candidate_hash,
          active_revision_hash = repeat('7', 64),
          active_artifact_hash = repeat('8', 64),
          active_candidate_hash = repeat('9', 64)
      where job_id = 'job-lineage' and platform = 'linkedin'
    $sql$, 'cross_platform_magic_lineage'
  );
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      insert into public.video_studio_commands (
        id, job_id, platform, review_id, command_kind, status,
        expected_parent_revision_hash, expected_parent_artifact_hash,
        semantic_target_map_hash, candidate_hash, payload, payload_hash,
        command_hash, idempotency_key, requested_by
      ) values (
        '32000000-0000-4000-8000-000000000001'::uuid,
        'job-lineage', 'linkedin',
        '12000000-0000-4000-8000-000000000002'::uuid,
        'review_decision_record', 'queued', repeat('0', 64), repeat('2', 64),
        repeat('3', 64), null, '{}'::jsonb, repeat('1', 64), repeat('2', 64),
        '32000000-0000-4000-8000-000000000001'::uuid, 'review_decision'
      )
    $sql$, 'cross_platform_magic_lineage'
  );
  perform pg_temp.video_studio_expect_projection_error(
    '22000000-0000-4000-8000-000000000003'::uuid, repeat('3', 64),
    pg_temp.video_studio_test_projection(
      'job-lineage', array['youtube_shorts', 'linkedin']::text[],
      v_linkedin, v_linkedin,
      '12000000-0000-4000-8000-000000000003'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    ), 'cross_platform_magic_lineage'
  );
  update public.video_studio_job_platform_states
  set active_revision_hash = repeat('f', 64),
      active_artifact_hash = active_parent_artifact_hash,
      active_candidate_hash = active_parent_candidate_hash,
      active_parent_revision_hash = null,
      active_parent_artifact_hash = null,
      active_parent_candidate_hash = null
  where job_id = 'job-lineage' and platform = 'youtube_shorts';

  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '22000000-0000-4000-8000-000000000004'::uuid,
    pg_temp.video_studio_test_projection_hash('22000000-0000-4000-8000-000000000004'::uuid),
    pg_temp.video_studio_test_projection(
      'job-active-projection', array['youtube_shorts']::text[],
      null, v_root,
      '12000000-0000-4000-8000-000000000004'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  update public.video_studio_job_platform_states
  set active_parent_revision_hash = active_revision_hash,
      active_parent_artifact_hash = active_artifact_hash,
      active_parent_candidate_hash = active_candidate_hash,
      active_revision_hash = repeat('3', 64),
      active_artifact_hash = repeat('4', 64),
      active_candidate_hash = repeat('5', 64)
  where job_id = 'job-active-projection' and platform = 'youtube_shorts';
  v_active := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('0', 64), repeat('1', 64), null,
    repeat('2', 64), 'needs_visual_review', 'standard'
  );
  v_projected := v_active || pg_catalog.jsonb_build_object(
    'active_revision_hash', repeat('6', 64),
    'semantic_target_map_hash', repeat('7', 64)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '22000000-0000-4000-8000-000000000005'::uuid,
    pg_temp.video_studio_test_projection_hash('22000000-0000-4000-8000-000000000005'::uuid),
    pg_temp.video_studio_test_projection(
      'job-active-projection', array['youtube_shorts']::text[],
      v_active, v_projected,
      '12000000-0000-4000-8000-000000000005'::uuid,
      2, repeat('8', 64), repeat('6', 64)
    )
  );
  perform pg_temp.video_studio_assert_state(
    'job-active-projection', 'youtube_shorts', v_projected
  );
  perform pg_temp.video_studio_expect_projection_error(
    '22000000-0000-4000-8000-000000000006'::uuid, repeat('6', 64),
    pg_temp.video_studio_test_projection(
      'job-active-projection', array['youtube_shorts']::text[],
      v_projected,
      v_projected || pg_catalog.jsonb_build_object(
        'active_revision_hash', repeat('9', 64),
        'active_artifact_hash', repeat('a', 64)
      ),
      '12000000-0000-4000-8000-000000000006'::uuid,
      3, repeat('b', 64), repeat('9', 64)
    ), 'projection_conflict'
  );
  perform pg_temp.video_studio_assert_state(
    'job-active-projection', 'youtube_shorts', v_projected
  );
  if (select source_event_count from public.video_studio_jobs
      where job_id = 'job-active-projection') <> 2 then
    raise exception 'artifact-drift projection partially advanced global cursor';
  end if;
  update public.video_studio_job_platform_states
  set active_revision_hash = repeat('c', 64),
      active_artifact_hash = active_parent_artifact_hash,
      active_candidate_hash = active_parent_candidate_hash,
      active_parent_revision_hash = null,
      active_parent_artifact_hash = null,
      active_parent_candidate_hash = null
  where job_id = 'job-active-projection' and platform = 'youtube_shorts';
  if (select active_candidate_hash from public.video_studio_job_platform_states
      where job_id = 'job-active-projection' and platform = 'youtube_shorts') is not null then
    raise exception 'return after projected revision advance did not reach root';
  end if;
end;
$lineage$;

do $completion$
declare
  v_gates jsonb := pg_catalog.jsonb_build_object(
    'truth', pg_catalog.jsonb_build_object('status', 'passed'),
    'rights', pg_catalog.jsonb_build_object('status', 'passed'),
    'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
    'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
    'naming', pg_catalog.jsonb_build_object('status', 'passed')
  );
  v_root jsonb;
  v_active jsonb;
  v_projected jsonb;
  v_duplicate boolean;
  v_failed boolean;
begin
  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '23000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('23000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-completion', array['youtube_shorts']::text[],
      null, v_root,
      '13000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  update public.video_studio_job_platform_states
  set active_parent_revision_hash = active_revision_hash,
      active_parent_artifact_hash = active_artifact_hash,
      active_parent_candidate_hash = active_candidate_hash,
      active_revision_hash = repeat('3', 64),
      active_artifact_hash = repeat('4', 64),
      active_candidate_hash = repeat('5', 64)
  where job_id = 'job-completion' and platform = 'youtube_shorts';
  v_active := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('0', 64), repeat('1', 64), null,
    repeat('2', 64), 'needs_visual_review', 'standard'
  );
  v_projected := v_active || pg_catalog.jsonb_build_object(
    'active_revision_hash', repeat('6', 64),
    'semantic_target_map_hash', repeat('7', 64)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '23000000-0000-4000-8000-000000000002'::uuid,
    pg_temp.video_studio_test_projection_hash('23000000-0000-4000-8000-000000000002'::uuid),
    pg_temp.video_studio_test_projection(
      'job-completion', array['youtube_shorts']::text[],
      v_active, v_projected,
      '13000000-0000-4000-8000-000000000002'::uuid,
      2, repeat('8', 64), repeat('6', 64)
    )
  );

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '33000000-0000-4000-8000-000000000001'::uuid,
    'job-completion', 'youtube_shorts',
    '13000000-0000-4000-8000-000000000002'::uuid,
    'review_decision_record', 'leased', repeat('6', 64), repeat('4', 64),
    repeat('7', 64), null,
    '{"decision":"use_candidate","gate":"final"}'::jsonb,
    repeat('1', 64), repeat('2', 64),
    '33000000-0000-4000-8000-000000000001'::uuid, 'review_decision',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  select duplicate into v_duplicate
  from public.video_studio_complete_command(
    '33000000-0000-4000-8000-000000000001'::uuid,
    'job-completion', repeat('a', 64), repeat('b', 64), repeat('2', 64),
    pg_temp.video_studio_test_receipt_hash('33000000-0000-4000-8000-000000000001'::uuid),
    repeat('4', 64), 'succeeded',
    repeat('8', 64), repeat('4', 64),
    pg_catalog.jsonb_build_object(
      'semantic_target_map_hash', repeat('9', 64),
      'result_source_event_count', 3,
      'result_source_event_chain_hash', repeat('a', 64),
      'result_source_revision_hash', repeat('8', 64)
    ),
    v_gates, false, null,
    pg_catalog.now() - interval '1 minute', pg_catalog.now()
  );
  if v_duplicate then raise exception 'first command completion cannot be duplicate'; end if;
  if (select source_event_count from public.video_studio_jobs where job_id = 'job-completion') <> 3
    or (select source_event_chain_hash from public.video_studio_jobs where job_id = 'job-completion')
      <> repeat('a', 64)
    or (select source_revision_hash from public.video_studio_jobs where job_id = 'job-completion')
      <> repeat('8', 64) then
    raise exception 'successful command did not atomically advance source cursor';
  end if;
  if not exists (
    select 1 from public.video_studio_job_platform_states
    where job_id = 'job-completion' and platform = 'youtube_shorts'
      and active_revision_hash = repeat('8', 64)
      and active_artifact_hash = repeat('4', 64)
      and active_candidate_hash = repeat('5', 64)
      and active_parent_revision_hash = repeat('0', 64)
  ) then
    raise exception 'review decision did not preserve active candidate artifact and ancestry';
  end if;
  select duplicate into v_duplicate
  from public.video_studio_complete_command(
    '33000000-0000-4000-8000-000000000001'::uuid,
    'job-completion', repeat('a', 64), repeat('b', 64), repeat('2', 64),
    pg_temp.video_studio_test_receipt_hash('33000000-0000-4000-8000-000000000001'::uuid),
    repeat('4', 64), 'succeeded',
    repeat('8', 64), repeat('4', 64),
    pg_catalog.jsonb_build_object(
      'semantic_target_map_hash', repeat('9', 64),
      'result_source_event_count', 3,
      'result_source_event_chain_hash', repeat('a', 64),
      'result_source_revision_hash', repeat('8', 64)
    ),
    v_gates, false, null,
    pg_catalog.now() - interval '1 minute', pg_catalog.now()
  );
  if not v_duplicate then raise exception 'exact receipt replay was not idempotent'; end if;

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '33000000-0000-4000-8000-000000000002'::uuid,
    'job-completion', 'youtube_shorts',
    '13000000-0000-4000-8000-000000000002'::uuid,
    'review_decision_record', 'leased', repeat('8', 64), repeat('4', 64),
    repeat('9', 64), null,
    '{"decision":"use_candidate","gate":"final"}'::jsonb,
    repeat('5', 64), repeat('6', 64),
    '33000000-0000-4000-8000-000000000002'::uuid, 'review_decision',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '33000000-0000-4000-8000-000000000002'::uuid,
      'job-completion', repeat('a', 64), repeat('b', 64), repeat('6', 64),
      pg_temp.video_studio_test_receipt_hash('33000000-0000-4000-8000-000000000002'::uuid),
      repeat('8', 64), 'succeeded',
      repeat('b', 64), repeat('c', 64),
      pg_catalog.jsonb_build_object(
        'semantic_target_map_hash', repeat('d', 64),
        'result_source_event_count', 4,
        'result_source_event_chain_hash', repeat('e', 64),
        'result_source_revision_hash', repeat('b', 64)
      ),
      v_gates, false, null,
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_lineage' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'active candidate artifact drift completed'; end if;
  if (select status from public.video_studio_commands
      where id = '33000000-0000-4000-8000-000000000002'::uuid) <> 'leased'
    or exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '33000000-0000-4000-8000-000000000002'::uuid
    )
    or (select source_event_count from public.video_studio_jobs where job_id = 'job-completion') <> 3
    or (select active_revision_hash from public.video_studio_job_platform_states
        where job_id = 'job-completion' and platform = 'youtube_shorts') <> repeat('8', 64) then
    raise exception 'artifact drift failure did not roll back atomically';
  end if;
  update public.video_studio_commands set status = 'cancelled'
  where id = '33000000-0000-4000-8000-000000000002'::uuid;

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '33000000-0000-4000-8000-000000000003'::uuid,
    'job-completion', 'youtube_shorts',
    '13000000-0000-4000-8000-000000000002'::uuid,
    'review_decision_record', 'leased', repeat('8', 64), repeat('4', 64),
    repeat('9', 64), null,
    '{"decision":"use_candidate","gate":"final"}'::jsonb,
    repeat('7', 64), repeat('8', 64),
    '33000000-0000-4000-8000-000000000003'::uuid, 'review_decision',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '33000000-0000-4000-8000-000000000003'::uuid,
      'job-completion', repeat('a', 64), repeat('b', 64), repeat('8', 64),
      pg_temp.video_studio_test_receipt_hash('33000000-0000-4000-8000-000000000003'::uuid),
      repeat('a', 64), 'succeeded',
      repeat('b', 64), repeat('4', 64),
      pg_catalog.jsonb_build_object(
        'semantic_target_map_hash', repeat('c', 64),
        'result_source_event_count', 4,
        'result_source_event_chain_hash', repeat('d', 64),
        'result_source_revision_hash', repeat('e', 64)
      ),
      v_gates, false, null,
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_receipt' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'mismatched result source revision completed'; end if;
  update public.video_studio_commands set status = 'cancelled'
  where id = '33000000-0000-4000-8000-000000000003'::uuid;

  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '33000000-0000-4000-8000-000000000004'::uuid,
    'job-completion', 'youtube_shorts',
    '13000000-0000-4000-8000-000000000002'::uuid,
    'review_decision_record', 'leased', repeat('8', 64), repeat('4', 64),
    repeat('9', 64), null,
    '{"decision":"use_candidate","gate":"final"}'::jsonb,
    repeat('9', 64), repeat('a', 64),
    '33000000-0000-4000-8000-000000000004'::uuid, 'review_decision',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '33000000-0000-4000-8000-000000000004'::uuid,
      'job-completion', repeat('a', 64), repeat('b', 64), repeat('a', 64),
      pg_temp.video_studio_test_receipt_hash('33000000-0000-4000-8000-000000000004'::uuid),
      repeat('c', 64), 'succeeded',
      repeat('d', 64), repeat('4', 64),
      pg_catalog.jsonb_build_object(
        'semantic_target_map_hash', repeat('e', 64),
        'result_source_event_count', 3,
        'result_source_event_chain_hash', repeat('a', 64),
        'result_source_revision_hash', repeat('d', 64)
      ),
      v_gates, false, null,
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'stale_event_count' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'equal event count completed non-prepare command'; end if;
  update public.video_studio_commands set status = 'cancelled'
  where id = '33000000-0000-4000-8000-000000000004'::uuid;
end;
$completion$;

do $late_completion$
declare
  v_gates jsonb := pg_catalog.jsonb_build_object(
    'truth', pg_catalog.jsonb_build_object('status', 'passed'),
    'rights', pg_catalog.jsonb_build_object('status', 'passed'),
    'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
    'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
    'naming', pg_catalog.jsonb_build_object('status', 'passed')
  );
  v_root jsonb;
  v_refs jsonb;
  v_terminal_at timestamptz;
  v_started_at timestamptz := pg_catalog.now() - interval '2 minutes';
  v_finished_at timestamptz := pg_catalog.now() - interval '1 minute';
  v_failed boolean;
  v_duplicate boolean;
begin
  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '27000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('27000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-late-completion', array['youtube_shorts']::text[], null, v_root,
      '17000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '37000000-0000-4000-8000-000000000001'::uuid,
    'job-late-completion', 'youtube_shorts',
    '17000000-0000-4000-8000-000000000001'::uuid,
    'review_decision_record', 'queued', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null,
    '{"decision":"use_candidate","gate":"final"}'::jsonb,
    repeat('3', 64), repeat('4', 64),
    '37000000-0000-4000-8000-000000000001'::uuid, 'review_decision'
  );
  v_refs := pg_catalog.jsonb_build_object(
    'semantic_target_map_hash', repeat('5', 64),
    'result_source_event_count', 2,
    'result_source_event_chain_hash', repeat('6', 64),
    'result_source_revision_hash', repeat('7', 64)
  );

  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '37000000-0000-4000-8000-000000000001'::uuid,
      'job-late-completion', repeat('a', 64), repeat('b', 64), repeat('4', 64),
      pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000001'::uuid),
      repeat('9', 64), 'succeeded',
      repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
      v_started_at, v_finished_at
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'lease_conflict' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'a queued command accepted late completion'; end if;

  update public.video_studio_commands
  set status = 'leased',
      lease_owner_hash = repeat('a', 64),
      lease_token_hash = repeat('b', 64),
      lease_expires_at = pg_catalog.now() - interval '1 minute',
      attempt_count = 5
  where id = '37000000-0000-4000-8000-000000000001'::uuid;
  update public.video_studio_commands
  set lease_token_hash = repeat('c', 64),
      lease_expires_at = pg_catalog.now() - interval '1 second'
  where id = '37000000-0000-4000-8000-000000000001'::uuid;
  update public.video_studio_commands
  set status = 'attention',
      safe_code = 'attempts_exhausted',
      completed_at = pg_catalog.now(),
      lease_owner_hash = null,
      lease_token_hash = null,
      lease_expires_at = null
  where id = '37000000-0000-4000-8000-000000000001'::uuid
  returning completed_at into v_terminal_at;

  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '37000000-0000-4000-8000-000000000001'::uuid,
      'job-late-completion', repeat('f', 64), repeat('b', 64), repeat('4', 64),
      pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000001'::uuid),
      repeat('9', 64), 'succeeded',
      repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
      v_started_at, v_finished_at
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'lease_conflict' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'late completion accepted the wrong runner'; end if;

  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '37000000-0000-4000-8000-000000000001'::uuid,
      'job-late-completion', repeat('a', 64), repeat('b', 64), repeat('f', 64),
      pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000001'::uuid),
      repeat('9', 64), 'succeeded',
      repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
      v_started_at, v_finished_at
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'lease_conflict' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'late completion accepted the wrong command hash'; end if;

  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '37000000-0000-4000-8000-000000000001'::uuid,
      'job-late-completion', repeat('a', 64), repeat('b', 64), repeat('4', 64),
      pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000001'::uuid),
      repeat('9', 64), 'succeeded',
      repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
      v_terminal_at, v_terminal_at + interval '1 second'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_receipt' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'post-terminal work was accepted as a late receipt'; end if;

  select duplicate into v_duplicate
  from public.video_studio_complete_command(
    '37000000-0000-4000-8000-000000000001'::uuid,
    'job-late-completion', repeat('a', 64), repeat('b', 64), repeat('4', 64),
    pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000001'::uuid),
    repeat('9', 64), 'succeeded',
    repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
    v_started_at, v_finished_at
  );
  if v_duplicate then raise exception 'first late completion was marked duplicate'; end if;
  select duplicate into v_duplicate
  from public.video_studio_complete_command(
    '37000000-0000-4000-8000-000000000001'::uuid,
    'job-late-completion', repeat('a', 64), repeat('b', 64), repeat('4', 64),
    pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000001'::uuid),
    repeat('9', 64), 'succeeded',
    repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
    v_started_at, v_finished_at
  );
  if not v_duplicate then raise exception 'exact late receipt replay was not idempotent'; end if;
  if (select source_event_count from public.video_studio_jobs
      where job_id = 'job-late-completion') <> 2
    or (select active_revision_hash from public.video_studio_job_platform_states
        where job_id = 'job-late-completion' and platform = 'youtube_shorts')
      <> repeat('7', 64)
    or (select last_lease_token_hash from public.video_studio_commands
        where id = '37000000-0000-4000-8000-000000000001'::uuid)
      <> repeat('c', 64) then
    raise exception 'late completion did not survive pre-journal fresh-lease crash atomically';
  end if;

  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '27000000-0000-4000-8000-000000000002'::uuid,
    pg_temp.video_studio_test_projection_hash('27000000-0000-4000-8000-000000000002'::uuid),
    pg_temp.video_studio_test_projection(
      'job-late-blocked', array['youtube_shorts']::text[], null, v_root,
      '17000000-0000-4000-8000-000000000002'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '37000000-0000-4000-8000-000000000002'::uuid,
    'job-late-blocked', 'youtube_shorts',
    '17000000-0000-4000-8000-000000000002'::uuid,
    'review_decision_record', 'leased', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('3', 64), repeat('4', 64),
    '37000000-0000-4000-8000-000000000002'::uuid, 'review_decision',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() - interval '1 minute', 5
  );
  update public.video_studio_commands
  set status = 'attention', safe_code = 'command_expired', completed_at = pg_catalog.now(),
      lease_owner_hash = null, lease_token_hash = null, lease_expires_at = null
  where id = '37000000-0000-4000-8000-000000000002'::uuid;
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '37000000-0000-4000-8000-000000000003'::uuid,
    'job-late-blocked', 'youtube_shorts',
    '17000000-0000-4000-8000-000000000002'::uuid,
    'review_decision_record', 'queued', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('5', 64), repeat('6', 64),
    '37000000-0000-4000-8000-000000000003'::uuid, 'review_decision'
  );
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '37000000-0000-4000-8000-000000000002'::uuid,
      'job-late-blocked', repeat('a', 64), repeat('b', 64), repeat('4', 64),
      pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000002'::uuid),
      repeat('b', 64), 'succeeded',
      repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
      v_started_at, v_finished_at
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'command_in_flight' then raise; end if;
    v_failed := true;
  end;
  if not v_failed
    or (select status from public.video_studio_commands
        where id = '37000000-0000-4000-8000-000000000003'::uuid) <> 'queued'
    or (select attempt_count from public.video_studio_commands
        where id = '37000000-0000-4000-8000-000000000003'::uuid) <> 0
    or (select lease_owner_hash from public.video_studio_commands
        where id = '37000000-0000-4000-8000-000000000003'::uuid) is not null
    or exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '37000000-0000-4000-8000-000000000002'::uuid
    ) then
    raise exception 'newer command did not fence late completion before claim';
  end if;
  update public.video_studio_commands set status = 'cancelled'
  where id = '37000000-0000-4000-8000-000000000003'::uuid;

  insert into public.video_studio_runner_heartbeats (
    runner_id_hash, runner_status, software_commit, command_schema_versions,
    drive_state, active_command_id, pending_receipts, occurred_at, received_at
  ) values (
    repeat('a', 64), 'idle', 'unknown', array[1]::integer[],
    'ready', null, 1, pg_catalog.now(), pg_catalog.now()
  ) on conflict (runner_id_hash) do update
  set runner_status = excluded.runner_status,
      software_commit = excluded.software_commit,
      command_schema_versions = excluded.command_schema_versions,
      drive_state = excluded.drive_state,
      active_command_id = excluded.active_command_id,
      pending_receipts = excluded.pending_receipts,
      occurred_at = excluded.occurred_at,
      received_at = excluded.received_at;
  v_failed := false;
  begin
    perform * from public.video_studio_recover_failed_review(
      '37000000-0000-4000-8000-000000000002'::uuid,
      'job-late-blocked', 'youtube_shorts', repeat('0', 64), repeat('1', 64),
      '47000000-0000-4000-8000-000000000001'::uuid, pg_catalog.now(), repeat('a', 64),
      '17000000-0000-4000-8000-000000000005'::uuid,
      '{}'::jsonb, repeat('b', 64), repeat('c', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'recovery_not_available' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'recovery ignored the owning runner pending-receipt heartbeat';
  end if;

  insert into public.video_studio_review_requests (
    id, job_id, recovery_of_command_id, recovery_root_command_id,
    recovery_generation, binding_state, platform, gate, status, route_state,
    safe_title, safe_summary, parent_revision_hash, parent_artifact_hash,
    revision_hash, artifact_hash, candidate_hash, semantic_target_map_hash,
    safe_payload, truth_gate, rights_gate, confidentiality_gate,
    transcript_fidelity_gate, naming_gate, queues_activation,
    comparison_alignment, expires_at
  ) values (
    '17000000-0000-4000-8000-000000000005'::uuid,
    'job-late-blocked',
    '37000000-0000-4000-8000-000000000002'::uuid,
    '37000000-0000-4000-8000-000000000002'::uuid,
    1, 'queued', 'youtube_shorts', 'treatment', 'pending', 'standard',
    'Recovery race', 'Synthetic downstream recovery fixture.',
    repeat('0', 64), repeat('1', 64), repeat('e', 64), repeat('f', 64),
    null, repeat('2', 64),
    pg_catalog.jsonb_build_object(
      'semantic_target_map_hash', repeat('2', 64),
      'blocking_gates', v_gates
    ),
    'passed', 'passed', 'passed', 'passed', 'passed', false,
    'unavailable', pg_catalog.now() + interval '30 days'
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '37000000-0000-4000-8000-000000000004'::uuid,
    'job-late-blocked', 'youtube_shorts',
    '17000000-0000-4000-8000-000000000005'::uuid,
    'review_recovery_record', 'queued', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('8', 64), repeat('9', 64),
    '37000000-0000-4000-8000-000000000004'::uuid, 'operator'
  );
  update public.video_studio_commands set status = 'cancelled'
  where id = '37000000-0000-4000-8000-000000000004'::uuid;
  insert into public.video_studio_command_recoveries (
    idempotency_key, recovery_hash, job_id, platform, root_command_id,
    source_command_id, source_review_id, recovery_review_id,
    binding_command_id, recovery_generation, prior_status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    submitted_at
  ) values (
    '37000000-0000-4000-8000-000000000004'::uuid,
    repeat('a', 64), 'job-late-blocked', 'youtube_shorts',
    '37000000-0000-4000-8000-000000000002'::uuid,
    '37000000-0000-4000-8000-000000000002'::uuid,
    '17000000-0000-4000-8000-000000000002'::uuid,
    '17000000-0000-4000-8000-000000000005'::uuid,
    '37000000-0000-4000-8000-000000000004'::uuid,
    1, 'attention', repeat('0', 64), repeat('1', 64), pg_catalog.now()
  );
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '37000000-0000-4000-8000-000000000002'::uuid,
      'job-late-blocked', repeat('a', 64), repeat('b', 64), repeat('4', 64),
      pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000002'::uuid),
      repeat('b', 64), 'succeeded',
      repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
      v_started_at, v_finished_at
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'recovery_exists' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'downstream recovery did not fence late completion'; end if;
  if exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '37000000-0000-4000-8000-000000000002'::uuid
    )
    or (select source_event_count from public.video_studio_jobs
        where job_id = 'job-late-blocked') <> 1 then
    raise exception 'rejected late completion mutated durable state';
  end if;

  update public.video_studio_commands set status = 'queued'
  where id = '37000000-0000-4000-8000-000000000004'::uuid;
  select duplicate into v_duplicate
  from public.video_studio_complete_command(
    '37000000-0000-4000-8000-000000000002'::uuid,
    'job-late-blocked', repeat('a', 64), repeat('b', 64), repeat('4', 64),
    pg_temp.video_studio_test_receipt_hash('37000000-0000-4000-8000-000000000002'::uuid),
    repeat('b', 64), 'succeeded',
    repeat('7', 64), repeat('1', 64), v_refs, v_gates, false, null,
    v_started_at, v_finished_at
  );
  if v_duplicate
    or (select status from public.video_studio_commands
        where id = '37000000-0000-4000-8000-000000000004'::uuid) <> 'cancelled'
    or (select safe_code from public.video_studio_commands
        where id = '37000000-0000-4000-8000-000000000004'::uuid)
      <> 'superseded_by_late_source_receipt'
    or not exists (
      select 1 from public.video_studio_review_requests
      where id = '17000000-0000-4000-8000-000000000005'::uuid
        and status = 'superseded' and binding_state = 'failed'
    )
    or (select source_event_count from public.video_studio_jobs
        where job_id = 'job-late-blocked') <> 2 then
    raise exception 'late source receipt did not retire the exact unstarted recovery safely';
  end if;
end;
$late_completion$;

do $cross_platform_catchup$
declare
  v_gates jsonb := pg_catalog.jsonb_build_object(
    'truth', pg_catalog.jsonb_build_object('status', 'passed'),
    'rights', pg_catalog.jsonb_build_object('status', 'passed'),
    'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
    'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
    'naming', pg_catalog.jsonb_build_object('status', 'passed')
  );
  v_youtube jsonb;
  v_linkedin jsonb;
  v_linkedin_caught_up jsonb;
begin
  v_youtube := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  v_linkedin := pg_temp.video_studio_test_state(
    'linkedin', repeat('0', 64), repeat('3', 64), null,
    null, null, null, repeat('4', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '24000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('24000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-cross-platform-catchup', array['youtube_shorts', 'linkedin']::text[],
      null, v_youtube,
      '14000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '24000000-0000-4000-8000-000000000002'::uuid,
    pg_temp.video_studio_test_projection_hash('24000000-0000-4000-8000-000000000002'::uuid),
    pg_temp.video_studio_test_projection(
      'job-cross-platform-catchup', array['youtube_shorts', 'linkedin']::text[],
      null, v_linkedin,
      '14000000-0000-4000-8000-000000000002'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '34000000-0000-4000-8000-000000000001'::uuid,
    'job-cross-platform-catchup', 'youtube_shorts',
    '14000000-0000-4000-8000-000000000001'::uuid,
    'review_decision_record', 'leased', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null,
    '{"decision":"use_candidate","gate":"final"}'::jsonb,
    repeat('1', 64), repeat('2', 64),
    '34000000-0000-4000-8000-000000000001'::uuid, 'review_decision',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  perform * from public.video_studio_complete_command(
    '34000000-0000-4000-8000-000000000001'::uuid,
    'job-cross-platform-catchup', repeat('a', 64), repeat('b', 64), repeat('2', 64),
    pg_temp.video_studio_test_receipt_hash('34000000-0000-4000-8000-000000000001'::uuid),
    repeat('4', 64), 'succeeded',
    repeat('3', 64), repeat('1', 64),
    pg_catalog.jsonb_build_object(
      'semantic_target_map_hash', repeat('5', 64),
      'result_source_event_count', 2,
      'result_source_event_chain_hash', repeat('6', 64),
      'result_source_revision_hash', repeat('3', 64)
    ),
    v_gates, false, null,
    pg_catalog.now() - interval '1 minute', pg_catalog.now()
  );

  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      insert into public.video_studio_commands (
        id, job_id, platform, review_id, command_kind, status,
        expected_parent_revision_hash, expected_parent_artifact_hash,
        semantic_target_map_hash, candidate_hash, payload, payload_hash,
        command_hash, idempotency_key, requested_by
      ) values (
        '34000000-0000-4000-8000-000000000002'::uuid,
        'job-cross-platform-catchup', 'linkedin',
        '14000000-0000-4000-8000-000000000002'::uuid,
        'review_decision_record', 'queued', repeat('0', 64), repeat('3', 64),
        repeat('4', 64), null, '{}'::jsonb, repeat('7', 64), repeat('8', 64),
        '34000000-0000-4000-8000-000000000002'::uuid, 'review_decision'
      )
    $sql$, 'stale_parent'
  );
  v_linkedin_caught_up := v_linkedin || pg_catalog.jsonb_build_object(
    'active_revision_hash', repeat('3', 64),
    'semantic_target_map_hash', repeat('5', 64)
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '24000000-0000-4000-8000-000000000003'::uuid,
    pg_temp.video_studio_test_projection_hash('24000000-0000-4000-8000-000000000003'::uuid),
    pg_temp.video_studio_test_projection(
      'job-cross-platform-catchup', array['youtube_shorts', 'linkedin']::text[],
      v_linkedin, v_linkedin_caught_up,
      '14000000-0000-4000-8000-000000000003'::uuid,
      2, repeat('6', 64), repeat('3', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '34000000-0000-4000-8000-000000000003'::uuid,
    'job-cross-platform-catchup', 'linkedin',
    '14000000-0000-4000-8000-000000000003'::uuid,
    'review_decision_record', 'queued', repeat('3', 64), repeat('3', 64),
    repeat('5', 64), null, '{}'::jsonb, repeat('9', 64), repeat('a', 64),
    '34000000-0000-4000-8000-000000000003'::uuid, 'review_decision'
  );
  update public.video_studio_commands set status = 'cancelled'
  where id = '34000000-0000-4000-8000-000000000003'::uuid;
end;
$cross_platform_catchup$;

do $prepare_cursor$
declare
  v_gates jsonb := pg_catalog.jsonb_build_object(
    'truth', pg_catalog.jsonb_build_object('status', 'passed'),
    'rights', pg_catalog.jsonb_build_object('status', 'passed'),
    'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
    'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
    'naming', pg_catalog.jsonb_build_object('status', 'passed')
  );
  v_root jsonb;
  v_before_key text;
  v_after_key text;
  v_result_refs jsonb;
  v_slot_duplicate boolean;
  v_slot_expires_at timestamptz;
  v_failed boolean := false;
begin
  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '25000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('25000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-prepare-cursor', array['youtube_shorts']::text[],
      null, v_root,
      '15000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '35000000-0000-4000-8000-000000000001'::uuid,
    'job-prepare-cursor', 'youtube_shorts',
    '15000000-0000-4000-8000-000000000001'::uuid,
    'magic_edit_prepare', 'leased', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('1', 64), repeat('2', 64),
    '35000000-0000-4000-8000-000000000001'::uuid, 'operator',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  v_before_key := 'commands/35000000-0000-4000-8000-000000000001/previews/before/'
    || repeat('3', 64) || '.mp4';
  v_after_key := 'commands/35000000-0000-4000-8000-000000000001/previews/after/'
    || repeat('4', 64) || '.mp4';
  insert into public.video_studio_preview_upload_slots (
    command_id, job_id, runner_id_hash, side, content_sha256, content_md5,
    object_key, byte_size, content_type, slot_expires_at
  ) values
    (
      '35000000-0000-4000-8000-000000000001'::uuid,
      'job-prepare-cursor', repeat('a', 64), 'before', repeat('3', 64),
      repeat('1', 32), v_before_key, 1024, 'video/mp4', pg_catalog.now() - interval '1 hour'
    ),
    (
      '35000000-0000-4000-8000-000000000001'::uuid,
      'job-prepare-cursor', repeat('a', 64), 'after', repeat('4', 64),
      repeat('2', 32), v_after_key, 2048, 'video/mp4', pg_catalog.now() - interval '1 hour'
    );
  v_result_refs := pg_catalog.jsonb_build_object(
    'review_id', '15000000-0000-4000-8000-000000000002'::uuid,
    'candidate_hash', repeat('c', 64),
    'safe_title', 'Prepared candidate',
    'safe_summary', 'Candidate and source revision are deliberately different.',
    'review_payload', pg_catalog.jsonb_build_object(
      'semantic_target_map_hash', repeat('2', 64),
      'blocking_gates', v_gates
    ),
    'before_preview_object_key', v_before_key,
    'before_preview_hash', repeat('3', 64),
    'before_preview_md5', repeat('1', 32),
    'before_preview_byte_size', 1024,
    'after_preview_object_key', v_after_key,
    'after_preview_hash', repeat('4', 64),
    'after_preview_md5', repeat('2', 32),
    'after_preview_byte_size', 2048,
    'comparison_alignment', 'exact',
    'comparison_start_ms', 0,
    'comparison_end_ms', 5000,
    'result_source_event_count', 2,
    'result_source_event_chain_hash', repeat('3', 64),
    'result_source_revision_hash', repeat('0', 64)
  );
  select duplicate, slot_expires_at into v_slot_duplicate, v_slot_expires_at
  from public.video_studio_reserve_preview_upload(
    '35000000-0000-4000-8000-000000000001'::uuid,
    repeat('a', 64), repeat('b', 64), repeat('2', 64), 'before',
    repeat('3', 64), repeat('1', 32), 1024, 'video/mp4'
  );
  if not v_slot_duplicate or v_slot_expires_at <= pg_catalog.now() then
    raise exception 'fresh same-runner lease did not renew exact expired preview slot';
  end if;
  begin
    perform * from public.video_studio_reserve_preview_upload(
      '35000000-0000-4000-8000-000000000001'::uuid,
      repeat('a', 64), repeat('b', 64), repeat('2', 64), 'after',
      repeat('4', 64), repeat('f', 32), 2048, 'video/mp4'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'preview_slot_conflict' then raise; end if;
    v_failed := true;
  end;
  if not v_failed
    or exists (
      select 1 from public.video_studio_preview_upload_slots
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
        and side = 'after' and slot_expires_at > pg_catalog.now()
    ) then
    raise exception 'mismatched preview slot was renewed';
  end if;
  v_failed := false;
  begin
    insert into public.video_studio_command_receipts (
      command_id, job_id, runner_id_hash, command_hash, receipt_hash,
      receipt_signature, receipt_status, result_refs, hard_gates,
      retryable, safe_code, started_at, finished_at
    ) values (
      '35000000-0000-4000-8000-000000000001'::uuid,
      'job-prepare-cursor', repeat('a', 64), repeat('2', 64),
      md5('slot-renewal-receipt') || md5('slot-renewal-receipt-proof'),
      md5('slot-renewal-signature') || md5('slot-renewal-signature-proof'),
      'failed', '{}'::jsonb, v_gates, false, 'render_failed',
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
    perform * from public.video_studio_reserve_preview_upload(
      '35000000-0000-4000-8000-000000000001'::uuid,
      repeat('a', 64), repeat('b', 64), repeat('2', 64), 'after',
      repeat('4', 64), repeat('2', 32), 2048, 'video/mp4'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'preview_slot_conflict' then raise; end if;
    v_failed := true;
  end;
  if not v_failed
    or exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
    )
    or exists (
      select 1 from public.video_studio_preview_upload_slots
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
        and side = 'after' and slot_expires_at > pg_catalog.now()
    ) then
    raise exception 'preview slot was renewed after a receipt had already won';
  end if;
  v_failed := false;
  perform pg_temp.video_studio_expect_sql_error(
    $sql$
      update public.video_studio_preview_upload_slots
      set slot_expires_at = pg_catalog.now() + interval '5 minutes'
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
        and side = 'before'
    $sql$, 'append_only_violation'
  );
  begin
    perform * from public.video_studio_complete_command(
      '35000000-0000-4000-8000-000000000001'::uuid,
      'job-prepare-cursor', repeat('a', 64), repeat('b', 64), repeat('2', 64),
      pg_temp.video_studio_test_receipt_hash('35000000-0000-4000-8000-000000000001'::uuid),
      repeat('8', 64), 'succeeded',
      repeat('c', 64), repeat('d', 64),
      v_result_refs || pg_catalog.jsonb_build_object(
        'result_source_event_count', 1,
        'result_source_event_chain_hash', repeat('1', 64)
      ),
      v_gates, false, null,
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'stale_event_count' then raise; end if;
    v_failed := true;
  end;
  if not v_failed
    or exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
    )
    or exists (
      select 1 from public.video_studio_review_requests
      where id = '15000000-0000-4000-8000-000000000002'::uuid
    )
    or (select slot_expires_at from public.video_studio_preview_upload_slots
        where command_id = '35000000-0000-4000-8000-000000000001'::uuid
          and side = 'before') is distinct from v_slot_expires_at
    or exists (
      select 1 from public.video_studio_preview_upload_slots
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
        and side = 'after' and slot_expires_at > pg_catalog.now()
    ) then
    raise exception 'prepare completed without a new authenticated local event';
  end if;
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '35000000-0000-4000-8000-000000000001'::uuid,
      'job-prepare-cursor', repeat('a', 64), repeat('b', 64), repeat('2', 64),
      pg_temp.video_studio_test_receipt_hash('35000000-0000-4000-8000-000000000001'::uuid),
      repeat('6', 64), 'succeeded',
      repeat('c', 64), repeat('d', 64),
      v_result_refs || pg_catalog.jsonb_build_object(
        'result_source_revision_hash', repeat('e', 64)
      ),
      v_gates, false, null,
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_receipt' then raise; end if;
    v_failed := true;
  end;
  if not v_failed
    or exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
    )
    or (select status from public.video_studio_commands
        where id = '35000000-0000-4000-8000-000000000001'::uuid) <> 'leased'
    or (select source_event_count from public.video_studio_jobs
        where job_id = 'job-prepare-cursor') <> 1 then
    raise exception 'prepare source-revision mismatch did not roll back atomically';
  end if;
  v_failed := false;
  begin
    perform * from public.video_studio_complete_command(
      '35000000-0000-4000-8000-000000000001'::uuid,
      'job-prepare-cursor', repeat('a', 64), repeat('b', 64), repeat('2', 64),
      pg_temp.video_studio_test_receipt_hash('35000000-0000-4000-8000-000000000001'::uuid),
      repeat('a', 64), 'succeeded',
      repeat('c', 64), repeat('d', 64),
      v_result_refs || pg_catalog.jsonb_build_object(
        'before_preview_md5', repeat('f', 32)
      ),
      v_gates, false, null,
      pg_catalog.now() - interval '1 minute', pg_catalog.now()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'preview_slot_missing' then raise; end if;
    v_failed := true;
  end;
  if not v_failed
    or (select slot_expires_at from public.video_studio_preview_upload_slots
        where command_id = '35000000-0000-4000-8000-000000000001'::uuid
          and side = 'before') is distinct from v_slot_expires_at
    or exists (
      select 1 from public.video_studio_preview_upload_slots
      where command_id = '35000000-0000-4000-8000-000000000001'::uuid
        and side = 'after' and slot_expires_at > pg_catalog.now()
    ) then
    raise exception 'mismatched expired preview slot was refreshed';
  end if;
  perform * from public.video_studio_complete_command(
    '35000000-0000-4000-8000-000000000001'::uuid,
    'job-prepare-cursor', repeat('a', 64), repeat('b', 64), repeat('2', 64),
    pg_temp.video_studio_test_receipt_hash('35000000-0000-4000-8000-000000000001'::uuid),
    repeat('6', 64), 'succeeded',
    repeat('c', 64), repeat('d', 64),
    v_result_refs,
    v_gates, false, null,
    pg_catalog.now() - interval '1 minute', pg_catalog.now()
  );
  if (select source_event_count from public.video_studio_jobs where job_id = 'job-prepare-cursor') <> 2
    or (select source_event_chain_hash from public.video_studio_jobs where job_id = 'job-prepare-cursor')
      <> repeat('3', 64)
    or (select source_revision_hash from public.video_studio_jobs where job_id = 'job-prepare-cursor')
      <> repeat('0', 64)
    or (select source_revision_hash from public.video_studio_jobs where job_id = 'job-prepare-cursor')
      = repeat('c', 64)
    or (select pg_catalog.count(*) from public.video_studio_preview_upload_slots
        where command_id = '35000000-0000-4000-8000-000000000001'::uuid
          and slot_expires_at > pg_catalog.now()) <> 2 then
    raise exception 'prepare candidate hash contaminated global source revision';
  end if;
  if not exists (
    select 1 from public.video_studio_command_receipts
    where command_id = '35000000-0000-4000-8000-000000000001'::uuid
      and result_refs ->> 'result_source_event_count' = '2'
      and result_refs ->> 'result_source_event_chain_hash' = repeat('3', 64)
      and result_refs ->> 'result_source_revision_hash' = repeat('0', 64)
  ) then
    raise exception 'prepare receipt did not retain its signed source cursor';
  end if;
end;
$prepare_cursor$;

do $recovery_cursor$
declare
  v_gates jsonb := pg_catalog.jsonb_build_object(
    'truth', pg_catalog.jsonb_build_object('status', 'passed'),
    'rights', pg_catalog.jsonb_build_object('status', 'passed'),
    'confidentiality', pg_catalog.jsonb_build_object('status', 'passed'),
    'transcript_fidelity', pg_catalog.jsonb_build_object('status', 'passed'),
    'naming', pg_catalog.jsonb_build_object('status', 'passed')
  );
  v_root jsonb;
begin
  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '26000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('26000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-recovery-cursor', array['youtube_shorts']::text[],
      null, v_root,
      '16000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    result_receipt_hash, completed_at
  ) values (
    '36000000-0000-4000-8000-000000000001'::uuid,
    'job-recovery-cursor', 'youtube_shorts',
    '16000000-0000-4000-8000-000000000001'::uuid,
    'review_decision_record', 'failed', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('1', 64), repeat('2', 64),
    '36000000-0000-4000-8000-000000000001'::uuid, 'review_decision',
    repeat('3', 64), pg_catalog.now()
  );
  insert into public.video_studio_command_receipts (
    command_id, job_id, runner_id_hash, command_hash, receipt_hash,
    receipt_signature, receipt_status, result_refs, hard_gates,
    retryable, safe_code, started_at, finished_at
  ) values (
    '36000000-0000-4000-8000-000000000001'::uuid,
    'job-recovery-cursor', repeat('a', 64), repeat('2', 64), repeat('3', 64),
    repeat('4', 64), 'failed', '{}'::jsonb, v_gates,
    false, 'render_failed', pg_catalog.now() - interval '1 minute', pg_catalog.now()
  );
  insert into public.video_studio_review_requests (
    id, job_id, recovery_of_command_id, recovery_root_command_id,
    recovery_generation, binding_state, platform, gate, status, route_state,
    safe_title, safe_summary, parent_revision_hash, parent_artifact_hash,
    revision_hash, artifact_hash, candidate_hash, semantic_target_map_hash,
    safe_payload, truth_gate, rights_gate, confidentiality_gate,
    transcript_fidelity_gate, naming_gate, queues_activation,
    comparison_alignment, expires_at
  ) values (
    '16000000-0000-4000-8000-000000000002'::uuid,
    'job-recovery-cursor',
    '36000000-0000-4000-8000-000000000001'::uuid,
    '36000000-0000-4000-8000-000000000001'::uuid,
    1, 'queued', 'youtube_shorts', 'treatment', 'pending', 'standard',
    'Recovered review', 'Synthetic recovery binding fixture.',
    repeat('0', 64), repeat('1', 64), repeat('e', 64), repeat('f', 64),
    null, repeat('2', 64),
    pg_catalog.jsonb_build_object(
      'semantic_target_map_hash', repeat('2', 64),
      'blocking_gates', v_gates
    ),
    'passed', 'passed', 'passed', 'passed', 'passed', false,
    'unavailable', pg_catalog.now() + interval '30 days'
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by,
    lease_owner_hash, lease_token_hash, lease_expires_at, attempt_count
  ) values (
    '36000000-0000-4000-8000-000000000002'::uuid,
    'job-recovery-cursor', 'youtube_shorts',
    '16000000-0000-4000-8000-000000000002'::uuid,
    'review_recovery_record', 'leased', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null,
    pg_catalog.jsonb_build_object(
      'source_command_id', '36000000-0000-4000-8000-000000000001'::uuid,
      'source_review_id', '16000000-0000-4000-8000-000000000001'::uuid,
      'recovery_root_command_id', '36000000-0000-4000-8000-000000000001'::uuid,
      'recovery_generation', 1,
      'source_command_hash', repeat('2', 64),
      'source_terminal_reason', 'runner_failed_receipt'
    ),
    repeat('5', 64), repeat('6', 64),
    '36000000-0000-4000-8000-000000000002'::uuid, 'operator',
    repeat('a', 64), repeat('b', 64), pg_catalog.now() + interval '1 day', 1
  );
  insert into public.video_studio_command_recoveries (
    idempotency_key, recovery_hash, job_id, platform, root_command_id,
    source_command_id, source_review_id, recovery_review_id,
    binding_command_id, recovery_generation, prior_status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    submitted_at
  ) values (
    '36000000-0000-4000-8000-000000000002'::uuid,
    repeat('7', 64), 'job-recovery-cursor', 'youtube_shorts',
    '36000000-0000-4000-8000-000000000001'::uuid,
    '36000000-0000-4000-8000-000000000001'::uuid,
    '16000000-0000-4000-8000-000000000001'::uuid,
    '16000000-0000-4000-8000-000000000002'::uuid,
    '36000000-0000-4000-8000-000000000002'::uuid,
    1, 'failed', repeat('0', 64), repeat('1', 64), pg_catalog.now()
  );
  update public.video_studio_commands
  set status = 'attention',
      safe_code = 'attempts_exhausted',
      completed_at = pg_catalog.now(),
      lease_owner_hash = null,
      lease_token_hash = null,
      lease_expires_at = null,
      attempt_count = 5
  where id = '36000000-0000-4000-8000-000000000002'::uuid;
  update public.video_studio_review_requests
  set binding_state = 'failed'
  where id = '16000000-0000-4000-8000-000000000002'::uuid;
  perform * from public.video_studio_complete_command(
    '36000000-0000-4000-8000-000000000002'::uuid,
    'job-recovery-cursor', repeat('a', 64), repeat('b', 64), repeat('6', 64),
    pg_temp.video_studio_test_receipt_hash('36000000-0000-4000-8000-000000000002'::uuid),
    repeat('9', 64), 'succeeded',
    repeat('0', 64), repeat('1', 64),
    pg_catalog.jsonb_build_object(
      'comparison_alignment', 'unavailable',
      'result_source_event_count', 2,
      'result_source_event_chain_hash', repeat('a', 64),
      'result_source_revision_hash', repeat('0', 64)
    ),
    v_gates, false, null,
    pg_catalog.now() - interval '2 minutes', pg_catalog.now() - interval '1 minute'
  );
  if (select source_event_count from public.video_studio_jobs
      where job_id = 'job-recovery-cursor') <> 2
    or (select binding_state from public.video_studio_review_requests
        where id = '16000000-0000-4000-8000-000000000002'::uuid) <> 'ready'
    or not exists (
      select 1 from public.video_studio_command_receipts
      where command_id = '36000000-0000-4000-8000-000000000002'::uuid
        and result_refs ->> 'comparison_alignment' = 'unavailable'
        and result_refs ->> 'result_source_event_count' = '2'
        and result_refs ->> 'result_source_event_chain_hash' = repeat('a', 64)
        and result_refs ->> 'result_source_revision_hash' = repeat('0', 64)
    ) then
    raise exception 'recovery completion did not preserve and apply source cursor';
  end if;
end;
$recovery_cursor$;

do $never_claimed_recovery$
declare
  v_root jsonb;
  v_payload jsonb;
  v_submitted_at timestamptz := pg_catalog.clock_timestamp();
  v_failed boolean := false;
  v_duplicate boolean;
begin
  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '29000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('29000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-never-claimed-recovery', array['youtube_shorts']::text[], null, v_root,
      '19000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by, safe_code, completed_at
  ) values (
    '39000000-0000-4000-8000-000000000001'::uuid,
    'job-never-claimed-recovery', 'youtube_shorts',
    '19000000-0000-4000-8000-000000000001'::uuid,
    'review_decision_record', 'attention', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('3', 64), repeat('4', 64),
    '39000000-0000-4000-8000-000000000001'::uuid, 'review_decision',
    'command_expired', pg_catalog.clock_timestamp() - interval '1 minute'
  );
  v_payload := pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'recovery_id', '49000000-0000-4000-8000-000000000001'::uuid,
    'job_id', 'job-never-claimed-recovery',
    'platform', 'youtube_shorts',
    'source_review_id', '19000000-0000-4000-8000-000000000001'::uuid,
    'recovery_review_id', '49000000-0000-4000-8000-000000000001'::uuid,
    'source_command_id', '39000000-0000-4000-8000-000000000001'::uuid,
    'source_command_hash', repeat('4', 64),
    'source_terminal_reason', 'command_expired',
    'recovery_root_command_id', '39000000-0000-4000-8000-000000000001'::uuid,
    'recovery_generation', 1,
    'gate', 'treatment',
    'expected_parent_revision_hash', repeat('0', 64),
    'expected_parent_artifact_hash', repeat('1', 64),
    'review_revision_hash', repeat('e', 64),
    'review_artifact_hash', repeat('f', 64),
    'candidate_hash', null,
    'semantic_target_map_hash', repeat('2', 64),
    'recovered_by', 'Krish',
    'occurred_at', v_submitted_at
  );

  update public.video_studio_runner_heartbeats
  set runner_status = 'degraded', pending_receipts = 1,
      received_at = pg_catalog.clock_timestamp() - interval '10 minutes';
  begin
    perform * from public.video_studio_recover_failed_review(
      '39000000-0000-4000-8000-000000000001'::uuid,
      'job-never-claimed-recovery', 'youtube_shorts', repeat('0', 64), repeat('1', 64),
      '49000000-0000-4000-8000-000000000001'::uuid, v_submitted_at, repeat('5', 64),
      '49000000-0000-4000-8000-000000000001'::uuid,
      v_payload, repeat('6', 64), repeat('7', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'recovery_not_available' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'never-claimed recovery ignored absent healthy runner'; end if;

  insert into public.video_studio_runner_heartbeats (
    runner_id_hash, runner_status, software_commit, command_schema_versions,
    drive_state, active_command_id, pending_receipts, occurred_at, received_at
  ) values
    (repeat('b', 64), 'idle', 'unknown', array[1]::integer[], 'ready', null, 0,
     pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()),
    (repeat('c', 64), 'idle', 'unknown', array[1]::integer[], 'ready', null, 0,
     pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
  on conflict (runner_id_hash) do update
  set runner_status = excluded.runner_status,
      software_commit = excluded.software_commit,
      command_schema_versions = excluded.command_schema_versions,
      drive_state = excluded.drive_state,
      active_command_id = excluded.active_command_id,
      pending_receipts = excluded.pending_receipts,
      occurred_at = excluded.occurred_at,
      received_at = excluded.received_at;
  v_failed := false;
  begin
    perform * from public.video_studio_recover_failed_review(
      '39000000-0000-4000-8000-000000000001'::uuid,
      'job-never-claimed-recovery', 'youtube_shorts', repeat('0', 64), repeat('1', 64),
      '49000000-0000-4000-8000-000000000001'::uuid, v_submitted_at, repeat('5', 64),
      '49000000-0000-4000-8000-000000000001'::uuid,
      v_payload, repeat('6', 64), repeat('7', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'recovery_not_available' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'ambiguous healthy runners were accepted for recovery'; end if;

  update public.video_studio_runner_heartbeats
  set runner_status = 'degraded'
  where runner_id_hash = repeat('c', 64);
  select duplicate into v_duplicate
  from public.video_studio_recover_failed_review(
    '39000000-0000-4000-8000-000000000001'::uuid,
    'job-never-claimed-recovery', 'youtube_shorts', repeat('0', 64), repeat('1', 64),
    '49000000-0000-4000-8000-000000000001'::uuid, v_submitted_at, repeat('5', 64),
    '49000000-0000-4000-8000-000000000001'::uuid,
    v_payload, repeat('6', 64), repeat('7', 64)
  );
  if v_duplicate then raise exception 'first never-claimed recovery was marked duplicate'; end if;

  update public.video_studio_runner_heartbeats
  set runner_status = 'degraded', received_at = pg_catalog.clock_timestamp() - interval '10 minutes'
  where runner_id_hash = repeat('b', 64);
  select duplicate into v_duplicate
  from public.video_studio_recover_failed_review(
    '39000000-0000-4000-8000-000000000001'::uuid,
    'job-never-claimed-recovery', 'youtube_shorts', repeat('0', 64), repeat('1', 64),
    '49000000-0000-4000-8000-000000000001'::uuid, v_submitted_at, repeat('5', 64),
    '49000000-0000-4000-8000-000000000001'::uuid,
    v_payload, repeat('6', 64), repeat('7', 64)
  );
  if not v_duplicate then raise exception 'offline exact recovery retry lost idempotency'; end if;

  v_failed := false;
  begin
    perform * from public.video_studio_recover_failed_review(
      '39000000-0000-4000-8000-000000000001'::uuid,
      'job-never-claimed-recovery', 'youtube_shorts', repeat('0', 64), repeat('1', 64),
      '49000000-0000-4000-8000-000000000001'::uuid, v_submitted_at, repeat('8', 64),
      '49000000-0000-4000-8000-000000000001'::uuid,
      v_payload, repeat('6', 64), repeat('7', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'mismatched recovery idempotency key was reused'; end if;
end;
$never_claimed_recovery$;

do $runner_affinity$
declare
  v_root jsonb;
  v_claim record;
begin
  update public.video_studio_commands
  set status = 'cancelled',
      completed_at = pg_catalog.now(),
      lease_owner_hash = null,
      lease_token_hash = null,
      lease_expires_at = null
  where status in ('queued', 'leased');

  v_root := pg_temp.video_studio_test_state(
    'youtube_shorts', repeat('0', 64), repeat('1', 64), null,
    null, null, null, repeat('2', 64), 'needs_visual_review', 'standard'
  );
  perform * from public.video_studio_project_review(
    repeat('a', 64), 'unknown',
    '28000000-0000-4000-8000-000000000001'::uuid,
    pg_temp.video_studio_test_projection_hash('28000000-0000-4000-8000-000000000001'::uuid),
    pg_temp.video_studio_test_projection(
      'job-runner-affinity', array['youtube_shorts']::text[], null, v_root,
      '18000000-0000-4000-8000-000000000001'::uuid,
      1, repeat('1', 64), repeat('0', 64)
    )
  );
  insert into public.video_studio_commands (
    id, job_id, platform, review_id, command_kind, status,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, candidate_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    '38000000-0000-4000-8000-000000000001'::uuid,
    'job-runner-affinity', 'youtube_shorts',
    '18000000-0000-4000-8000-000000000001'::uuid,
    'review_decision_record', 'queued', repeat('0', 64), repeat('1', 64),
    repeat('2', 64), null, '{}'::jsonb, repeat('3', 64), repeat('4', 64),
    '38000000-0000-4000-8000-000000000001'::uuid, 'review_decision'
  );

  select * into v_claim
  from public.video_studio_claim_command(repeat('a', 64), repeat('b', 64), 30);
  if not found
    or v_claim.command_id <> '38000000-0000-4000-8000-000000000001'::uuid
    or (select last_lease_owner_hash from public.video_studio_commands
        where id = v_claim.command_id) <> repeat('a', 64) then
    raise exception 'first claim did not establish sticky runner ownership';
  end if;
  update public.video_studio_commands
  set lease_expires_at = pg_catalog.now() - interval '1 second'
  where id = '38000000-0000-4000-8000-000000000001'::uuid;

  select * into v_claim
  from public.video_studio_claim_command(repeat('f', 64), repeat('c', 64), 30);
  if found then raise exception 'different runner reclaimed an owned command'; end if;

  select * into v_claim
  from public.video_studio_claim_command(repeat('a', 64), repeat('d', 64), 30);
  if not found
    or v_claim.command_id <> '38000000-0000-4000-8000-000000000001'::uuid
    or (select last_lease_owner_hash from public.video_studio_commands
        where id = v_claim.command_id) <> repeat('a', 64)
    or (select last_lease_token_hash from public.video_studio_commands
        where id = v_claim.command_id) <> repeat('d', 64) then
    raise exception 'owning runner could not reclaim with a fresh lease';
  end if;
end;
$runner_affinity$;

rollback;
