\set ON_ERROR_STOP on

create schema video_studio_concurrency_test;

create function video_studio_concurrency_test.state(
  p_platform text,
  p_artifact_hash text,
  p_semantic_target_map_hash text
) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'platform', p_platform,
    'active_revision_hash', repeat('a', 64),
    'active_artifact_hash', p_artifact_hash,
    'active_candidate_hash', null,
    'parent_revision_hash', null,
    'parent_artifact_hash', null,
    'parent_candidate_hash', null,
    'semantic_target_map_hash', p_semantic_target_map_hash,
    'editorial_state', 'needs_visual_review',
    'route_state', 'standard'
  );
$$;

create function video_studio_concurrency_test.projection(
  p_job_id text,
  p_platform text,
  p_artifact_hash text,
  p_semantic_target_map_hash text,
  p_review_id uuid
) returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'job', pg_catalog.jsonb_build_object(
      'job_id', p_job_id,
      'series', 'money_of_ai',
      'mode', 'solo',
      'target_platforms', pg_catalog.jsonb_build_array('youtube_shorts', 'linkedin'),
      'stage', 'treatment',
      'status', 'active',
      'safe_title', 'Concurrent projection fixture',
      'safe_summary', 'Synthetic metadata-only concurrency proof.',
      'source_event_count', 1,
      'source_event_chain_hash', repeat('b', 64),
      'source_revision_hash', repeat('a', 64)
    ),
    'expected_platform_state', null,
    'platform_state', video_studio_concurrency_test.state(
      p_platform, p_artifact_hash, p_semantic_target_map_hash
    ),
    'review', pg_catalog.jsonb_build_object(
      'id', p_review_id,
      'gate', 'treatment',
      'safe_title', 'Review the concurrent fixture',
      'safe_summary', 'No private content or media is present.',
      'parent_revision_hash', repeat('a', 64),
      'parent_artifact_hash', p_artifact_hash,
      'revision_hash', repeat('e', 64),
      'artifact_hash', repeat('f', 64),
      'candidate_hash', null,
      'route_state', 'standard',
      'safe_payload', pg_catalog.jsonb_build_object(
        'semantic_target_map_hash', p_semantic_target_map_hash,
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

-- Seed two synchronized platforms for the competing-command race.
select * from public.video_studio_project_review(
  repeat('a', 64), 'unknown',
  '40000000-0000-4000-8000-000000000001'::uuid,
  repeat('1', 64),
  video_studio_concurrency_test.projection(
    'job-concurrent-command', 'youtube_shorts', repeat('c', 64), repeat('d', 64),
    '41000000-0000-4000-8000-000000000001'::uuid
  )
);

select * from public.video_studio_project_review(
  repeat('a', 64), 'unknown',
  '40000000-0000-4000-8000-000000000002'::uuid,
  repeat('2', 64),
  video_studio_concurrency_test.projection(
    'job-concurrent-command', 'linkedin', repeat('6', 64), repeat('7', 64),
    '41000000-0000-4000-8000-000000000002'::uuid
  )
);
