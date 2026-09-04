-- Video Studio durable control plane.
--
-- Supabase stores safe projections, exact-parent commands, reviews, leases,
-- and receipts. The Windows runner remains authoritative for media and its
-- signed local event log. Raw media, transcripts, filesystem paths, OAuth
-- state, credentials, and raw runner logs are forbidden here.

begin;

create or replace function public.video_studio_valid_platforms(value text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.cardinality(value) between 1 and 4
    and value <@ array['youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels']::text[]
    and pg_catalog.cardinality(value) = (
      select pg_catalog.count(distinct platform)::integer from pg_catalog.unnest(value) as platform
    );
$$;

create table public.video_studio_jobs (
  job_id                       text primary key,
  operator_key                 text not null default 'krish' check (operator_key = 'krish'),
  target_platforms             text[] not null check (public.video_studio_valid_platforms(target_platforms)),
  series                       text not null check (series in ('money_of_ai', 'built_with_ai')),
  mode                         text not null check (mode in ('extract', 'solo', 'short_native')),
  stage                        text not null check (stage in (
    'brief', 'script', 'recording_brief', 'ingest', 'normalize', 'transcript',
    'source_analysis', 'candidates', 'claims', 'visual_plan', 'assets',
    'styleframes', 'animatic', 'treatment', 'render', 'qa', 'package', 'complete'
  )),
  status                       text not null default 'active' check (status in ('active', 'completed', 'blocked', 'archived')),
  safe_title                   text not null check (char_length(safe_title) between 1 and 200),
  safe_summary                 text not null check (char_length(safe_summary) between 1 and 600),
  source_ref_hash              text check (source_ref_hash is null or source_ref_hash ~ '^[a-f0-9]{64}$'),
  last_event_seq               bigint not null default 0 check (last_event_seq >= 0),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table public.video_studio_job_platform_states (
  job_id                       text not null references public.video_studio_jobs(job_id),
  platform                     text not null check (platform in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')),
  editorial_state              text not null default 'ingesting' check (editorial_state in (
    'ingesting', 'needs_story_review', 'needs_visual_review', 'needs_final_review',
    'needs_learning_confirmation', 'approved', 'blocked'
  )),
  runner_state                 text not null default 'offline' check (runner_state in ('offline', 'idle', 'queued', 'working', 'attention')),
  route_state                  text not null default 'standard' check (route_state in ('standard', 'requires_editorial_route')),
  active_revision_hash         text check (active_revision_hash is null or active_revision_hash ~ '^[a-f0-9]{64}$'),
  active_artifact_hash         text check (active_artifact_hash is null or active_artifact_hash ~ '^[a-f0-9]{64}$'),
  active_candidate_hash        text check (active_candidate_hash is null or active_candidate_hash ~ '^[a-f0-9]{64}$'),
  active_parent_revision_hash  text check (active_parent_revision_hash is null or active_parent_revision_hash ~ '^[a-f0-9]{64}$'),
  active_parent_artifact_hash  text check (active_parent_artifact_hash is null or active_parent_artifact_hash ~ '^[a-f0-9]{64}$'),
  active_parent_candidate_hash text check (active_parent_candidate_hash is null or active_parent_candidate_hash ~ '^[a-f0-9]{64}$'),
  semantic_target_map_hash     text check (semantic_target_map_hash is null or semantic_target_map_hash ~ '^[a-f0-9]{64}$'),
  runner_last_seen_at          timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  primary key (job_id, platform),
  constraint video_studio_platform_active_pair check (
    (active_revision_hash is null) = (active_artifact_hash is null)
  ),
  constraint video_studio_platform_parent_pair check (
    (active_parent_revision_hash is null) = (active_parent_artifact_hash is null)
    and (active_parent_candidate_hash is null or active_parent_revision_hash is not null)
  )
);

create table public.video_studio_review_requests (
  id                         uuid primary key default gen_random_uuid(),
  job_id                     text not null references public.video_studio_jobs(job_id),
  source_command_id          uuid,
  preview_source_command_id  uuid,
  recovery_of_command_id     uuid,
  recovery_root_command_id   uuid,
  recovery_generation        integer not null default 0 check (recovery_generation between 0 and 3),
  binding_state              text not null default 'ready' check (binding_state in ('queued', 'ready', 'failed')),
  platform                   text not null check (platform in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')),
  gate                       text not null check (gate in ('story', 'treatment', 'final', 'learning')),
  status                     text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes_requested', 'superseded')),
  route_state                text not null default 'standard' check (route_state in ('standard', 'requires_editorial_route')),
  safe_title                 text not null check (char_length(safe_title) between 1 and 200),
  safe_summary               text not null check (char_length(safe_summary) between 1 and 600),
  parent_revision_hash       text not null check (parent_revision_hash ~ '^[a-f0-9]{64}$'),
  parent_artifact_hash       text not null check (parent_artifact_hash ~ '^[a-f0-9]{64}$'),
  revision_hash              text not null check (revision_hash ~ '^[a-f0-9]{64}$'),
  artifact_hash              text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  candidate_hash             text check (candidate_hash is null or candidate_hash ~ '^[a-f0-9]{64}$'),
  projection_hash            text check (projection_hash is null or projection_hash ~ '^[a-f0-9]{64}$'),
  semantic_target_map_hash   text check (semantic_target_map_hash is null or semantic_target_map_hash ~ '^[a-f0-9]{64}$'),
  safe_payload               jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload) = 'object'),
  truth_gate                 text not null default 'pending' check (truth_gate in ('passed', 'blocked', 'pending')),
  rights_gate                text not null default 'pending' check (rights_gate in ('passed', 'blocked', 'pending')),
  confidentiality_gate       text not null default 'pending' check (confidentiality_gate in ('passed', 'blocked', 'pending')),
  transcript_fidelity_gate   text not null default 'pending' check (transcript_fidelity_gate in ('passed', 'blocked', 'pending')),
  naming_gate                text not null default 'pending' check (naming_gate in ('passed', 'blocked', 'pending')),
  queues_activation          boolean not null default false,
  before_preview_object_key  text,
  after_preview_object_key   text,
  preview_expires_at         timestamptz,
  comparison_alignment       text not null default 'unavailable' check (comparison_alignment in ('exact', 'unavailable')),
  comparison_start_ms        integer check (comparison_start_ms is null or comparison_start_ms between 0 and 86400000),
  comparison_end_ms          integer check (comparison_end_ms is null or comparison_end_ms between 0 and 86400000),
  decision                   text check (decision is null or decision in ('use_candidate', 'keep_current')),
  decision_feedback          text check (decision_feedback is null or char_length(decision_feedback) <= 1600),
  override_reason            text check (override_reason is null or char_length(override_reason) <= 800),
  decided_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  expires_at                 timestamptz,
  constraint video_studio_review_platform_state_fk
    foreign key (job_id, platform) references public.video_studio_job_platform_states(job_id, platform),
  constraint video_studio_review_comparison_range check (
    (
      comparison_alignment = 'unavailable'
      and comparison_start_ms is null
      and comparison_end_ms is null
      and before_preview_object_key is null
      and after_preview_object_key is null
      and preview_expires_at is null
      and preview_source_command_id is null
    )
    or (
      comparison_alignment = 'exact'
      and comparison_start_ms is not null
      and comparison_end_ms is not null
      and comparison_end_ms > comparison_start_ms
      and before_preview_object_key is not null
      and after_preview_object_key is not null
      and preview_expires_at is not null
      and preview_source_command_id is not null
    )
  ),
  constraint video_studio_review_activation_shape check (
    (candidate_hash is null or queues_activation)
    and (
      not queues_activation or (
        gate = 'treatment'
        and candidate_hash is not null
        and semantic_target_map_hash is not null
        and preview_source_command_id is not null
      )
    )
  ),
  constraint video_studio_review_recovery_shape check (
    (recovery_of_command_id is null and recovery_root_command_id is null and recovery_generation = 0 and binding_state = 'ready')
    or (
      recovery_of_command_id is not null
      and recovery_root_command_id is not null
      and recovery_generation between 1 and 3
    )
  )
);

create table public.video_studio_commands (
  id                             uuid primary key default gen_random_uuid(),
  schema_version                 integer not null default 1 check (schema_version = 1),
  job_id                         text not null references public.video_studio_jobs(job_id),
  platform                       text not null check (platform in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')),
  review_id                      uuid references public.video_studio_review_requests(id),
  command_kind                   text not null check (command_kind in (
    'magic_edit_prepare', 'magic_edit_activate', 'magic_edit_return_to_parent',
    'review_decision_record', 'review_recovery_record'
  )),
  status                         text not null default 'queued' check (status in ('queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled')),
  expected_parent_revision_hash  text not null check (expected_parent_revision_hash ~ '^[a-f0-9]{64}$'),
  expected_parent_artifact_hash  text not null check (expected_parent_artifact_hash ~ '^[a-f0-9]{64}$'),
  semantic_target_map_hash       text check (semantic_target_map_hash is null or semantic_target_map_hash ~ '^[a-f0-9]{64}$'),
  candidate_hash                 text check (candidate_hash is null or candidate_hash ~ '^[a-f0-9]{64}$'),
  payload                        jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash                   text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  command_hash                   text not null check (command_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key                uuid not null,
  requested_by                   text not null check (requested_by in ('operator', 'review_decision')),
  issued_at                      timestamptz not null default now(),
  expires_at                     timestamptz not null default (now() + interval '30 days'),
  not_before                     timestamptz not null default now(),
  lease_owner_hash               text check (lease_owner_hash is null or lease_owner_hash ~ '^[a-f0-9]{64}$'),
  lease_token_hash               text check (lease_token_hash is null or lease_token_hash ~ '^[a-f0-9]{64}$'),
  lease_expires_at               timestamptz,
  attempt_count                  integer not null default 0 check (attempt_count between 0 and 5),
  result_revision_hash           text check (result_revision_hash is null or result_revision_hash ~ '^[a-f0-9]{64}$'),
  result_artifact_hash           text check (result_artifact_hash is null or result_artifact_hash ~ '^[a-f0-9]{64}$'),
  result_receipt_hash            text check (result_receipt_hash is null or result_receipt_hash ~ '^[a-f0-9]{64}$'),
  safe_code                      text,
  completed_at                   timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint video_studio_command_platform_state_fk
    foreign key (job_id, platform) references public.video_studio_job_platform_states(job_id, platform),
  constraint video_studio_command_kind_shape check (
    (command_kind = 'magic_edit_prepare' and candidate_hash is null and semantic_target_map_hash is not null and review_id is not null)
    or (command_kind = 'magic_edit_activate' and candidate_hash is not null and semantic_target_map_hash is not null and review_id is not null)
    or (command_kind = 'review_decision_record' and semantic_target_map_hash is not null and review_id is not null)
    or (command_kind = 'review_recovery_record' and semantic_target_map_hash is not null and review_id is not null)
    or (command_kind = 'magic_edit_return_to_parent' and review_id is null and semantic_target_map_hash is null)
  ),
  constraint video_studio_command_idempotency_unique unique (requested_by, idempotency_key)
);

alter table public.video_studio_review_requests
  add constraint video_studio_review_source_command_fk
  foreign key (source_command_id) references public.video_studio_commands(id),
  add constraint video_studio_review_preview_source_command_fk
  foreign key (preview_source_command_id) references public.video_studio_commands(id);

alter table public.video_studio_review_requests
  add constraint video_studio_review_recovery_command_fk
  foreign key (recovery_of_command_id) references public.video_studio_commands(id),
  add constraint video_studio_review_recovery_root_fk
  foreign key (recovery_root_command_id) references public.video_studio_commands(id);

create table public.video_studio_review_events (
  id                        uuid primary key default gen_random_uuid(),
  review_id                 uuid not null references public.video_studio_review_requests(id),
  job_id                    text not null references public.video_studio_jobs(job_id),
  platform                  text not null check (platform in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')),
  command_id                uuid not null references public.video_studio_commands(id),
  idempotency_key           uuid not null unique,
  decision                  text not null check (decision in ('use_candidate', 'keep_current')),
  expected_parent_revision_hash text not null check (expected_parent_revision_hash ~ '^[a-f0-9]{64}$'),
  expected_parent_artifact_hash text not null check (expected_parent_artifact_hash ~ '^[a-f0-9]{64}$'),
  revision_hash             text not null check (revision_hash ~ '^[a-f0-9]{64}$'),
  artifact_hash             text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  decision_hash             text not null check (decision_hash ~ '^[a-f0-9]{64}$'),
  feedback                  text check (feedback is null or char_length(feedback) <= 1600),
  override_reason           text check (override_reason is null or char_length(override_reason) <= 800),
  learning_confirmation     jsonb check (learning_confirmation is null or jsonb_typeof(learning_confirmation) = 'object'),
  submitted_at              timestamptz not null,
  created_at                timestamptz not null default now()
);

create table public.video_studio_command_receipts (
  id                       uuid primary key default gen_random_uuid(),
  command_id               uuid not null references public.video_studio_commands(id),
  job_id                   text not null references public.video_studio_jobs(job_id),
  runner_id_hash           text not null check (runner_id_hash ~ '^[a-f0-9]{64}$'),
  command_hash             text not null check (command_hash ~ '^[a-f0-9]{64}$'),
  receipt_hash             text not null unique check (receipt_hash ~ '^[a-f0-9]{64}$'),
  receipt_signature        text not null check (receipt_signature ~ '^[a-f0-9]{64}$'),
  receipt_status           text not null check (receipt_status in ('succeeded', 'requires_editorial_route', 'failed')),
  result_revision_hash     text check (result_revision_hash is null or result_revision_hash ~ '^[a-f0-9]{64}$'),
  result_artifact_hash     text check (result_artifact_hash is null or result_artifact_hash ~ '^[a-f0-9]{64}$'),
  result_refs              jsonb not null default '{}'::jsonb check (jsonb_typeof(result_refs) = 'object'),
  hard_gates               jsonb not null default '{}'::jsonb check (jsonb_typeof(hard_gates) = 'object'),
  retryable                boolean not null default false,
  safe_code                text,
  started_at               timestamptz not null,
  finished_at              timestamptz not null,
  created_at               timestamptz not null default now(),
  constraint video_studio_receipt_time_order check (finished_at >= started_at)
);

create table public.video_studio_preview_upload_slots (
  id                  uuid primary key default gen_random_uuid(),
  command_id          uuid not null references public.video_studio_commands(id),
  job_id              text not null references public.video_studio_jobs(job_id),
  runner_id_hash      text not null check (runner_id_hash ~ '^[a-f0-9]{64}$'),
  side                text not null check (side in ('before', 'after')),
  content_sha256      text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  content_md5         text not null check (content_md5 ~ '^[a-f0-9]{32}$'),
  object_key          text not null unique,
  byte_size           integer not null check (byte_size between 1 and 26214400),
  content_type        text not null check (content_type = 'video/mp4'),
  slot_expires_at     timestamptz not null,
  created_at          timestamptz not null default now(),
  constraint video_studio_preview_slot_side_unique unique (command_id, side),
  constraint video_studio_preview_slot_key_shape check (
    object_key = 'commands/' || command_id::text || '/previews/' || side || '/' || content_sha256 || '.mp4'
  )
);

create table public.video_studio_runner_heartbeats (
  runner_id_hash       text primary key check (runner_id_hash ~ '^[a-f0-9]{64}$'),
  runner_status        text not null check (runner_status in ('idle', 'working', 'degraded')),
  software_commit      text not null check (software_commit = 'unknown' or software_commit ~ '^[a-f0-9]{40}$'),
  command_schema_versions integer[] not null default array[1]::integer[],
  drive_state          text not null check (drive_state in ('ready', 'unavailable', 'not_configured')),
  active_command_id    uuid references public.video_studio_commands(id),
  pending_receipts     integer not null default 0 check (pending_receipts between 0 and 10000),
  occurred_at          timestamptz not null,
  received_at          timestamptz not null default now()
);

create table public.video_studio_rate_limits (
  scope              text not null,
  identity_hash      text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  window_started_at  timestamptz not null,
  request_count      integer not null default 1 check (request_count > 0),
  primary key (scope, identity_hash, window_started_at)
);

create table public.video_studio_projection_events (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   uuid not null unique,
  projection_hash   text not null check (projection_hash ~ '^[a-f0-9]{64}$'),
  runner_id_hash    text not null check (runner_id_hash ~ '^[a-f0-9]{64}$'),
  software_commit   text not null check (software_commit = 'unknown' or software_commit ~ '^[a-f0-9]{40}$'),
  job_id            text not null references public.video_studio_jobs(job_id),
  platform          text not null check (platform in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')),
  review_id         uuid not null references public.video_studio_review_requests(id),
  created_at        timestamptz not null default now()
);

create table public.video_studio_preview_retention_events (
  slot_id              uuid primary key references public.video_studio_preview_upload_slots(id),
  command_id           uuid not null references public.video_studio_commands(id),
  retention_after      timestamptz not null,
  deleted_object_count integer not null check (deleted_object_count = 1),
  deleted_at           timestamptz not null default now()
);

create table public.video_studio_command_recoveries (
  idempotency_key       uuid primary key,
  recovery_hash         text not null check (recovery_hash ~ '^[a-f0-9]{64}$'),
  job_id                text not null references public.video_studio_jobs(job_id),
  platform              text not null check (platform in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')),
  root_command_id       uuid not null references public.video_studio_commands(id),
  source_command_id     uuid not null unique references public.video_studio_commands(id),
  source_review_id      uuid not null references public.video_studio_review_requests(id),
  recovery_review_id    uuid not null unique references public.video_studio_review_requests(id),
  binding_command_id    uuid not null unique references public.video_studio_commands(id),
  recovery_generation   integer not null check (recovery_generation between 1 and 3),
  prior_status          text not null check (prior_status in ('failed', 'attention')),
  expected_parent_revision_hash text not null check (expected_parent_revision_hash ~ '^[a-f0-9]{64}$'),
  expected_parent_artifact_hash text not null check (expected_parent_artifact_hash ~ '^[a-f0-9]{64}$'),
  requested_by          text not null default 'Krish' check (requested_by = 'Krish'),
  submitted_at          timestamptz not null,
  created_at            timestamptz not null default now()
);

create index video_studio_reviews_pending_idx
  on public.video_studio_review_requests (created_at desc)
  where status = 'pending' and binding_state = 'ready';
create index video_studio_reviews_job_idx
  on public.video_studio_review_requests (job_id, platform);
create index video_studio_reviews_preview_source_idx
  on public.video_studio_review_requests (preview_source_command_id)
  where preview_source_command_id is not null;
create unique index video_studio_reviews_source_command_idx
  on public.video_studio_review_requests (source_command_id)
  where source_command_id is not null;
create unique index video_studio_reviews_candidate_idx
  on public.video_studio_review_requests (job_id, platform, candidate_hash)
  where candidate_hash is not null and recovery_of_command_id is null;
create unique index video_studio_reviews_recovery_command_idx
  on public.video_studio_review_requests (recovery_of_command_id)
  where recovery_of_command_id is not null;
create index video_studio_reviews_recovery_root_idx
  on public.video_studio_review_requests (recovery_root_command_id, recovery_generation)
  where recovery_root_command_id is not null;
create unique index video_studio_reviews_projection_idx
  on public.video_studio_review_requests (projection_hash)
  where projection_hash is not null;
create unique index video_studio_commands_prepare_source_review_idx
  on public.video_studio_commands (review_id)
  where command_kind = 'magic_edit_prepare' and status in ('queued', 'leased', 'succeeded');
create index video_studio_commands_claim_idx
  on public.video_studio_commands (not_before, created_at)
  where status = 'queued';
create index video_studio_commands_expired_lease_idx
  on public.video_studio_commands (lease_expires_at)
  where status = 'leased';
create index video_studio_commands_job_idx
  on public.video_studio_commands (job_id, platform);
create index video_studio_commands_review_idx
  on public.video_studio_commands (review_id)
  where review_id is not null;
create index video_studio_review_events_review_idx
  on public.video_studio_review_events (review_id);
create index video_studio_review_events_job_idx
  on public.video_studio_review_events (job_id);
create index video_studio_review_events_command_idx
  on public.video_studio_review_events (command_id)
  where command_id is not null;
create index video_studio_receipts_command_idx
  on public.video_studio_command_receipts (command_id);
create index video_studio_receipts_job_idx
  on public.video_studio_command_receipts (job_id);
create index video_studio_preview_slots_job_idx
  on public.video_studio_preview_upload_slots (job_id);
create index video_studio_runner_active_command_idx
  on public.video_studio_runner_heartbeats (active_command_id)
  where active_command_id is not null;
create index video_studio_jobs_state_idx
  on public.video_studio_jobs (status, updated_at desc);
create index video_studio_rate_limits_expiry_idx
  on public.video_studio_rate_limits (window_started_at);
create index video_studio_projection_events_job_idx
  on public.video_studio_projection_events (job_id, platform, created_at desc);
create index video_studio_projection_events_review_idx
  on public.video_studio_projection_events (review_id);
create index video_studio_preview_retention_command_idx
  on public.video_studio_preview_retention_events (command_id);
create index video_studio_recoveries_job_idx
  on public.video_studio_command_recoveries (job_id, platform, created_at desc);
create index video_studio_recoveries_root_idx
  on public.video_studio_command_recoveries (root_command_id, created_at desc);
create index video_studio_recoveries_source_idx
  on public.video_studio_command_recoveries (source_command_id);
create index video_studio_recoveries_source_review_idx
  on public.video_studio_command_recoveries (source_review_id);
create index video_studio_recoveries_review_idx
  on public.video_studio_command_recoveries (recovery_review_id);

create or replace function public.video_studio_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger video_studio_jobs_touch_updated_at
before update on public.video_studio_jobs
for each row execute function public.video_studio_touch_updated_at();

create trigger video_studio_platform_states_touch_updated_at
before update on public.video_studio_job_platform_states
for each row execute function public.video_studio_touch_updated_at();

create trigger video_studio_commands_touch_updated_at
before update on public.video_studio_commands
for each row execute function public.video_studio_touch_updated_at();

create or replace function public.video_studio_reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only_violation' using errcode = 'P0001';
end;
$$;

create trigger video_studio_review_events_append_only
before update or delete on public.video_studio_review_events
for each row execute function public.video_studio_reject_append_only_mutation();

create trigger video_studio_receipts_append_only
before update or delete on public.video_studio_command_receipts
for each row execute function public.video_studio_reject_append_only_mutation();

create trigger video_studio_preview_slots_append_only
before update or delete on public.video_studio_preview_upload_slots
for each row execute function public.video_studio_reject_append_only_mutation();

create trigger video_studio_projection_events_append_only
before update or delete on public.video_studio_projection_events
for each row execute function public.video_studio_reject_append_only_mutation();

create trigger video_studio_preview_retention_events_append_only
before update or delete on public.video_studio_preview_retention_events
for each row execute function public.video_studio_reject_append_only_mutation();

create trigger video_studio_command_recoveries_append_only
before update or delete on public.video_studio_command_recoveries
for each row execute function public.video_studio_reject_append_only_mutation();

create or replace function public.video_studio_protect_command_core()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.schema_version is distinct from old.schema_version
    or new.job_id is distinct from old.job_id
    or new.platform is distinct from old.platform
    or new.review_id is distinct from old.review_id
    or new.command_kind is distinct from old.command_kind
    or new.expected_parent_revision_hash is distinct from old.expected_parent_revision_hash
    or new.expected_parent_artifact_hash is distinct from old.expected_parent_artifact_hash
    or new.semantic_target_map_hash is distinct from old.semantic_target_map_hash
    or new.candidate_hash is distinct from old.candidate_hash
    or new.payload is distinct from old.payload
    or new.payload_hash is distinct from old.payload_hash
    or new.command_hash is distinct from old.command_hash
    or new.idempotency_key is distinct from old.idempotency_key
    or new.requested_by is distinct from old.requested_by
    or new.issued_at is distinct from old.issued_at
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at then
    raise exception 'immutable_command_violation' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger video_studio_commands_protect_core
before update on public.video_studio_commands
for each row execute function public.video_studio_protect_command_core();

create trigger video_studio_commands_no_delete
before delete on public.video_studio_commands
for each row execute function public.video_studio_reject_append_only_mutation();

create or replace function public.video_studio_protect_review_core()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.binding_state is distinct from old.binding_state
    and (
      old.binding_state <> 'queued'
      or new.binding_state not in ('ready', 'failed')
      or old.recovery_of_command_id is null
    ) then
    raise exception 'invalid_review_binding_transition' using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id
    or new.job_id is distinct from old.job_id
    or new.source_command_id is distinct from old.source_command_id
    or new.preview_source_command_id is distinct from old.preview_source_command_id
    or new.recovery_of_command_id is distinct from old.recovery_of_command_id
    or new.recovery_root_command_id is distinct from old.recovery_root_command_id
    or new.recovery_generation is distinct from old.recovery_generation
    or new.platform is distinct from old.platform
    or new.gate is distinct from old.gate
    or new.route_state is distinct from old.route_state
    or new.safe_title is distinct from old.safe_title
    or new.safe_summary is distinct from old.safe_summary
    or new.parent_revision_hash is distinct from old.parent_revision_hash
    or new.parent_artifact_hash is distinct from old.parent_artifact_hash
    or new.revision_hash is distinct from old.revision_hash
    or new.artifact_hash is distinct from old.artifact_hash
    or new.candidate_hash is distinct from old.candidate_hash
    or new.projection_hash is distinct from old.projection_hash
    or new.semantic_target_map_hash is distinct from old.semantic_target_map_hash
    or new.safe_payload is distinct from old.safe_payload
    or new.truth_gate is distinct from old.truth_gate
    or new.rights_gate is distinct from old.rights_gate
    or new.confidentiality_gate is distinct from old.confidentiality_gate
    or new.transcript_fidelity_gate is distinct from old.transcript_fidelity_gate
    or new.naming_gate is distinct from old.naming_gate
    or new.queues_activation is distinct from old.queues_activation
    or new.before_preview_object_key is distinct from old.before_preview_object_key
    or new.after_preview_object_key is distinct from old.after_preview_object_key
    or new.preview_expires_at is distinct from old.preview_expires_at
    or new.comparison_alignment is distinct from old.comparison_alignment
    or new.comparison_start_ms is distinct from old.comparison_start_ms
    or new.comparison_end_ms is distinct from old.comparison_end_ms
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'immutable_review_violation' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger video_studio_reviews_protect_core
before update on public.video_studio_review_requests
for each row execute function public.video_studio_protect_review_core();

create trigger video_studio_reviews_no_delete
before delete on public.video_studio_review_requests
for each row execute function public.video_studio_reject_append_only_mutation();

create or replace function public.video_studio_take_rate_limit(
  p_scope text,
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer
) returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_scope !~ '^[a-z0-9:_-]{1,80}$'
    or p_identity_hash !~ '^[a-f0-9]{64}$'
    or p_limit not between 1 and 1000
    or p_window_seconds not between 1 and 3600 then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from pg_catalog.now()) / p_window_seconds) * p_window_seconds
  );

  -- Keep every identity/scope bounded without a privileged cron dependency.
  -- The expiry index makes this global cleanup cheap and no supported window
  -- can exceed one hour, so a 24-hour horizon never touches live state.
  delete from public.video_studio_rate_limits
  where window_started_at < pg_catalog.now() - interval '24 hours';

  insert into public.video_studio_rate_limits (scope, identity_hash, window_started_at, request_count)
  values (p_scope, p_identity_hash, v_window_start, 1)
  on conflict (scope, identity_hash, window_started_at)
  do update set request_count = public.video_studio_rate_limits.request_count + 1
  returning request_count into v_count;

  allowed := v_count <= p_limit;
  retry_after_seconds := case when allowed then 0 else greatest(
    1,
    pg_catalog.ceil(p_window_seconds - extract(epoch from (pg_catalog.now() - v_window_start)))::integer
  ) end;
  return next;
end;
$$;

create or replace function public.video_studio_preview_retention_candidates(
  p_cutoff timestamptz,
  p_limit integer
) returns table (
  slot_id uuid,
  command_id uuid,
  object_key text,
  retention_after timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100
    or p_cutoff > pg_catalog.now() - interval '7 days' then
    raise exception 'invalid_retention_request' using errcode = 'P0001';
  end if;
  return query
    select s.id, s.command_id, s.object_key,
      pg_catalog.coalesce(r.preview_expires_at, s.slot_expires_at) as retention_after
    from public.video_studio_preview_upload_slots s
    left join lateral (
      select pg_catalog.max(review_row.preview_expires_at) as preview_expires_at
      from public.video_studio_review_requests review_row
      where review_row.preview_source_command_id = s.command_id
    ) r on true
    where pg_catalog.coalesce(r.preview_expires_at, s.slot_expires_at) <= p_cutoff
      and not exists (
        select 1 from public.video_studio_preview_retention_events e
        where e.slot_id = s.id
      )
    order by pg_catalog.coalesce(r.preview_expires_at, s.slot_expires_at), s.id
    limit p_limit;
end;
$$;

create or replace function public.video_studio_record_preview_retention(
  p_slot_id uuid,
  p_command_id uuid,
  p_retention_after timestamptz,
  p_deleted_object_count integer
) returns table (duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.video_studio_preview_upload_slots%rowtype;
  v_existing public.video_studio_preview_retention_events%rowtype;
  v_retention_after timestamptz;
  v_inserted integer;
begin
  select * into v_slot
  from public.video_studio_preview_upload_slots
  where id = p_slot_id
  for update;
  if not found then raise exception 'invalid_retention_request' using errcode = 'P0001'; end if;
  select pg_catalog.coalesce(r.preview_expires_at, v_slot.slot_expires_at)
    into v_retention_after
  from (select 1) as singleton
  left join lateral (
    select pg_catalog.max(review_row.preview_expires_at) as preview_expires_at
    from public.video_studio_review_requests review_row
    where review_row.preview_source_command_id = v_slot.command_id
  ) r on true;
  if v_slot.command_id is distinct from p_command_id
    or v_retention_after is distinct from p_retention_after
    or v_retention_after > pg_catalog.now() - interval '7 days'
    or p_deleted_object_count <> 1 then
    raise exception 'invalid_retention_request' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.video_studio_preview_retention_events
  where slot_id = p_slot_id;
  if found then
    if v_existing.command_id <> p_command_id
      or v_existing.retention_after <> p_retention_after
      or v_existing.deleted_object_count <> p_deleted_object_count then
      raise exception 'retention_conflict' using errcode = 'P0001';
    end if;
    return query select true;
    return;
  end if;

  insert into public.video_studio_preview_retention_events (
    slot_id, command_id, retention_after, deleted_object_count
  ) values (
    p_slot_id, p_command_id, p_retention_after, p_deleted_object_count
  );
  get diagnostics v_inserted = row_count;
  return query select v_inserted = 0;
end;
$$;

create or replace function public.video_studio_project_review(
  p_runner_id_hash text,
  p_software_commit text,
  p_idempotency_key uuid,
  p_projection_hash text,
  p_projection jsonb
) returns table (
  duplicate boolean,
  job_id text,
  platform text,
  review_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_payload jsonb := p_projection -> 'job';
  v_state_payload jsonb := p_projection -> 'platform_state';
  v_review_payload jsonb := p_projection -> 'review';
  v_job_id text := v_job_payload ->> 'job_id';
  v_platform text := v_state_payload ->> 'platform';
  v_review_id uuid := (v_review_payload ->> 'id')::uuid;
  v_target_platforms text[] := array(
    select value from pg_catalog.jsonb_array_elements_text(v_job_payload -> 'target_platforms')
  );
  v_job public.video_studio_jobs%rowtype;
  v_state public.video_studio_job_platform_states%rowtype;
  v_review public.video_studio_review_requests%rowtype;
  v_event public.video_studio_projection_events%rowtype;
begin
  select * into v_event
  from public.video_studio_projection_events
  where idempotency_key = p_idempotency_key;
  if found then
    if v_event.projection_hash <> p_projection_hash
      or v_event.runner_id_hash <> p_runner_id_hash
      or v_event.job_id <> v_job_id
      or v_event.platform <> v_platform
      or v_event.review_id <> v_review_id then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return query select true, v_event.job_id, v_event.platform, v_event.review_id;
    return;
  end if;

  select * into v_job from public.video_studio_jobs where video_studio_jobs.job_id = v_job_id for update;
  if found then
    if v_job.series <> v_job_payload ->> 'series'
      or v_job.mode <> v_job_payload ->> 'mode'
      or v_job.target_platforms is distinct from v_target_platforms then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    update public.video_studio_jobs
    set stage = v_job_payload ->> 'stage',
        status = v_job_payload ->> 'status',
        safe_title = v_job_payload ->> 'safe_title',
        safe_summary = v_job_payload ->> 'safe_summary'
    where video_studio_jobs.job_id = v_job_id;
  else
    insert into public.video_studio_jobs (
      job_id, target_platforms, series, mode, stage, status, safe_title, safe_summary
    ) values (
      v_job_id, v_target_platforms, v_job_payload ->> 'series', v_job_payload ->> 'mode',
      v_job_payload ->> 'stage', v_job_payload ->> 'status',
      v_job_payload ->> 'safe_title', v_job_payload ->> 'safe_summary'
    );
  end if;

  select * into v_state
  from public.video_studio_job_platform_states
  where video_studio_job_platform_states.job_id = v_job_id
    and video_studio_job_platform_states.platform = v_platform
  for update;
  if found then
    if v_state.active_revision_hash is distinct from (v_state_payload ->> 'active_revision_hash')
      or v_state.active_artifact_hash is distinct from (v_state_payload ->> 'active_artifact_hash') then
      if exists (
        select 1 from public.video_studio_commands c
        where c.job_id = v_job_id and c.platform = v_platform and c.status in ('queued', 'leased')
      ) or v_state.active_revision_hash is distinct from (v_state_payload ->> 'parent_revision_hash')
        or v_state.active_artifact_hash is distinct from (v_state_payload ->> 'parent_artifact_hash')
        or v_state.active_candidate_hash is distinct from (v_state_payload ->> 'parent_candidate_hash') then
        raise exception 'projection_conflict' using errcode = 'P0001';
      end if;
    elsif v_state.active_candidate_hash is distinct from (v_state_payload ->> 'active_candidate_hash')
      or v_state.active_parent_revision_hash is distinct from (v_state_payload ->> 'parent_revision_hash')
      or v_state.active_parent_artifact_hash is distinct from (v_state_payload ->> 'parent_artifact_hash')
      or v_state.active_parent_candidate_hash is distinct from (v_state_payload ->> 'parent_candidate_hash')
      or v_state.semantic_target_map_hash is distinct from (v_state_payload ->> 'semantic_target_map_hash') then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    update public.video_studio_job_platform_states
    set editorial_state = v_state_payload ->> 'editorial_state',
        runner_state = 'idle',
        route_state = v_state_payload ->> 'route_state',
        active_revision_hash = v_state_payload ->> 'active_revision_hash',
        active_artifact_hash = v_state_payload ->> 'active_artifact_hash',
        active_candidate_hash = v_state_payload ->> 'active_candidate_hash',
        active_parent_revision_hash = v_state_payload ->> 'parent_revision_hash',
        active_parent_artifact_hash = v_state_payload ->> 'parent_artifact_hash',
        active_parent_candidate_hash = v_state_payload ->> 'parent_candidate_hash',
        semantic_target_map_hash = v_state_payload ->> 'semantic_target_map_hash',
        runner_last_seen_at = pg_catalog.now()
    where video_studio_job_platform_states.job_id = v_job_id
      and video_studio_job_platform_states.platform = v_platform;
  else
    insert into public.video_studio_job_platform_states (
      job_id, platform, editorial_state, runner_state, route_state,
      active_revision_hash, active_artifact_hash, active_candidate_hash,
      active_parent_revision_hash, active_parent_artifact_hash,
      active_parent_candidate_hash, semantic_target_map_hash, runner_last_seen_at
    ) values (
      v_job_id, v_platform, v_state_payload ->> 'editorial_state', 'idle',
      v_state_payload ->> 'route_state', v_state_payload ->> 'active_revision_hash',
      v_state_payload ->> 'active_artifact_hash', v_state_payload ->> 'active_candidate_hash',
      v_state_payload ->> 'parent_revision_hash', v_state_payload ->> 'parent_artifact_hash',
      v_state_payload ->> 'parent_candidate_hash', v_state_payload ->> 'semantic_target_map_hash',
      pg_catalog.now()
    );
  end if;

  select * into v_review from public.video_studio_review_requests where id = v_review_id;
  if found then
    if v_review.job_id <> v_job_id
      or v_review.platform <> v_platform
      or v_review.gate <> v_review_payload ->> 'gate'
      or v_review.status <> 'pending'
      or v_review.source_command_id is not null
      or v_review.preview_source_command_id is not null
      or v_review.recovery_of_command_id is not null
      or v_review.recovery_root_command_id is not null
      or v_review.recovery_generation <> 0
      or v_review.binding_state <> 'ready'
      or v_review.projection_hash is distinct from p_projection_hash
      or v_review.route_state <> v_review_payload ->> 'route_state'
      or v_review.safe_title <> v_review_payload ->> 'safe_title'
      or v_review.safe_summary <> v_review_payload ->> 'safe_summary'
      or v_review.parent_revision_hash <> v_review_payload ->> 'parent_revision_hash'
      or v_review.parent_artifact_hash <> v_review_payload ->> 'parent_artifact_hash'
      or v_review.revision_hash <> v_review_payload ->> 'revision_hash'
      or v_review.artifact_hash <> v_review_payload ->> 'artifact_hash'
      or v_review.candidate_hash is not null
      or v_review.semantic_target_map_hash <> v_state_payload ->> 'semantic_target_map_hash'
      or v_review.safe_payload is distinct from (v_review_payload -> 'safe_payload')
      or v_review.truth_gate <> v_review_payload -> 'hard_gates' -> 'truth' ->> 'status'
      or v_review.rights_gate <> v_review_payload -> 'hard_gates' -> 'rights' ->> 'status'
      or v_review.confidentiality_gate <> v_review_payload -> 'hard_gates' -> 'confidentiality' ->> 'status'
      or v_review.transcript_fidelity_gate <> v_review_payload -> 'hard_gates' -> 'transcript_fidelity' ->> 'status'
      or v_review.naming_gate <> v_review_payload -> 'hard_gates' -> 'naming' ->> 'status'
      or v_review.queues_activation
      or v_review.before_preview_object_key is not null
      or v_review.after_preview_object_key is not null
      or v_review.preview_expires_at is not null
      or v_review.comparison_alignment <> 'unavailable'
      or v_review.comparison_start_ms is not null
      or v_review.comparison_end_ms is not null
      or v_review.decision is not null
      or v_review.decision_feedback is not null
      or v_review.override_reason is not null
      or v_review.decided_at is not null
      or v_review.expires_at is not null
      or v_review.created_at <> (v_review_payload ->> 'created_at')::timestamptz then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
  else
    insert into public.video_studio_review_requests (
      id, job_id, platform, gate, status, route_state, safe_title, safe_summary,
      parent_revision_hash, parent_artifact_hash, revision_hash, artifact_hash,
      candidate_hash, projection_hash, semantic_target_map_hash, safe_payload, truth_gate, rights_gate,
      confidentiality_gate, transcript_fidelity_gate, naming_gate, queues_activation,
      comparison_alignment, created_at
    ) values (
      v_review_id, v_job_id, v_platform, v_review_payload ->> 'gate', 'pending',
      v_review_payload ->> 'route_state', v_review_payload ->> 'safe_title',
      v_review_payload ->> 'safe_summary', v_review_payload ->> 'parent_revision_hash',
      v_review_payload ->> 'parent_artifact_hash', v_review_payload ->> 'revision_hash',
      v_review_payload ->> 'artifact_hash', null, p_projection_hash,
      v_state_payload ->> 'semantic_target_map_hash', v_review_payload -> 'safe_payload',
      v_review_payload -> 'hard_gates' -> 'truth' ->> 'status',
      v_review_payload -> 'hard_gates' -> 'rights' ->> 'status',
      v_review_payload -> 'hard_gates' -> 'confidentiality' ->> 'status',
      v_review_payload -> 'hard_gates' -> 'transcript_fidelity' ->> 'status',
      v_review_payload -> 'hard_gates' -> 'naming' ->> 'status',
      false, 'unavailable', (v_review_payload ->> 'created_at')::timestamptz
    );
  end if;

  insert into public.video_studio_projection_events (
    idempotency_key, projection_hash, runner_id_hash, software_commit,
    job_id, platform, review_id
  ) values (
    p_idempotency_key, p_projection_hash, p_runner_id_hash, p_software_commit,
    v_job_id, v_platform, v_review_id
  );
  return query select false, v_job_id, v_platform, v_review_id;
end;
$$;

create or replace function public.video_studio_enqueue_command(
  p_job_id text,
  p_platform text,
  p_source_review_id uuid,
  p_command_kind text,
  p_candidate_hash text,
  p_expected_parent_revision_hash text,
  p_expected_parent_artifact_hash text,
  p_semantic_target_map_hash text,
  p_payload jsonb,
  p_payload_hash text,
  p_command_hash text,
  p_idempotency_key uuid,
  p_requested_by text default 'operator'
) returns table (
  command_id uuid,
  command_status text,
  duplicate boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.video_studio_jobs%rowtype;
  v_state public.video_studio_job_platform_states%rowtype;
  v_source_review public.video_studio_review_requests%rowtype;
  v_existing public.video_studio_commands%rowtype;
  v_command public.video_studio_commands%rowtype;
begin
  select * into v_job
  from public.video_studio_jobs j
  where j.job_id = p_job_id
  for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;

  select * into v_state
  from public.video_studio_job_platform_states s
  where s.job_id = p_job_id and s.platform = p_platform
  for update;
  if not found or not (p_platform = any(v_job.target_platforms)) then
    raise exception 'platform_mismatch' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.video_studio_commands
  where idempotency_key = p_idempotency_key
    and requested_by = p_requested_by;
  if found then
    if v_existing.job_id <> p_job_id
      or v_existing.platform <> p_platform
      or v_existing.review_id is distinct from p_source_review_id
      or v_existing.command_kind <> p_command_kind
      or v_existing.expected_parent_revision_hash <> p_expected_parent_revision_hash
      or v_existing.expected_parent_artifact_hash <> p_expected_parent_artifact_hash
      or v_existing.semantic_target_map_hash is distinct from p_semantic_target_map_hash
      or v_existing.payload is distinct from p_payload
      or v_existing.payload_hash <> p_payload_hash
      or v_existing.candidate_hash is distinct from p_candidate_hash
      or v_existing.command_hash <> p_command_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return query select v_existing.id, v_existing.status, true, v_existing.created_at;
    return;
  end if;

  if v_state.active_revision_hash is distinct from p_expected_parent_revision_hash
    or v_state.active_artifact_hash is distinct from p_expected_parent_artifact_hash then
    raise exception 'stale_parent' using errcode = 'P0001';
  end if;

  if p_command_kind = 'magic_edit_prepare' then
    select * into v_source_review
    from public.video_studio_review_requests r
    where r.id = p_source_review_id
    for update;
    if not found
      or v_source_review.status <> 'pending'
      or v_source_review.binding_state <> 'ready'
      or (v_source_review.expires_at is not null and v_source_review.expires_at <= pg_catalog.now())
      or v_source_review.job_id <> p_job_id
      or v_source_review.platform <> p_platform
      or v_source_review.parent_revision_hash <> p_expected_parent_revision_hash
      or v_source_review.parent_artifact_hash <> p_expected_parent_artifact_hash
      or v_source_review.semantic_target_map_hash is distinct from p_semantic_target_map_hash
      or exists (
        select 1 from public.video_studio_commands c
        where c.review_id = p_source_review_id
          and c.command_kind = 'magic_edit_prepare'
          and c.status in ('queued', 'leased', 'succeeded')
      ) then
      raise exception 'source_review_conflict' using errcode = 'P0001';
    end if;
  elsif p_source_review_id is not null then
    raise exception 'invalid_command_shape' using errcode = 'P0001';
  end if;

  if p_command_kind = 'magic_edit_prepare' and (
    p_candidate_hash is not null
    or p_semantic_target_map_hash is null
    or p_semantic_target_map_hash is distinct from v_state.semantic_target_map_hash
  ) then
    raise exception 'invalid_command_shape' using errcode = 'P0001';
  end if;

  if p_payload ->> 'job_id' is distinct from p_job_id
    or p_payload ->> 'platform' is distinct from p_platform
    or p_payload ->> 'expected_parent_revision_hash' is distinct from p_expected_parent_revision_hash
    or p_payload ->> 'expected_parent_artifact_hash' is distinct from p_expected_parent_artifact_hash
    or (
      p_command_kind = 'magic_edit_prepare'
      and p_payload ->> 'direction_id' is distinct from p_idempotency_key::text
    )
    or (
      p_command_kind = 'magic_edit_return_to_parent'
      and p_payload ->> 'return_id' is distinct from p_idempotency_key::text
    )
    or (
      p_command_kind = 'magic_edit_prepare'
      and p_payload ->> 'semantic_target_map_hash' is distinct from p_semantic_target_map_hash
    ) then
    raise exception 'invalid_command_shape' using errcode = 'P0001';
  end if;

  if p_command_kind = 'magic_edit_return_to_parent'
    and p_candidate_hash is distinct from v_state.active_candidate_hash then
    raise exception 'invalid_lineage' using errcode = 'P0001';
  end if;

  if p_command_kind = 'magic_edit_return_to_parent' and (
    v_state.active_parent_revision_hash is distinct from (p_payload ->> 'target_parent_revision_hash')
    or v_state.active_parent_artifact_hash is distinct from (p_payload ->> 'target_parent_artifact_hash')
  ) then
    raise exception 'invalid_lineage' using errcode = 'P0001';
  end if;

  insert into public.video_studio_commands (
    job_id, platform, review_id, command_kind, candidate_hash, expected_parent_revision_hash,
    expected_parent_artifact_hash, semantic_target_map_hash, payload, payload_hash,
    command_hash, idempotency_key, requested_by
  ) values (
    p_job_id, p_platform, p_source_review_id, p_command_kind, p_candidate_hash, p_expected_parent_revision_hash,
    p_expected_parent_artifact_hash, p_semantic_target_map_hash, p_payload, p_payload_hash,
    p_command_hash, p_idempotency_key, p_requested_by
  ) returning * into v_command;

  update public.video_studio_job_platform_states
  set runner_state = 'queued'
  where video_studio_job_platform_states.job_id = p_job_id
    and video_studio_job_platform_states.platform = p_platform;

  return query select v_command.id, v_command.status, false, v_command.created_at;
end;
$$;

create or replace function public.video_studio_record_decision(
  p_review_id uuid,
  p_idempotency_key uuid,
  p_expected_parent_revision_hash text,
  p_expected_parent_artifact_hash text,
  p_revision_hash text,
  p_artifact_hash text,
  p_decision text,
  p_feedback text,
  p_override_reason text,
  p_learning_confirmation jsonb,
  p_submitted_at text,
  p_decision_hash text,
  p_runner_payload jsonb,
  p_runner_payload_hash text,
  p_runner_command_hash text
) returns table (
  review_status text,
  result_action text,
  command_id uuid,
  command_status text,
  command_created_at timestamptz,
  duplicate boolean,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.video_studio_review_requests%rowtype;
  v_job public.video_studio_jobs%rowtype;
  v_state public.video_studio_job_platform_states%rowtype;
  v_event public.video_studio_review_events%rowtype;
  v_command_id uuid;
  v_command_status text;
  v_command_created_at timestamptz;
  v_decided_at timestamptz := pg_catalog.now();
  v_stored_status text;
  v_runner_payload jsonb;
  v_command_kind text;
begin
  select * into v_review
  from public.video_studio_review_requests
  where id = p_review_id
  for update;
  if not found then raise exception 'review_not_found' using errcode = 'P0001'; end if;

  select * into v_job
  from public.video_studio_jobs j
  where j.job_id = v_review.job_id
  for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;

  select * into v_state
  from public.video_studio_job_platform_states s
  where s.job_id = v_review.job_id and s.platform = v_review.platform
  for update;
  if not found or not (v_review.platform = any(v_job.target_platforms)) then
    raise exception 'platform_mismatch' using errcode = 'P0001';
  end if;

  select * into v_event
  from public.video_studio_review_events
  where idempotency_key = p_idempotency_key;
  if found then
    if v_event.review_id <> p_review_id or v_event.decision_hash <> p_decision_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return query
      select v_review.status, v_event.decision, v_event.command_id,
        (select c.status from public.video_studio_commands c where c.id = v_event.command_id),
        (select c.created_at from public.video_studio_commands c where c.id = v_event.command_id),
        true, v_event.created_at;
    return;
  end if;

  if v_review.status <> 'pending' then raise exception 'review_not_pending' using errcode = 'P0001'; end if;
  if v_review.binding_state <> 'ready' then raise exception 'review_binding_pending' using errcode = 'P0001'; end if;
  if v_review.expires_at is not null and v_review.expires_at <= pg_catalog.now() then
    raise exception 'review_expired' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.video_studio_commands c
    where c.review_id = p_review_id
      and c.command_kind = 'magic_edit_prepare'
      and c.status in ('queued', 'leased')
  ) then
    raise exception 'review_in_progress' using errcode = 'P0001';
  end if;
  if v_state.active_revision_hash is distinct from p_expected_parent_revision_hash
    or v_state.active_artifact_hash is distinct from p_expected_parent_artifact_hash
    or v_review.parent_revision_hash <> p_expected_parent_revision_hash
    or v_review.parent_artifact_hash <> p_expected_parent_artifact_hash
    or v_review.revision_hash <> p_revision_hash
    or v_review.artifact_hash <> p_artifact_hash then
    raise exception 'stale_parent' using errcode = 'P0001';
  end if;

  if p_decision = 'use_candidate' and not (
    v_review.truth_gate = 'passed'
    and v_review.rights_gate = 'passed'
    and v_review.confidentiality_gate = 'passed'
    and v_review.transcript_fidelity_gate = 'passed'
    and v_review.naming_gate = 'passed'
  ) then
    raise exception 'hard_gate_blocked' using errcode = 'P0001';
  end if;

  if p_decision = 'use_candidate' and v_review.queues_activation
    and v_review.candidate_hash is null then
    raise exception 'candidate_missing' using errcode = 'P0001';
  end if;

  if p_decision = 'use_candidate' and not v_review.queues_activation
    and v_review.candidate_hash is not null then
    raise exception 'invalid_decision_payload' using errcode = 'P0001';
  end if;

  if (v_review.gate = 'learning' and p_learning_confirmation is null)
    or (v_review.gate <> 'learning' and p_learning_confirmation is not null)
    or (p_override_reason is not null and p_decision <> 'use_candidate') then
    raise exception 'invalid_decision_payload' using errcode = 'P0001';
  end if;

  v_stored_status := case when p_decision = 'use_candidate' then 'approved' else 'rejected' end;

  if p_decision = 'use_candidate' and v_review.queues_activation then
    v_command_kind := 'magic_edit_activate';
    v_runner_payload := pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'activation_id', p_idempotency_key,
      'job_id', v_review.job_id,
      'platform', v_review.platform,
      'candidate_hash', v_review.candidate_hash,
      'expected_parent_revision_hash', v_state.active_revision_hash,
      'expected_parent_artifact_hash', v_state.active_artifact_hash,
      'prepared_treatment_artifact_hash', v_review.artifact_hash,
      'decision', 'activate',
      'approved_by', 'Krish',
      'confirmation_ref', 'control-center-confirmation:treatment:' || v_review.artifact_hash
        || ':review:' || v_review.id::text || ':decision:' || p_idempotency_key::text,
      'occurred_at', p_submitted_at
    );
  else
    v_command_kind := 'review_decision_record';
    v_runner_payload := pg_catalog.jsonb_build_object(
      'schema_version', 1,
      'decision_id', p_idempotency_key,
      'job_id', v_review.job_id,
      'platform', v_review.platform,
      'review_id', v_review.id,
      'gate', v_review.gate,
      'candidate_hash', v_review.candidate_hash,
      'semantic_target_map_hash', v_review.semantic_target_map_hash,
      'expected_parent_revision_hash', v_state.active_revision_hash,
      'expected_parent_artifact_hash', v_state.active_artifact_hash,
      'review_revision_hash', v_review.revision_hash,
      'review_artifact_hash', v_review.artifact_hash,
      'decision', p_decision,
      'feedback', p_feedback,
      'override_reason', p_override_reason,
      'learning_confirmation', p_learning_confirmation,
      'decided_by', 'Krish',
      'occurred_at', p_submitted_at
    );
  end if;

  if p_runner_payload is distinct from v_runner_payload then
    raise exception 'invalid_decision_payload' using errcode = 'P0001';
  end if;

  insert into public.video_studio_commands (
    job_id, platform, review_id, command_kind, candidate_hash,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, payload, payload_hash, command_hash,
    idempotency_key, requested_by
  ) values (
    v_review.job_id, v_review.platform, v_review.id, v_command_kind,
    v_review.candidate_hash, v_state.active_revision_hash, v_state.active_artifact_hash,
    v_review.semantic_target_map_hash, v_runner_payload, p_runner_payload_hash,
    p_runner_command_hash, p_idempotency_key, 'review_decision'
  ) returning id, status, created_at into v_command_id, v_command_status, v_command_created_at;

  update public.video_studio_review_requests
  set status = v_stored_status,
      decision = p_decision,
      decision_feedback = p_feedback,
      override_reason = p_override_reason,
      decided_at = v_decided_at
  where id = p_review_id;

  insert into public.video_studio_review_events (
    review_id, job_id, platform, command_id, idempotency_key, decision,
    expected_parent_revision_hash, expected_parent_artifact_hash, revision_hash,
    artifact_hash, decision_hash, feedback, override_reason, learning_confirmation,
    submitted_at, created_at
  ) values (
    p_review_id, v_review.job_id, v_review.platform, v_command_id, p_idempotency_key, p_decision,
    p_expected_parent_revision_hash, p_expected_parent_artifact_hash, p_revision_hash,
    p_artifact_hash, p_decision_hash, p_feedback, p_override_reason,
    p_learning_confirmation, p_submitted_at::timestamptz, v_decided_at
  );

  update public.video_studio_job_platform_states
  set runner_state = 'queued'
    where video_studio_job_platform_states.job_id = v_review.job_id
      and video_studio_job_platform_states.platform = v_review.platform;

  return query select v_stored_status, p_decision, v_command_id, v_command_status,
    v_command_created_at, false, v_decided_at;
end;
$$;

create or replace function public.video_studio_recover_failed_review(
  p_command_id uuid,
  p_job_id text,
  p_platform text,
  p_expected_parent_revision_hash text,
  p_expected_parent_artifact_hash text,
  p_idempotency_key uuid,
  p_submitted_at timestamptz,
  p_recovery_hash text,
  p_recovery_review_id uuid,
  p_runner_payload jsonb,
  p_runner_payload_hash text,
  p_runner_command_hash text
) returns table (
  duplicate boolean,
  recovery_review_id uuid,
  recovery_generation integer,
  job_id text,
  platform text,
  review_status text,
  parent_revision_hash text,
  parent_artifact_hash text,
  created_at timestamptz,
  binding_command_id uuid,
  binding_command_status text,
  binding_command_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.video_studio_commands%rowtype;
  v_source_review public.video_studio_review_requests%rowtype;
  v_state public.video_studio_job_platform_states%rowtype;
  v_existing public.video_studio_command_recoveries%rowtype;
  v_recovery_review public.video_studio_review_requests%rowtype;
  v_binding_command public.video_studio_commands%rowtype;
  v_root_command_id uuid;
  v_generation integer;
  v_expected_payload jsonb;
begin
  if p_job_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{1,95}$'
    or p_platform not in ('youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels')
    or p_expected_parent_revision_hash !~ '^[a-f0-9]{64}$'
    or p_expected_parent_artifact_hash !~ '^[a-f0-9]{64}$'
    or p_recovery_hash !~ '^[a-f0-9]{64}$'
    or p_runner_payload_hash !~ '^[a-f0-9]{64}$'
    or p_runner_command_hash !~ '^[a-f0-9]{64}$'
    or p_recovery_review_id is distinct from p_idempotency_key then
    raise exception 'invalid_recovery_request' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.video_studio_command_recoveries
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recovery_hash <> p_recovery_hash
      or v_existing.source_command_id <> p_command_id
      or v_existing.job_id <> p_job_id
      or v_existing.platform <> p_platform
      or v_existing.recovery_review_id <> p_recovery_review_id
      or v_existing.expected_parent_revision_hash <> p_expected_parent_revision_hash
      or v_existing.expected_parent_artifact_hash <> p_expected_parent_artifact_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    select * into v_recovery_review
    from public.video_studio_review_requests
    where id = v_existing.recovery_review_id;
    if not found or v_recovery_review.status <> 'pending' then
      raise exception 'recovery_conflict' using errcode = 'P0001';
    end if;
    select * into v_binding_command
    from public.video_studio_commands
    where id = v_existing.binding_command_id;
    if not found
      or v_binding_command.review_id <> v_recovery_review.id
      or v_binding_command.command_kind <> 'review_recovery_record'
      or v_binding_command.payload is distinct from p_runner_payload
      or v_binding_command.payload_hash <> p_runner_payload_hash
      or v_binding_command.command_hash <> p_runner_command_hash
      or (
        v_binding_command.status = 'succeeded'
        and v_recovery_review.binding_state <> 'ready'
      )
      or (
        v_binding_command.status in ('failed', 'attention')
        and v_recovery_review.binding_state <> 'failed'
      )
      or (
        v_binding_command.status in ('queued', 'leased', 'cancelled')
        and v_recovery_review.binding_state <> 'queued'
      ) then
      raise exception 'recovery_conflict' using errcode = 'P0001';
    end if;
    return query select true, v_recovery_review.id, v_existing.recovery_generation, v_recovery_review.job_id,
      v_recovery_review.platform, 'pending'::text,
      v_recovery_review.parent_revision_hash, v_recovery_review.parent_artifact_hash,
      v_recovery_review.created_at, v_binding_command.id, v_binding_command.status,
      v_binding_command.created_at;
    return;
  end if;

  select * into v_command
  from public.video_studio_commands
  where id = p_command_id
  for update;
  if not found then raise exception 'command_not_found' using errcode = 'P0001'; end if;
  if v_command.job_id <> p_job_id
    or v_command.platform <> p_platform
    or v_command.expected_parent_revision_hash <> p_expected_parent_revision_hash
    or v_command.expected_parent_artifact_hash <> p_expected_parent_artifact_hash then
    raise exception 'stale_parent' using errcode = 'P0001';
  end if;
  if v_command.command_kind not in ('magic_edit_activate', 'review_decision_record')
    or v_command.status not in ('failed', 'attention')
    or (
      v_command.status = 'attention'
      and pg_catalog.coalesce(v_command.safe_code, '') not in ('attempts_exhausted', 'command_expired')
    )
    or v_command.review_id is null then
    raise exception 'recovery_not_available' using errcode = 'P0001';
  end if;
  if v_command.status = 'failed' and not exists (
    select 1
    from public.video_studio_command_receipts receipt
    where receipt.command_id = v_command.id
      and receipt.command_hash = v_command.command_hash
      and receipt.receipt_hash = v_command.result_receipt_hash
      and receipt.receipt_status = 'failed'
      and receipt.retryable = false
  ) then
    raise exception 'recovery_not_available' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.video_studio_command_recoveries
  where source_command_id = p_command_id;
  if found then raise exception 'recovery_exists' using errcode = 'P0001'; end if;

  select * into v_source_review
  from public.video_studio_review_requests
  where id = v_command.review_id
  for update;
  if not found
    or v_source_review.job_id <> p_job_id
    or v_source_review.platform <> p_platform
    or v_source_review.parent_revision_hash <> p_expected_parent_revision_hash
    or v_source_review.parent_artifact_hash <> p_expected_parent_artifact_hash
    or v_source_review.binding_state <> 'ready' then
    raise exception 'recovery_conflict' using errcode = 'P0001';
  end if;
  if v_source_review.id = p_recovery_review_id then
    raise exception 'invalid_recovery_request' using errcode = 'P0001';
  end if;
  if v_source_review.queues_activation and (
    v_source_review.preview_expires_at is null
    or v_source_review.preview_expires_at <= pg_catalog.now()
    or v_source_review.comparison_alignment <> 'exact'
    or v_source_review.before_preview_object_key is null
    or v_source_review.after_preview_object_key is null
  ) then
    raise exception 'recovery_preview_expired' using errcode = 'P0001';
  end if;

  select * into v_state
  from public.video_studio_job_platform_states
  where video_studio_job_platform_states.job_id = p_job_id
    and video_studio_job_platform_states.platform = p_platform
  for update;
  if not found
    or v_state.active_revision_hash is distinct from p_expected_parent_revision_hash
    or v_state.active_artifact_hash is distinct from p_expected_parent_artifact_hash then
    raise exception 'stale_parent' using errcode = 'P0001';
  end if;

  v_root_command_id := pg_catalog.coalesce(v_source_review.recovery_root_command_id, p_command_id);
  v_generation := v_source_review.recovery_generation + 1;
  if v_generation > 3 then raise exception 'recovery_limit_reached' using errcode = 'P0001'; end if;

  v_expected_payload := pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'recovery_id', p_idempotency_key,
    'job_id', v_source_review.job_id,
    'platform', v_source_review.platform,
    'source_review_id', v_source_review.id,
    'recovery_review_id', p_recovery_review_id,
    'source_command_id', v_command.id,
    'source_command_hash', v_command.command_hash,
    'source_terminal_reason', case
      when v_command.status = 'failed' then 'runner_failed_receipt'
      else v_command.safe_code
    end,
    'recovery_root_command_id', v_root_command_id,
    'recovery_generation', v_generation,
    'gate', v_source_review.gate,
    'expected_parent_revision_hash', v_source_review.parent_revision_hash,
    'expected_parent_artifact_hash', v_source_review.parent_artifact_hash,
    'review_revision_hash', v_source_review.revision_hash,
    'review_artifact_hash', v_source_review.artifact_hash,
    'candidate_hash', v_source_review.candidate_hash,
    'semantic_target_map_hash', v_source_review.semantic_target_map_hash,
    'recovered_by', 'Krish',
    'occurred_at', p_submitted_at
  );
  if p_runner_payload is distinct from v_expected_payload then
    raise exception 'invalid_recovery_request' using errcode = 'P0001';
  end if;

  insert into public.video_studio_review_requests (
    id, job_id, source_command_id, preview_source_command_id,
    recovery_of_command_id, recovery_root_command_id,
    recovery_generation, binding_state, platform, gate, status, route_state, safe_title, safe_summary,
    parent_revision_hash, parent_artifact_hash, revision_hash, artifact_hash,
    candidate_hash, projection_hash, semantic_target_map_hash, safe_payload,
    truth_gate, rights_gate, confidentiality_gate, transcript_fidelity_gate, naming_gate,
    queues_activation, before_preview_object_key, after_preview_object_key,
    preview_expires_at, comparison_alignment, comparison_start_ms, comparison_end_ms,
    expires_at
  ) values (
    p_recovery_review_id, v_source_review.job_id, null, v_source_review.preview_source_command_id,
    p_command_id, v_root_command_id,
    v_generation, 'queued', v_source_review.platform, v_source_review.gate, 'pending',
    v_source_review.route_state, v_source_review.safe_title, v_source_review.safe_summary,
    v_source_review.parent_revision_hash, v_source_review.parent_artifact_hash,
    v_source_review.revision_hash, v_source_review.artifact_hash,
    v_source_review.candidate_hash, null, v_source_review.semantic_target_map_hash,
    v_source_review.safe_payload, v_source_review.truth_gate, v_source_review.rights_gate,
    v_source_review.confidentiality_gate, v_source_review.transcript_fidelity_gate,
    v_source_review.naming_gate, v_source_review.queues_activation,
    v_source_review.before_preview_object_key, v_source_review.after_preview_object_key,
    v_source_review.preview_expires_at, v_source_review.comparison_alignment,
    v_source_review.comparison_start_ms, v_source_review.comparison_end_ms,
    pg_catalog.now() + interval '30 days'
  ) returning * into v_recovery_review;

  insert into public.video_studio_commands (
    job_id, platform, review_id, command_kind, candidate_hash,
    expected_parent_revision_hash, expected_parent_artifact_hash,
    semantic_target_map_hash, payload, payload_hash, command_hash,
    idempotency_key, requested_by
  ) values (
    v_source_review.job_id, v_source_review.platform, v_recovery_review.id,
    'review_recovery_record', v_source_review.candidate_hash,
    v_source_review.parent_revision_hash, v_source_review.parent_artifact_hash,
    v_source_review.semantic_target_map_hash, v_expected_payload, p_runner_payload_hash,
    p_runner_command_hash, p_idempotency_key, 'operator'
  ) returning * into v_binding_command;

  insert into public.video_studio_command_recoveries (
    idempotency_key, recovery_hash, job_id, platform, root_command_id,
    source_command_id, source_review_id, recovery_review_id, binding_command_id, recovery_generation,
    prior_status, expected_parent_revision_hash, expected_parent_artifact_hash,
    submitted_at
  ) values (
    p_idempotency_key, p_recovery_hash, p_job_id, p_platform, v_root_command_id,
    p_command_id, v_source_review.id, v_recovery_review.id, v_binding_command.id, v_generation,
    v_command.status, p_expected_parent_revision_hash, p_expected_parent_artifact_hash,
    p_submitted_at
  );

  update public.video_studio_job_platform_states
  set runner_state = 'queued'
  where video_studio_job_platform_states.job_id = p_job_id
    and video_studio_job_platform_states.platform = p_platform;

  return query select false, v_recovery_review.id, v_generation, v_recovery_review.job_id,
    v_recovery_review.platform, v_recovery_review.status,
    v_recovery_review.parent_revision_hash, v_recovery_review.parent_artifact_hash,
    v_recovery_review.created_at, v_binding_command.id, v_binding_command.status,
    v_binding_command.created_at;
end;
$$;

create or replace function public.video_studio_claim_command(
  p_runner_id_hash text,
  p_lease_token_hash text,
  p_lease_seconds integer
) returns table (
  command_id uuid,
  schema_version integer,
  command_kind text,
  job_id text,
  platform text,
  candidate_hash text,
  expected_parent_revision_hash text,
  expected_parent_artifact_hash text,
  semantic_target_map_hash text,
  payload_hash text,
  command_hash text,
  payload jsonb,
  idempotency_key uuid,
  issued_at timestamptz,
  expires_at timestamptz,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.video_studio_commands%rowtype;
begin
  if p_runner_id_hash !~ '^[a-f0-9]{64}$'
    or p_lease_token_hash !~ '^[a-f0-9]{64}$'
    or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_lease' using errcode = 'P0001';
  end if;

  with expired as (
    update public.video_studio_commands as c
    set status = 'attention',
        safe_code = 'command_expired',
        completed_at = pg_catalog.now(),
        lease_owner_hash = null,
        lease_token_hash = null,
        lease_expires_at = null
    where (
        c.status = 'queued'
        or (c.status = 'leased' and c.lease_expires_at < pg_catalog.now())
      )
      and c.expires_at <= pg_catalog.now()
    returning c.id, c.job_id, c.platform, c.review_id, c.command_kind
  ), failed_bindings as (
    update public.video_studio_review_requests as r
    set binding_state = 'failed'
    where r.id in (
      select expired.review_id from expired
      where expired.command_kind = 'review_recovery_record'
    )
      and r.binding_state = 'queued'
    returning r.id
  )
  update public.video_studio_job_platform_states as s
  set runner_state = 'attention'
  where (s.job_id, s.platform) in (select expired.job_id, expired.platform from expired);

  with exhausted as (
    update public.video_studio_commands as c
    set status = 'attention',
        safe_code = 'attempts_exhausted',
        completed_at = pg_catalog.now(),
        lease_owner_hash = null,
        lease_token_hash = null,
        lease_expires_at = null
    where (
        c.status = 'queued'
        or (c.status = 'leased' and c.lease_expires_at < pg_catalog.now())
      )
      and c.attempt_count >= 5
    returning c.id, c.job_id, c.platform, c.review_id, c.command_kind
  ), failed_bindings as (
    update public.video_studio_review_requests as r
    set binding_state = 'failed'
    where r.id in (
      select exhausted.review_id from exhausted
      where exhausted.command_kind = 'review_recovery_record'
    )
      and r.binding_state = 'queued'
    returning r.id
  )
  update public.video_studio_job_platform_states as s
  set runner_state = 'attention'
  where (s.job_id, s.platform) in (select exhausted.job_id, exhausted.platform from exhausted);

  select * into v_command
  from public.video_studio_commands c
  where (
      c.status = 'queued'
      or (c.status = 'leased' and c.lease_expires_at < pg_catalog.now())
    )
    and c.not_before <= pg_catalog.now()
    and c.expires_at > pg_catalog.now()
    and c.attempt_count < 5
  order by c.created_at
  for update skip locked
  limit 1;

  if not found then return; end if;

  update public.video_studio_commands
  set status = 'leased',
      lease_owner_hash = p_runner_id_hash,
      lease_token_hash = p_lease_token_hash,
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
  where id = v_command.id
  returning * into v_command;

  update public.video_studio_job_platform_states
  set runner_state = 'working', runner_last_seen_at = pg_catalog.now()
  where video_studio_job_platform_states.job_id = v_command.job_id
    and video_studio_job_platform_states.platform = v_command.platform;

  return query select
    v_command.id, v_command.schema_version, v_command.command_kind, v_command.job_id,
    v_command.platform, v_command.candidate_hash,
    v_command.expected_parent_revision_hash, v_command.expected_parent_artifact_hash,
    v_command.semantic_target_map_hash, v_command.payload_hash, v_command.command_hash,
    v_command.payload, v_command.idempotency_key, v_command.issued_at, v_command.expires_at,
    v_command.lease_expires_at;
end;
$$;

create or replace function public.video_studio_record_heartbeat(
  p_runner_id_hash text,
  p_runner_status text,
  p_software_commit text,
  p_command_schema_versions integer[],
  p_drive_state text,
  p_active_command_id uuid,
  p_pending_receipts integer,
  p_occurred_at timestamptz,
  p_lease_token_hash text,
  p_lease_seconds integer
) returns table (accepted boolean, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease_expires_at timestamptz;
begin
  if p_active_command_id is not null then
    update public.video_studio_commands
    set lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds)
    where id = p_active_command_id
      and status = 'leased'
      and lease_owner_hash = p_runner_id_hash
      and lease_token_hash = p_lease_token_hash
      and lease_expires_at > pg_catalog.now()
    returning video_studio_commands.lease_expires_at into v_lease_expires_at;
    if not found then
      accepted := false;
      lease_expires_at := null;
      return next;
      return;
    end if;
  end if;

  insert into public.video_studio_runner_heartbeats (
    runner_id_hash, runner_status, software_commit, command_schema_versions,
    drive_state, active_command_id, pending_receipts, occurred_at, received_at
  ) values (
    p_runner_id_hash, p_runner_status, p_software_commit, p_command_schema_versions,
    p_drive_state, p_active_command_id, p_pending_receipts, p_occurred_at, pg_catalog.now()
  ) on conflict (runner_id_hash) do update set
    runner_status = excluded.runner_status,
    software_commit = excluded.software_commit,
    command_schema_versions = excluded.command_schema_versions,
    drive_state = excluded.drive_state,
    active_command_id = excluded.active_command_id,
    pending_receipts = excluded.pending_receipts,
    occurred_at = excluded.occurred_at,
    received_at = pg_catalog.now();

  accepted := true;
  lease_expires_at := v_lease_expires_at;
  return next;
end;
$$;

create or replace function public.video_studio_reserve_preview_upload(
  p_command_id uuid,
  p_runner_id_hash text,
  p_lease_token_hash text,
  p_command_hash text,
  p_side text,
  p_content_sha256 text,
  p_content_md5 text,
  p_byte_size integer,
  p_content_type text
) returns table (object_key text, duplicate boolean, slot_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.video_studio_commands%rowtype;
  v_existing public.video_studio_preview_upload_slots%rowtype;
  v_object_key text;
  v_expires_at timestamptz := pg_catalog.now() + interval '2 hours';
begin
  select * into v_command
  from public.video_studio_commands
  where id = p_command_id
  for update;
  if not found then raise exception 'command_not_found' using errcode = 'P0001'; end if;
  if v_command.command_hash <> p_command_hash then
    raise exception 'preview_slot_conflict' using errcode = 'P0001';
  end if;
  if v_command.status <> 'leased'
    or v_command.lease_owner_hash <> p_runner_id_hash
    or v_command.lease_token_hash <> p_lease_token_hash then
    raise exception 'lease_conflict' using errcode = 'P0001';
  end if;
  if v_command.lease_expires_at <= pg_catalog.now() then
    raise exception 'lease_expired' using errcode = 'P0001';
  end if;
  if p_side not in ('before', 'after')
    or p_content_sha256 !~ '^[a-f0-9]{64}$'
    or p_content_md5 !~ '^[a-f0-9]{32}$'
    or p_byte_size not between 1 and 26214400
    or p_content_type <> 'video/mp4' then
    raise exception 'invalid_preview_slot' using errcode = 'P0001';
  end if;

  v_object_key := 'commands/' || p_command_id::text || '/previews/' || p_side
    || '/' || p_content_sha256 || '.mp4';
  select * into v_existing
  from public.video_studio_preview_upload_slots
  where command_id = p_command_id and side = p_side;
  if found then
    if v_existing.runner_id_hash <> p_runner_id_hash
      or v_existing.content_sha256 <> p_content_sha256
      or v_existing.content_md5 <> p_content_md5
      or v_existing.object_key <> v_object_key
      or v_existing.byte_size <> p_byte_size
      or v_existing.content_type <> p_content_type then
      raise exception 'preview_slot_conflict' using errcode = 'P0001';
    end if;
    return query select v_existing.object_key, true, v_existing.slot_expires_at;
    return;
  end if;

  insert into public.video_studio_preview_upload_slots (
    command_id, job_id, runner_id_hash, side, content_sha256, content_md5,
    object_key, byte_size, content_type, slot_expires_at
  ) values (
    p_command_id, v_command.job_id, p_runner_id_hash, p_side, p_content_sha256, p_content_md5,
    v_object_key, p_byte_size, p_content_type, v_expires_at
  );
  return query select v_object_key, false, v_expires_at;
end;
$$;

create or replace function public.video_studio_complete_command(
  p_command_id uuid,
  p_job_id text,
  p_runner_id_hash text,
  p_lease_token_hash text,
  p_command_hash text,
  p_receipt_hash text,
  p_receipt_signature text,
  p_receipt_status text,
  p_result_revision_hash text,
  p_result_artifact_hash text,
  p_result_refs jsonb,
  p_hard_gates jsonb,
  p_retryable boolean,
  p_safe_code text,
  p_started_at timestamptz,
  p_finished_at timestamptz
) returns table (
  command_status text,
  duplicate boolean,
  review_id uuid,
  activation_eligible boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.video_studio_commands%rowtype;
  v_state public.video_studio_job_platform_states%rowtype;
  v_receipt public.video_studio_command_receipts%rowtype;
  v_recovery public.video_studio_command_recoveries%rowtype;
  v_source_review public.video_studio_review_requests%rowtype;
  v_source_command public.video_studio_commands%rowtype;
  v_review_id uuid;
  v_status text;
  v_all_gates_passed boolean;
  v_effective_receipt_status text := p_receipt_status;
  v_route_state text := 'standard';
begin
  select * into v_command
  from public.video_studio_commands
  where id = p_command_id
  for update;
  if not found then raise exception 'command_not_found' using errcode = 'P0001'; end if;
  if v_command.job_id <> p_job_id then raise exception 'receipt_conflict' using errcode = 'P0001'; end if;
  if p_retryable then raise exception 'invalid_receipt' using errcode = 'P0001'; end if;

  select * into v_receipt
  from public.video_studio_command_receipts
  where receipt_hash = p_receipt_hash;
  if found then
    if v_receipt.command_id <> p_command_id
      or v_receipt.job_id <> p_job_id
      or v_receipt.runner_id_hash <> p_runner_id_hash
      or v_receipt.command_hash <> p_command_hash
      or v_receipt.receipt_signature <> p_receipt_signature
      or v_command.result_receipt_hash <> p_receipt_hash
      or v_command.status not in ('succeeded', 'failed', 'attention') then
      raise exception 'receipt_conflict' using errcode = 'P0001';
    end if;
    if v_command.command_kind = 'magic_edit_prepare' then
      select id into v_review_id
      from public.video_studio_review_requests
      where source_command_id = v_command.id;
    else
      v_review_id := v_command.review_id;
    end if;
    return query
      select v_command.status, true, v_review_id,
        (v_receipt.hard_gates -> 'truth' ->> 'status' = 'passed'
          and v_receipt.hard_gates -> 'rights' ->> 'status' = 'passed'
          and v_receipt.hard_gates -> 'confidentiality' ->> 'status' = 'passed'
          and v_receipt.hard_gates -> 'transcript_fidelity' ->> 'status' = 'passed'
          and v_receipt.hard_gates -> 'naming' ->> 'status' = 'passed');
    return;
  end if;

  if v_command.command_hash <> p_command_hash then raise exception 'receipt_conflict' using errcode = 'P0001'; end if;
  if v_command.status <> 'leased'
    or v_command.lease_owner_hash <> p_runner_id_hash
    or v_command.lease_token_hash <> p_lease_token_hash then
    raise exception 'lease_conflict' using errcode = 'P0001';
  end if;
  if v_command.lease_expires_at <= pg_catalog.now() then raise exception 'lease_expired' using errcode = 'P0001'; end if;

  select * into v_state
  from public.video_studio_job_platform_states s
  where s.job_id = v_command.job_id and s.platform = v_command.platform
  for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if v_state.active_revision_hash is distinct from v_command.expected_parent_revision_hash
    or v_state.active_artifact_hash is distinct from v_command.expected_parent_artifact_hash then
    raise exception 'stale_parent' using errcode = 'P0001';
  end if;

  v_all_gates_passed :=
    p_hard_gates -> 'truth' ->> 'status' = 'passed'
    and p_hard_gates -> 'rights' ->> 'status' = 'passed'
    and p_hard_gates -> 'confidentiality' ->> 'status' = 'passed'
    and p_hard_gates -> 'transcript_fidelity' ->> 'status' = 'passed'
    and p_hard_gates -> 'naming' ->> 'status' = 'passed';

  if v_command.command_kind = 'magic_edit_prepare'
    and p_receipt_status = 'succeeded' then
    if p_result_refs ->> 'review_id' is null
      or p_result_refs ->> 'review_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or p_result_refs ->> 'candidate_hash' is null
      or p_result_refs ->> 'candidate_hash' !~ '^[a-f0-9]{64}$'
      or p_result_revision_hash is distinct from (p_result_refs ->> 'candidate_hash')
      or pg_catalog.jsonb_typeof(p_result_refs -> 'review_payload') <> 'object'
      or p_result_refs -> 'review_payload' ->> 'semantic_target_map_hash'
        is distinct from v_command.semantic_target_map_hash
      or p_result_refs ->> 'before_preview_object_key' is null
      or p_result_refs ->> 'before_preview_hash' is null
      or p_result_refs ->> 'before_preview_md5' is null
      or p_result_refs ->> 'before_preview_md5' !~ '^[a-f0-9]{32}$'
      or p_result_refs ->> 'before_preview_byte_size' is null
      or p_result_refs ->> 'before_preview_byte_size' !~ '^[0-9]+$'
      or p_result_refs ->> 'after_preview_object_key' is null
      or p_result_refs ->> 'after_preview_hash' is null
      or p_result_refs ->> 'after_preview_md5' is null
      or p_result_refs ->> 'after_preview_md5' !~ '^[a-f0-9]{32}$'
      or p_result_refs ->> 'after_preview_byte_size' is null
      or p_result_refs ->> 'after_preview_byte_size' !~ '^[0-9]+$'
      or p_result_refs ->> 'comparison_start_ms' is null
      or p_result_refs ->> 'comparison_start_ms' !~ '^[0-9]+$'
      or p_result_refs ->> 'comparison_end_ms' is null
      or p_result_refs ->> 'comparison_end_ms' !~ '^[0-9]+$'
      or p_result_refs ->> 'comparison_alignment' <> 'exact' then
      raise exception 'invalid_preview_refs' using errcode = 'P0001';
    end if;
    if (p_result_refs ->> 'comparison_start_ms')::bigint not between 0 and 86400000
      or (p_result_refs ->> 'comparison_end_ms')::bigint not between 1 and 86400000
      or (p_result_refs ->> 'comparison_end_ms')::bigint <= (p_result_refs ->> 'comparison_start_ms')::bigint then
      raise exception 'invalid_preview_refs' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.video_studio_preview_upload_slots s
      where s.command_id = p_command_id
        and s.runner_id_hash = p_runner_id_hash
        and s.side = 'before'
        and s.object_key = p_result_refs ->> 'before_preview_object_key'
        and s.content_sha256 = p_result_refs ->> 'before_preview_hash'
        and s.content_md5 = p_result_refs ->> 'before_preview_md5'
        and s.byte_size = (p_result_refs ->> 'before_preview_byte_size')::integer
        and s.content_type = 'video/mp4'
        and s.slot_expires_at > pg_catalog.now()
    ) or not exists (
      select 1 from public.video_studio_preview_upload_slots s
      where s.command_id = p_command_id
        and s.runner_id_hash = p_runner_id_hash
        and s.side = 'after'
        and s.object_key = p_result_refs ->> 'after_preview_object_key'
        and s.content_sha256 = p_result_refs ->> 'after_preview_hash'
        and s.content_md5 = p_result_refs ->> 'after_preview_md5'
        and s.byte_size = (p_result_refs ->> 'after_preview_byte_size')::integer
        and s.content_type = 'video/mp4'
        and s.slot_expires_at > pg_catalog.now()
    ) then
      raise exception 'preview_slot_missing' using errcode = 'P0001';
    end if;
  elsif v_command.command_kind = 'magic_edit_prepare'
    and p_receipt_status = 'requires_editorial_route' then
    if p_result_refs ->> 'review_id' is null
      or p_result_refs ->> 'review_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or p_result_refs ? 'candidate_hash'
      or p_result_refs ? 'before_preview_object_key'
      or p_result_refs ? 'before_preview_hash'
      or p_result_refs ? 'before_preview_md5'
      or p_result_refs ? 'before_preview_byte_size'
      or p_result_refs ? 'after_preview_object_key'
      or p_result_refs ? 'after_preview_hash'
      or p_result_refs ? 'after_preview_md5'
      or p_result_refs ? 'after_preview_byte_size'
      or p_result_refs ? 'comparison_start_ms'
      or p_result_refs ? 'comparison_end_ms'
      or p_result_refs ->> 'comparison_alignment' <> 'unavailable'
      or pg_catalog.jsonb_typeof(p_result_refs -> 'review_payload') <> 'object'
      or p_result_refs -> 'review_payload' ->> 'semantic_target_map_hash'
        is distinct from v_command.semantic_target_map_hash
      or p_result_revision_hash is distinct from v_command.expected_parent_revision_hash
      or p_result_artifact_hash is distinct from v_command.expected_parent_artifact_hash
      or v_all_gates_passed then
      raise exception 'invalid_editorial_route' using errcode = 'P0001';
    end if;
  end if;

  if v_command.command_kind <> 'magic_edit_prepare' and p_result_refs ? 'review_id' then
    raise exception 'invalid_receipt' using errcode = 'P0001';
  end if;

  if v_command.command_kind = 'review_recovery_record' then
    select * into v_recovery
    from public.video_studio_command_recoveries
    where binding_command_id = v_command.id;
    if not found
      or v_recovery.recovery_review_id is distinct from v_command.review_id
      or v_command.payload ->> 'source_command_id' is distinct from v_recovery.source_command_id::text
      or v_command.payload ->> 'source_review_id' is distinct from v_recovery.source_review_id::text
      or v_command.payload ->> 'recovery_root_command_id' is distinct from v_recovery.root_command_id::text
      or (v_command.payload ->> 'recovery_generation')::integer is distinct from v_recovery.recovery_generation then
      raise exception 'invalid_recovery_receipt' using errcode = 'P0001';
    end if;
    select * into v_source_review
    from public.video_studio_review_requests
    where id = v_recovery.source_review_id;
    select * into v_source_command
    from public.video_studio_commands
    where id = v_recovery.source_command_id;
    if not found
      or v_source_command.review_id is distinct from v_source_review.id
      or v_source_command.job_id is distinct from v_command.job_id
      or v_source_command.platform is distinct from v_command.platform
      or v_source_command.command_hash is distinct from (v_command.payload ->> 'source_command_hash')
      or v_source_command.expected_parent_revision_hash is distinct from v_command.expected_parent_revision_hash
      or v_source_command.expected_parent_artifact_hash is distinct from v_command.expected_parent_artifact_hash
      or (
        v_command.payload ->> 'source_terminal_reason' = 'runner_failed_receipt'
        and (
          v_source_command.status <> 'failed'
          or not exists (
            select 1
            from public.video_studio_command_receipts receipt
            where receipt.command_id = v_source_command.id
              and receipt.command_hash = v_source_command.command_hash
              and receipt.receipt_hash = v_source_command.result_receipt_hash
              and receipt.receipt_status = 'failed'
              and receipt.retryable = false
          )
        )
      )
      or (
        v_command.payload ->> 'source_terminal_reason' in ('attempts_exhausted', 'command_expired')
        and (
          v_source_command.status <> 'attention'
          or v_source_command.safe_code is distinct from (v_command.payload ->> 'source_terminal_reason')
        )
      )
      or p_receipt_status = 'requires_editorial_route'
      or (
        p_receipt_status = 'succeeded'
        and (
          p_result_revision_hash is distinct from v_command.expected_parent_revision_hash
          or p_result_artifact_hash is distinct from v_command.expected_parent_artifact_hash
          or p_result_refs is distinct from pg_catalog.jsonb_build_object('comparison_alignment', 'unavailable')
          or p_hard_gates is distinct from v_source_review.safe_payload -> 'blocking_gates'
        )
      ) then
      raise exception 'invalid_recovery_receipt' using errcode = 'P0001';
    end if;
  end if;

  if v_command.command_kind = 'review_decision_record'
    and p_receipt_status = 'succeeded' then
    if p_result_refs ->> 'semantic_target_map_hash' is null
      or p_result_refs ->> 'semantic_target_map_hash' !~ '^[a-f0-9]{64}$'
      or p_result_refs ->> 'semantic_target_map_hash' = v_state.semantic_target_map_hash
      or p_result_revision_hash is not distinct from v_command.expected_parent_revision_hash
      or p_result_artifact_hash is distinct from v_command.expected_parent_artifact_hash then
      raise exception 'invalid_lineage' using errcode = 'P0001';
    end if;
  end if;

  if v_command.command_kind = 'magic_edit_activate'
    and p_receipt_status = 'succeeded'
    and (
      p_result_revision_hash is not distinct from v_command.expected_parent_revision_hash
      or p_result_artifact_hash is distinct from (v_command.payload ->> 'prepared_treatment_artifact_hash')
    ) then
    raise exception 'invalid_lineage' using errcode = 'P0001';
  end if;

  if v_command.command_kind in ('magic_edit_activate', 'magic_edit_return_to_parent')
    and p_receipt_status = 'succeeded'
    and (
      p_result_refs ->> 'semantic_target_map_hash' is null
      or p_result_refs ->> 'semantic_target_map_hash' !~ '^[a-f0-9]{64}$'
      or p_result_refs ->> 'semantic_target_map_hash' = v_state.semantic_target_map_hash
    ) then
    raise exception 'invalid_lineage' using errcode = 'P0001';
  end if;

  if v_command.command_kind = 'magic_edit_return_to_parent'
    and p_receipt_status = 'succeeded'
    and (
      p_result_revision_hash is not distinct from v_command.expected_parent_revision_hash
      or p_result_artifact_hash is distinct from (v_command.payload ->> 'target_parent_artifact_hash')
    ) then
    raise exception 'invalid_lineage' using errcode = 'P0001';
  end if;

  if v_command.command_kind in ('magic_edit_activate', 'magic_edit_return_to_parent')
    and p_receipt_status = 'succeeded'
    and not v_all_gates_passed then
    v_effective_receipt_status := 'requires_editorial_route';
  end if;

  if v_effective_receipt_status = 'succeeded' then
    v_status := 'succeeded';
  elsif v_effective_receipt_status = 'requires_editorial_route' then
    v_status := 'attention';
    v_route_state := 'requires_editorial_route';
  else
    v_status := 'failed';
  end if;

  insert into public.video_studio_command_receipts (
    command_id, job_id, runner_id_hash, command_hash, receipt_hash, receipt_signature,
    receipt_status, result_revision_hash, result_artifact_hash, result_refs, hard_gates,
    retryable, safe_code, started_at, finished_at
  ) values (
    p_command_id, v_command.job_id, p_runner_id_hash, p_command_hash, p_receipt_hash,
    p_receipt_signature, v_effective_receipt_status, p_result_revision_hash,
    p_result_artifact_hash, p_result_refs, p_hard_gates, p_retryable,
    p_safe_code, p_started_at, p_finished_at
  );

  update public.video_studio_commands
  set status = v_status,
      result_revision_hash = p_result_revision_hash,
      result_artifact_hash = p_result_artifact_hash,
      result_receipt_hash = p_receipt_hash,
      safe_code = p_safe_code,
      completed_at = pg_catalog.now(),
      lease_owner_hash = null,
      lease_token_hash = null,
      lease_expires_at = null
  where id = p_command_id;

  if v_command.command_kind = 'magic_edit_prepare'
    and v_effective_receipt_status in ('succeeded', 'requires_editorial_route')
    and p_result_revision_hash is not null
    and p_result_artifact_hash is not null then
    insert into public.video_studio_review_requests (
      id, job_id, source_command_id, preview_source_command_id,
      platform, gate, status, route_state, safe_title, safe_summary,
      parent_revision_hash, parent_artifact_hash, revision_hash, artifact_hash,
      candidate_hash, semantic_target_map_hash, safe_payload, truth_gate, rights_gate,
      confidentiality_gate, transcript_fidelity_gate, naming_gate, queues_activation,
      before_preview_object_key, after_preview_object_key, preview_expires_at,
      comparison_alignment, comparison_start_ms, comparison_end_ms, expires_at
    ) values (
      (p_result_refs ->> 'review_id')::uuid,
      v_command.job_id, v_command.id,
      case when v_effective_receipt_status = 'succeeded' then v_command.id else null end,
      v_command.platform, 'treatment', 'pending', v_route_state,
      pg_catalog.left(pg_catalog.coalesce(p_result_refs ->> 'safe_title', 'Magic edit ready'), 200),
      pg_catalog.left(pg_catalog.coalesce(p_result_refs ->> 'safe_summary', 'Review the proposed editorial direction.'), 600),
      v_command.expected_parent_revision_hash, v_command.expected_parent_artifact_hash,
      p_result_revision_hash, p_result_artifact_hash,
      case when v_effective_receipt_status = 'succeeded' then p_result_refs ->> 'candidate_hash' else null end,
      v_command.semantic_target_map_hash,
      pg_catalog.jsonb_set(
        pg_catalog.coalesce(p_result_refs -> 'review_payload', '{}'::jsonb),
        '{blocking_gates}', p_hard_gates, true
      ),
      pg_catalog.coalesce(p_hard_gates -> 'truth' ->> 'status', 'pending'),
      pg_catalog.coalesce(p_hard_gates -> 'rights' ->> 'status', 'pending'),
      pg_catalog.coalesce(p_hard_gates -> 'confidentiality' ->> 'status', 'pending'),
      pg_catalog.coalesce(p_hard_gates -> 'transcript_fidelity' ->> 'status', 'pending'),
      pg_catalog.coalesce(p_hard_gates -> 'naming' ->> 'status', 'pending'),
      v_effective_receipt_status = 'succeeded',
      p_result_refs ->> 'before_preview_object_key',
      p_result_refs ->> 'after_preview_object_key',
      case when v_effective_receipt_status = 'succeeded' then pg_catalog.now() + interval '30 days' else null end,
      case when p_result_refs ->> 'comparison_alignment' = 'exact' then 'exact' else 'unavailable' end,
      (p_result_refs ->> 'comparison_start_ms')::integer,
      (p_result_refs ->> 'comparison_end_ms')::integer,
      pg_catalog.now() + interval '30 days'
    )
    on conflict (source_command_id) where source_command_id is not null do nothing
    returning id into v_review_id;

    if v_review_id is not null and v_command.review_id is not null then
      update public.video_studio_review_requests
      set status = 'superseded'
      where id = v_command.review_id
        and status = 'pending';
      if not found then
        raise exception 'source_review_conflict' using errcode = 'P0001';
      end if;
    end if;

    update public.video_studio_job_platform_states
    set runner_state = case when v_route_state = 'requires_editorial_route' then 'attention' else 'idle' end,
        editorial_state = 'needs_visual_review',
        route_state = v_route_state
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  elsif v_command.command_kind = 'review_recovery_record' then
    update public.video_studio_review_requests
    set binding_state = case
      when v_effective_receipt_status = 'succeeded' then 'ready'
      else 'failed'
    end
    where id = v_command.review_id
      and binding_state = 'queued';
    if not found then
      raise exception 'invalid_review_binding_transition' using errcode = 'P0001';
    end if;

    update public.video_studio_job_platform_states
    set runner_state = case
          when v_effective_receipt_status = 'succeeded' then 'idle'
          else 'attention'
        end,
        runner_last_seen_at = pg_catalog.now()
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  elsif v_command.command_kind in ('magic_edit_activate', 'magic_edit_return_to_parent')
    and v_effective_receipt_status = 'succeeded'
    and v_all_gates_passed
    and p_result_revision_hash is not null
    and p_result_artifact_hash is not null then
    update public.video_studio_job_platform_states
    set active_parent_revision_hash = case
          when v_command.command_kind = 'magic_edit_activate' then active_revision_hash
          else null
        end,
        active_parent_artifact_hash = case
          when v_command.command_kind = 'magic_edit_activate' then active_artifact_hash
          else null
        end,
        active_parent_candidate_hash = case
          when v_command.command_kind = 'magic_edit_activate' then active_candidate_hash
          else null
        end,
        active_revision_hash = p_result_revision_hash,
        active_artifact_hash = p_result_artifact_hash,
        active_candidate_hash = case
          when v_command.command_kind = 'magic_edit_activate' then v_command.candidate_hash
          else active_parent_candidate_hash
        end,
        semantic_target_map_hash = p_result_refs ->> 'semantic_target_map_hash',
        runner_state = 'idle',
        editorial_state = case
          when v_command.command_kind = 'magic_edit_activate' then 'needs_final_review'
          else 'approved'
        end,
        route_state = 'standard'
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  elsif v_command.command_kind = 'review_decision_record'
    and v_effective_receipt_status = 'succeeded' then
    update public.video_studio_job_platform_states
    set runner_state = 'idle',
        active_revision_hash = p_result_revision_hash,
        active_artifact_hash = p_result_artifact_hash,
        semantic_target_map_hash = p_result_refs ->> 'semantic_target_map_hash',
        editorial_state = case
          when v_command.payload ->> 'decision' = 'keep_current' then editorial_state
          when v_command.payload ->> 'gate' = 'story' then 'needs_visual_review'
          when v_command.payload ->> 'gate' = 'treatment' then 'needs_final_review'
          when v_command.payload ->> 'gate' in ('final', 'learning') then 'approved'
          else editorial_state
        end,
        route_state = case
          when v_command.payload ->> 'decision' = 'use_candidate' then 'standard'
          else route_state
        end,
        runner_last_seen_at = pg_catalog.now()
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  elsif v_command.command_kind = 'review_decision_record'
    and v_effective_receipt_status = 'requires_editorial_route' then
    update public.video_studio_job_platform_states
    set runner_state = 'attention', route_state = 'requires_editorial_route'
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  elsif v_effective_receipt_status = 'requires_editorial_route' then
    update public.video_studio_job_platform_states
    set runner_state = 'attention', route_state = 'requires_editorial_route', editorial_state = 'blocked'
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  else
    update public.video_studio_job_platform_states
    set runner_state = 'attention'
    where video_studio_job_platform_states.job_id = v_command.job_id
      and video_studio_job_platform_states.platform = v_command.platform;
  end if;

  return query select v_status, false, pg_catalog.coalesce(v_review_id, v_command.review_id), v_all_gates_passed;
end;
$$;

alter table public.video_studio_jobs enable row level security;
alter table public.video_studio_job_platform_states enable row level security;
alter table public.video_studio_review_requests enable row level security;
alter table public.video_studio_commands enable row level security;
alter table public.video_studio_review_events enable row level security;
alter table public.video_studio_command_receipts enable row level security;
alter table public.video_studio_preview_upload_slots enable row level security;
alter table public.video_studio_runner_heartbeats enable row level security;
alter table public.video_studio_rate_limits enable row level security;
alter table public.video_studio_projection_events enable row level security;
alter table public.video_studio_preview_retention_events enable row level security;
alter table public.video_studio_command_recoveries enable row level security;

revoke all on public.video_studio_jobs from public, anon, authenticated;
revoke all on public.video_studio_job_platform_states from public, anon, authenticated;
revoke all on public.video_studio_review_requests from public, anon, authenticated;
revoke all on public.video_studio_commands from public, anon, authenticated;
revoke all on public.video_studio_review_events from public, anon, authenticated;
revoke all on public.video_studio_command_receipts from public, anon, authenticated;
revoke all on public.video_studio_preview_upload_slots from public, anon, authenticated;
revoke all on public.video_studio_runner_heartbeats from public, anon, authenticated;
revoke all on public.video_studio_rate_limits from public, anon, authenticated;
revoke all on public.video_studio_projection_events from public, anon, authenticated;
revoke all on public.video_studio_preview_retention_events from public, anon, authenticated;
revoke all on public.video_studio_command_recoveries from public, anon, authenticated;

grant select, insert, update on public.video_studio_jobs to service_role;
grant select, insert, update on public.video_studio_job_platform_states to service_role;
grant select, insert, update on public.video_studio_review_requests to service_role;
grant select, insert, update on public.video_studio_commands to service_role;
grant select, insert on public.video_studio_review_events to service_role;
grant select, insert on public.video_studio_command_receipts to service_role;
grant select, insert on public.video_studio_preview_upload_slots to service_role;
grant select, insert, update on public.video_studio_runner_heartbeats to service_role;
grant select, insert, update on public.video_studio_rate_limits to service_role;
grant select, insert on public.video_studio_projection_events to service_role;
grant select, insert on public.video_studio_preview_retention_events to service_role;
grant select, insert on public.video_studio_command_recoveries to service_role;

create policy video_studio_jobs_service_all on public.video_studio_jobs
  for all to service_role using (true) with check (true);
create policy video_studio_platform_states_service_all on public.video_studio_job_platform_states
  for all to service_role using (true) with check (true);
create policy video_studio_reviews_service_all on public.video_studio_review_requests
  for all to service_role using (true) with check (true);
create policy video_studio_commands_service_all on public.video_studio_commands
  for all to service_role using (true) with check (true);
create policy video_studio_review_events_service_all on public.video_studio_review_events
  for all to service_role using (true) with check (true);
create policy video_studio_receipts_service_all on public.video_studio_command_receipts
  for all to service_role using (true) with check (true);
create policy video_studio_preview_slots_service_all on public.video_studio_preview_upload_slots
  for all to service_role using (true) with check (true);
create policy video_studio_heartbeats_service_all on public.video_studio_runner_heartbeats
  for all to service_role using (true) with check (true);
create policy video_studio_rate_limits_service_all on public.video_studio_rate_limits
  for all to service_role using (true) with check (true);
create policy video_studio_projection_events_service_all on public.video_studio_projection_events
  for all to service_role using (true) with check (true);
create policy video_studio_preview_retention_service_all on public.video_studio_preview_retention_events
  for all to service_role using (true) with check (true);
create policy video_studio_recoveries_service_all on public.video_studio_command_recoveries
  for all to service_role using (true) with check (true);

revoke execute on function public.video_studio_valid_platforms(text[]) from public, anon, authenticated;
revoke execute on function public.video_studio_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.video_studio_reject_append_only_mutation() from public, anon, authenticated;
revoke execute on function public.video_studio_protect_command_core() from public, anon, authenticated;
revoke execute on function public.video_studio_protect_review_core() from public, anon, authenticated;
revoke execute on function public.video_studio_take_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.video_studio_preview_retention_candidates(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.video_studio_record_preview_retention(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.video_studio_project_review(text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.video_studio_enqueue_command(text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.video_studio_record_decision(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.video_studio_recover_failed_review(uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.video_studio_claim_command(text, text, integer) from public, anon, authenticated;
revoke execute on function public.video_studio_record_heartbeat(text, text, text, integer[], text, uuid, integer, timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.video_studio_reserve_preview_upload(uuid, text, text, text, text, text, text, integer, text) from public, anon, authenticated;
revoke execute on function public.video_studio_complete_command(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.video_studio_valid_platforms(text[]) to service_role;
grant execute on function public.video_studio_take_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.video_studio_preview_retention_candidates(timestamptz, integer) to service_role;
grant execute on function public.video_studio_record_preview_retention(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.video_studio_project_review(text, text, uuid, text, jsonb) to service_role;
grant execute on function public.video_studio_enqueue_command(text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text) to service_role;
grant execute on function public.video_studio_record_decision(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text) to service_role;
grant execute on function public.video_studio_recover_failed_review(uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text) to service_role;
grant execute on function public.video_studio_claim_command(text, text, integer) to service_role;
grant execute on function public.video_studio_record_heartbeat(text, text, text, integer[], text, uuid, integer, timestamptz, text, integer) to service_role;
grant execute on function public.video_studio_reserve_preview_upload(uuid, text, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.video_studio_complete_command(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, timestamptz, timestamptz) to service_role;

comment on table public.video_studio_jobs is
  'Safe cloud projection only. Local signed events and media remain authoritative on the runner.';
comment on table public.video_studio_commands is
  'Exact-parent idempotent intents. Payload is bounded editorial direction only, never media, transcript, path, secret, or raw log data.';
comment on table public.video_studio_command_receipts is
  'Append-only safe runner receipts. Local signed event history remains authoritative.';
comment on table public.video_studio_preview_upload_slots is
  'Metadata only. Before release, create the configured private Storage bucket through the Storage API or dashboard with video/mp4 as its sole MIME type, an exact 26214400-byte file limit, and verified MD5 ETags for single-request uploads. Review redirects expire after 30 days; schedule the runner-authenticated preview-retention route daily to delete review-bound and abandoned-slot objects through the Storage API after a seven-day recovery grace. This migration deliberately never mutates the storage schema.';

commit;
