begin;

insert into public.video_studio_jobs (
  job_id, target_platforms, series, mode, stage, status, safe_title, safe_summary
) values (
  'job-upgrade-fixture',
  array['youtube_shorts', 'linkedin']::text[],
  'money_of_ai',
  'solo',
  'treatment',
  'active',
  'Existing projected job',
  'Synthetic state created before acknowledged projection state support.'
);

insert into public.video_studio_job_platform_states (
  job_id, platform, editorial_state, runner_state, route_state,
  active_revision_hash, active_artifact_hash, active_candidate_hash,
  active_parent_revision_hash, active_parent_artifact_hash,
  active_parent_candidate_hash, semantic_target_map_hash
) values
  (
    'job-upgrade-fixture', 'youtube_shorts', 'needs_final_review', 'idle', 'standard',
    repeat('a', 64), repeat('b', 64), repeat('c', 64),
    repeat('1', 64), repeat('2', 64), null, repeat('3', 64)
  ),
  (
    'job-upgrade-fixture', 'linkedin', 'needs_final_review', 'idle', 'standard',
    repeat('a', 64), repeat('d', 64), null,
    null, null, null, repeat('6', 64)
  );

insert into public.video_studio_jobs (
  job_id, target_platforms, series, mode, stage, status, safe_title, safe_summary
) values (
  'job-ambiguous-upgrade-fixture',
  array['youtube_shorts', 'linkedin']::text[],
  'money_of_ai',
  'solo',
  'treatment',
  'active',
  'Ambiguous upgraded job',
  'Its platforms intentionally disagree so the global source revision stays unset.'
);

insert into public.video_studio_job_platform_states (
  job_id, platform, editorial_state, runner_state, route_state,
  active_revision_hash, active_artifact_hash, active_candidate_hash,
  active_parent_revision_hash, active_parent_artifact_hash,
  active_parent_candidate_hash, semantic_target_map_hash
) values
  (
    'job-ambiguous-upgrade-fixture', 'youtube_shorts', 'needs_visual_review', 'idle', 'standard',
    repeat('7', 64), repeat('8', 64), null,
    null, null, null, repeat('9', 64)
  ),
  (
    'job-ambiguous-upgrade-fixture', 'linkedin', 'needs_visual_review', 'idle', 'standard',
    repeat('a', 64), repeat('b', 64), null,
    null, null, null, repeat('c', 64)
  );

commit;
