\set ON_ERROR_STOP on

begin;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'mindmake_studio_sessions') then
    raise exception 'mindmake_studio_sessions missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'mindmake_studio_interaction_events') then
    raise exception 'mindmake_studio_interaction_events missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'mindmake_studio_learning_proposals') then
    raise exception 'mindmake_studio_learning_proposals missing';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'mindmake_studio_%'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'client role retained Studio session table privileges';
  end if;
end
$$;

insert into public.mindmake_studio_sessions (
  id, open_idempotency_key, open_request_hash, client, capabilities,
  repository_revision, opened_at, last_seen_at
) values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  repeat('a', 64),
  'claude_ai',
  array['session_read', 'feedback_write'],
  repeat('b', 40),
  '2026-09-07T09:00:00Z',
  '2026-09-07T09:00:00Z'
);

insert into public.mindmake_studio_interaction_events (
  event_id, idempotency_key, session_id, client, action,
  explicit_feedback_excerpt, detected_differences, inference,
  confirmation_state, tool_name, request_hash, occurred_at
) values (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'claude_ai',
  'feedback_corrected',
  'Move the Mindmake wordmark to the bottom left.',
  '[{"feature":"brand.footer.anchor","summary":"Moved right to left."}]'::jsonb,
  '{"rationale":"Use the bottom-left footer.","confidence":1,"scope":{"level":"treatment","key":"carousel_infographic"}}'::jsonb,
  'corrected',
  'studio.feedback.record',
  repeat('c', 64),
  '2026-09-07T09:01:00Z'
);

do $$
begin
  begin
    update public.mindmake_studio_interaction_events set action = 'feedback_recorded'
    where event_id = '33333333-3333-4333-8333-333333333333';
    raise exception 'append-only update unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'append_only_violation' then null; else raise; end if;
  end;
end
$$;

do $$
begin
  begin
    insert into public.mindmake_studio_learning_proposals (
      weekly_batch_id, proposal_class, assertion, scope, evidence_event_ids,
      independent_session_count, independent_job_count, regression_cases, proposed_change
    ) values (
      'week-2026-36', 'performance', 'Move proof earlier.',
      '{"level":"series","key":"built_with_ai"}'::jsonb,
      array['33333333-3333-4333-8333-333333333333'::uuid],
      1, 1, '["Preserve meaning."]'::jsonb,
      '{"kind":"preference_rule","summary":"Prefer earlier proof."}'::jsonb
    );
    raise exception 'weak performance evidence unexpectedly succeeded';
  exception when check_violation then null;
  end;
end
$$;

rollback;
