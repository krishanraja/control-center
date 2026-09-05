begin;

alter table public.video_studio_jobs
  add column source_revision_hash text
    check (source_revision_hash is null or source_revision_hash ~ '^[a-f0-9]{64}$'),
  add column source_event_count bigint
    check (source_event_count is null or source_event_count >= 1),
  add column source_event_chain_hash text
    check (source_event_chain_hash is null or source_event_chain_hash ~ '^[a-f0-9]{64}$');

alter table public.video_studio_jobs
  add constraint video_studio_job_source_cursor_shape check (
    (
      source_event_count is null
      and source_event_chain_hash is null
    )
    or (
      source_event_count is not null
      and source_event_chain_hash is not null
      and source_revision_hash is not null
    )
  ) not valid;

alter table public.video_studio_jobs
  validate constraint video_studio_job_source_cursor_shape;

alter table public.video_studio_commands
  add column last_lease_owner_hash text
    check (last_lease_owner_hash is null or last_lease_owner_hash ~ '^[a-f0-9]{64}$'),
  add column last_lease_token_hash text
    check (last_lease_token_hash is null or last_lease_token_hash ~ '^[a-f0-9]{64}$');

update public.video_studio_commands
set last_lease_owner_hash = lease_owner_hash,
    last_lease_token_hash = lease_token_hash
where lease_owner_hash is not null and lease_token_hash is not null;

alter table public.video_studio_commands
  add constraint video_studio_command_last_lease_shape check (
    (last_lease_owner_hash is null) = (last_lease_token_hash is null)
  ) not valid;

alter table public.video_studio_commands
  validate constraint video_studio_command_last_lease_shape;

create or replace function public.video_studio_retain_last_command_lease()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_catalog.current_setting('video_studio.late_completion_lease', true) = 'on' then
    new.last_lease_owner_hash := old.last_lease_owner_hash;
    new.last_lease_token_hash := old.last_lease_token_hash;
  elsif new.status = 'leased'
    and new.lease_owner_hash is not null
    and new.lease_token_hash is not null then
    if tg_op = 'UPDATE'
      and old.last_lease_owner_hash is not null
      and new.lease_owner_hash is distinct from old.last_lease_owner_hash then
      raise exception 'lease_conflict' using errcode = 'P0001';
    end if;
    new.last_lease_owner_hash := case
      when tg_op = 'UPDATE' then coalesce(old.last_lease_owner_hash, new.lease_owner_hash)
      else new.lease_owner_hash
    end;
    new.last_lease_token_hash := new.lease_token_hash;
  elsif tg_op = 'UPDATE' then
    new.last_lease_owner_hash := old.last_lease_owner_hash;
    new.last_lease_token_hash := old.last_lease_token_hash;
  end if;
  return new;
end;
$$;

create trigger video_studio_commands_retain_last_lease
before insert or update on public.video_studio_commands
for each row execute function public.video_studio_retain_last_command_lease();

revoke execute on function public.video_studio_retain_last_command_lease()
  from public, anon, authenticated, service_role;

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
    and (
      c.last_lease_owner_hash is null
      or c.last_lease_owner_hash = p_runner_id_hash
    )
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

alter table public.video_studio_job_platform_states
  add column source_cursor_adopted_at timestamptz;

alter table public.video_studio_job_platform_states
  add constraint video_studio_platform_candidate_parent_shape check (
    (
      active_candidate_hash is null
      and active_parent_revision_hash is null
      and active_parent_artifact_hash is null
      and active_parent_candidate_hash is null
    )
    or (
      active_candidate_hash is not null
      and active_parent_revision_hash is not null
      and active_parent_artifact_hash is not null
    )
  ) not valid;

alter table public.video_studio_job_platform_states
  validate constraint video_studio_platform_candidate_parent_shape;

create unique index video_studio_one_active_magic_lineage_per_job_idx
  on public.video_studio_job_platform_states (job_id)
  where active_candidate_hash is not null;

create unique index video_studio_one_inflight_runner_command_per_job_idx
  on public.video_studio_commands (job_id)
  where status in ('queued', 'leased');

-- A global job projection can be versioned only when every existing platform
-- agrees on the active revision. Ambiguous upgraded jobs remain fail-closed.
with unambiguous_job_revisions as (
  select
    job_id,
    pg_catalog.min(active_revision_hash) as source_revision_hash
  from public.video_studio_job_platform_states
  group by job_id
  having pg_catalog.count(*) = pg_catalog.count(active_revision_hash)
    and pg_catalog.count(distinct active_revision_hash) = 1
)
update public.video_studio_jobs as job
set source_revision_hash = revision.source_revision_hash
from unambiguous_job_revisions as revision
where revision.job_id = job.job_id;

create table public.video_studio_magic_candidate_lineage (
  job_id                  text not null,
  platform                text not null,
  candidate_hash          text not null check (candidate_hash ~ '^[a-f0-9]{64}$'),
  parent_revision_hash    text not null check (parent_revision_hash ~ '^[a-f0-9]{64}$'),
  parent_artifact_hash    text not null check (parent_artifact_hash ~ '^[a-f0-9]{64}$'),
  parent_candidate_hash   text check (parent_candidate_hash is null or parent_candidate_hash ~ '^[a-f0-9]{64}$'),
  created_at              timestamptz not null default pg_catalog.now(),
  primary key (job_id, platform, candidate_hash),
  constraint video_studio_magic_candidate_lineage_state_fk
    foreign key (job_id, platform) references public.video_studio_job_platform_states(job_id, platform)
);

alter table public.video_studio_magic_candidate_lineage enable row level security;
revoke all on public.video_studio_magic_candidate_lineage from public, anon, authenticated, service_role;
create policy video_studio_magic_candidate_lineage_service_all
  on public.video_studio_magic_candidate_lineage
  for all to service_role using (true) with check (true);

create trigger video_studio_magic_candidate_lineage_append_only
before update or delete on public.video_studio_magic_candidate_lineage
for each row execute function public.video_studio_reject_append_only_mutation();

-- Preserve the current edge for states that predate this migration. Earlier
-- ancestry cannot be reconstructed safely from the cloud projection alone.
insert into public.video_studio_magic_candidate_lineage (
  job_id, platform, candidate_hash,
  parent_revision_hash, parent_artifact_hash, parent_candidate_hash
)
select
  job_id, platform, active_candidate_hash,
  active_parent_revision_hash, active_parent_artifact_hash, active_parent_candidate_hash
from public.video_studio_job_platform_states
where active_candidate_hash is not null
  and active_parent_revision_hash is not null
  and active_parent_artifact_hash is not null
on conflict (job_id, platform, candidate_hash) do nothing;

create or replace function public.video_studio_preserve_magic_candidate_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lineage public.video_studio_magic_candidate_lineage%rowtype;
begin
  if new.active_candidate_hash is distinct from old.active_candidate_hash
    or new.active_parent_revision_hash is distinct from old.active_parent_revision_hash
    or new.active_parent_artifact_hash is distinct from old.active_parent_artifact_hash
    or new.active_parent_candidate_hash is distinct from old.active_parent_candidate_hash then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('video-studio-magic-lineage:' || new.job_id, 0)
    );
    if new.active_candidate_hash is not null and exists (
      select 1
      from public.video_studio_job_platform_states as other_state
      where other_state.job_id = new.job_id
        and other_state.platform <> new.platform
        and (
          other_state.active_candidate_hash is not null
          or other_state.active_parent_revision_hash is not null
          or other_state.active_parent_artifact_hash is not null
          or other_state.active_parent_candidate_hash is not null
        )
    ) then
      raise exception 'cross_platform_magic_lineage' using errcode = 'P0001';
    end if;
  end if;

  if new.active_revision_hash is distinct from old.active_revision_hash
    and new.active_candidate_hash is not null
    and new.active_candidate_hash is distinct from old.active_candidate_hash
    and new.active_parent_revision_hash is not distinct from old.active_revision_hash
    and new.active_parent_artifact_hash is not distinct from old.active_artifact_hash
    and new.active_parent_candidate_hash is not distinct from old.active_candidate_hash then
    insert into public.video_studio_magic_candidate_lineage (
      job_id, platform, candidate_hash,
      parent_revision_hash, parent_artifact_hash, parent_candidate_hash
    ) values (
      new.job_id, new.platform, new.active_candidate_hash,
      old.active_revision_hash, old.active_artifact_hash, old.active_candidate_hash
    )
    on conflict (job_id, platform, candidate_hash) do nothing;

    select * into v_lineage
    from public.video_studio_magic_candidate_lineage
    where video_studio_magic_candidate_lineage.job_id = new.job_id
      and video_studio_magic_candidate_lineage.platform = new.platform
      and video_studio_magic_candidate_lineage.candidate_hash = new.active_candidate_hash;
    if not found
      or v_lineage.parent_revision_hash is distinct from old.active_revision_hash
      or v_lineage.parent_artifact_hash is distinct from old.active_artifact_hash
      or v_lineage.parent_candidate_hash is distinct from old.active_candidate_hash then
      raise exception 'invalid_lineage' using errcode = 'P0001';
    end if;
  elsif new.active_revision_hash is distinct from old.active_revision_hash
    and new.active_candidate_hash is not distinct from old.active_parent_candidate_hash
    and new.active_artifact_hash is not distinct from old.active_parent_artifact_hash
    and new.active_parent_revision_hash is null
    and new.active_parent_artifact_hash is null
    and new.active_parent_candidate_hash is null
    and new.active_candidate_hash is not null then
    select * into v_lineage
    from public.video_studio_magic_candidate_lineage
    where video_studio_magic_candidate_lineage.job_id = new.job_id
      and video_studio_magic_candidate_lineage.platform = new.platform
      and video_studio_magic_candidate_lineage.candidate_hash = new.active_candidate_hash;
    if not found then
      raise exception 'invalid_lineage' using errcode = 'P0001';
    end if;
    new.active_parent_revision_hash := v_lineage.parent_revision_hash;
    new.active_parent_artifact_hash := v_lineage.parent_artifact_hash;
    new.active_parent_candidate_hash := v_lineage.parent_candidate_hash;
  elsif new.active_revision_hash is distinct from old.active_revision_hash
    and new.active_candidate_hash is null
    and new.active_candidate_hash is not distinct from old.active_parent_candidate_hash
    and new.active_artifact_hash is not distinct from old.active_parent_artifact_hash
    and new.active_parent_revision_hash is null
    and new.active_parent_artifact_hash is null
    and new.active_parent_candidate_hash is null then
    null;
  elsif new.active_candidate_hash is distinct from old.active_candidate_hash
    or new.active_parent_revision_hash is distinct from old.active_parent_revision_hash
    or new.active_parent_artifact_hash is distinct from old.active_parent_artifact_hash
    or new.active_parent_candidate_hash is distinct from old.active_parent_candidate_hash
    or (
      old.active_candidate_hash is not null
      and new.active_candidate_hash is not null
      and new.active_artifact_hash is distinct from old.active_artifact_hash
    ) then
    raise exception 'invalid_lineage' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger video_studio_platform_states_preserve_magic_lineage
before update on public.video_studio_job_platform_states
for each row execute function public.video_studio_preserve_magic_candidate_lineage();

revoke execute on function public.video_studio_preserve_magic_candidate_lineage() from public, anon, authenticated, service_role;

create or replace function public.video_studio_fence_magic_command_platform()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-magic-lineage:' || new.job_id, 0)
  );

  if exists (
    select 1
    from public.video_studio_job_platform_states as other_state
    where other_state.job_id = new.job_id
      and other_state.platform <> new.platform
      and (
        other_state.active_candidate_hash is not null
        or other_state.active_parent_revision_hash is not null
        or other_state.active_parent_artifact_hash is not null
        or other_state.active_parent_candidate_hash is not null
      )
  ) then
    raise exception 'cross_platform_magic_lineage' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.video_studio_jobs as job
    join public.video_studio_job_platform_states as state
      on state.job_id = job.job_id
     and state.platform = new.platform
    where job.job_id = new.job_id
      and job.source_event_count is not null
      and job.source_event_chain_hash is not null
      and job.source_revision_hash is not null
      and state.active_revision_hash is not distinct from job.source_revision_hash
  ) then
    raise exception 'stale_parent' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.video_studio_commands as active_command
    where active_command.job_id = new.job_id
      and active_command.status in ('queued', 'leased')
  ) then
    raise exception 'command_in_flight' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger video_studio_commands_fence_magic_platform
before insert on public.video_studio_commands
for each row execute function public.video_studio_fence_magic_command_platform();

revoke execute on function public.video_studio_fence_magic_command_platform() from public, anon, authenticated, service_role;

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
  v_expected_state_payload jsonb := p_projection -> 'expected_platform_state';
  v_state_payload jsonb := p_projection -> 'platform_state';
  v_review_payload jsonb := p_projection -> 'review';
  v_job_id text := v_job_payload ->> 'job_id';
  v_platform text := v_state_payload ->> 'platform';
  v_review_id uuid := (v_review_payload ->> 'id')::uuid;
  v_target_platforms text[] := array(
    select value from pg_catalog.jsonb_array_elements_text(v_job_payload -> 'target_platforms')
  );
  v_has_expected_state boolean := p_projection ? 'expected_platform_state';
  v_has_source_event_count boolean := v_job_payload ? 'source_event_count';
  v_has_source_event_chain_hash boolean := v_job_payload ? 'source_event_chain_hash';
  v_has_source_revision_hash boolean := v_job_payload ? 'source_revision_hash';
  v_source_event_count bigint;
  v_job_found boolean;
  v_state_found boolean;
  v_is_source_adoption boolean := false;
  v_job public.video_studio_jobs%rowtype;
  v_state public.video_studio_job_platform_states%rowtype;
  v_review public.video_studio_review_requests%rowtype;
  v_event public.video_studio_projection_events%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-projection:' || p_idempotency_key::text, 0)
  );

  if v_has_source_event_count is distinct from v_has_source_event_chain_hash
    or v_has_source_event_count is distinct from v_has_source_revision_hash
    or (v_has_expected_state and not v_has_source_event_count)
    or (v_platform = any(v_target_platforms)) is not true then
    raise exception 'projection_conflict' using errcode = 'P0001';
  end if;
  if v_has_source_event_count then
    if pg_catalog.jsonb_typeof(v_job_payload -> 'source_event_count') <> 'number'
      or v_job_payload ->> 'source_event_count' !~ '^[1-9][0-9]{0,17}$'
      or v_job_payload ->> 'source_event_chain_hash' !~ '^[a-f0-9]{64}$'
      or v_job_payload ->> 'source_revision_hash' !~ '^[a-f0-9]{64}$'
      or v_job_payload ->> 'source_revision_hash'
        is distinct from (v_state_payload ->> 'active_revision_hash') then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    v_source_event_count := (v_job_payload ->> 'source_event_count')::bigint;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-job:' || v_job_id, 0)
  );

  -- Recheck after both transaction locks. This makes an exact concurrent retry
  -- return the first event before any command or state fence is evaluated.
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

  select * into v_job
  from public.video_studio_jobs
  where video_studio_jobs.job_id = v_job_id
  for update;
  v_job_found := found;

  select * into v_state
  from public.video_studio_job_platform_states
  where video_studio_job_platform_states.job_id = v_job_id
    and video_studio_job_platform_states.platform = v_platform
  for update;
  v_state_found := found;

  if exists (
    select 1 from public.video_studio_commands c
    where c.job_id = v_job_id and c.status in ('queued', 'leased')
  ) then
    raise exception 'command_in_flight' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.video_studio_job_platform_states as other_state
    where other_state.job_id = v_job_id
      and other_state.platform <> v_platform
      and (
        other_state.active_candidate_hash is not null
        or other_state.active_parent_revision_hash is not null
        or other_state.active_parent_artifact_hash is not null
        or other_state.active_parent_candidate_hash is not null
      )
  ) then
    raise exception 'cross_platform_magic_lineage' using errcode = 'P0001';
  end if;

  if v_job_found then
    if v_job.series <> v_job_payload ->> 'series'
      or v_job.mode <> v_job_payload ->> 'mode'
      or v_job.target_platforms is distinct from v_target_platforms then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    if v_has_source_event_count and not v_has_expected_state then
      if v_job.stage is distinct from (v_job_payload ->> 'stage')
        or v_job.status is distinct from (v_job_payload ->> 'status')
        or v_state_payload ->> 'active_candidate_hash' is not null
        or v_state_payload ->> 'parent_revision_hash' is not null
        or v_state_payload ->> 'parent_artifact_hash' is not null
        or v_state_payload ->> 'parent_candidate_hash' is not null
        or exists (
          select 1
          from public.video_studio_job_platform_states as active_state
          where active_state.job_id = v_job_id
            and (
              active_state.active_candidate_hash is not null
              or active_state.active_parent_revision_hash is not null
              or active_state.active_parent_artifact_hash is not null
              or active_state.active_parent_candidate_hash is not null
            )
        ) then
        raise exception 'projection_conflict' using errcode = 'P0001';
      end if;
      if v_state_found and (
        v_state.source_cursor_adopted_at is not null
        or v_state.platform is distinct from (v_state_payload ->> 'platform')
        or v_state.active_revision_hash is distinct from (v_state_payload ->> 'active_revision_hash')
        or v_state.active_artifact_hash is distinct from (v_state_payload ->> 'active_artifact_hash')
        or v_state.active_candidate_hash is distinct from (v_state_payload ->> 'active_candidate_hash')
        or v_state.active_parent_revision_hash is distinct from (v_state_payload ->> 'parent_revision_hash')
        or v_state.active_parent_artifact_hash is distinct from (v_state_payload ->> 'parent_artifact_hash')
        or v_state.active_parent_candidate_hash is distinct from (v_state_payload ->> 'parent_candidate_hash')
        or v_state.semantic_target_map_hash is distinct from (v_state_payload ->> 'semantic_target_map_hash')
        or v_state.editorial_state is distinct from (v_state_payload ->> 'editorial_state')
        or v_state.route_state is distinct from (v_state_payload ->> 'route_state')
      ) then
        raise exception 'projection_conflict' using errcode = 'P0001';
      end if;
      if v_job.source_event_count is null then
        if v_job.source_event_chain_hash is not null
          or v_job.source_revision_hash is distinct from (v_job_payload ->> 'source_revision_hash') then
          raise exception 'projection_conflict' using errcode = 'P0001';
        end if;
        update public.video_studio_jobs
        set source_revision_hash = v_job_payload ->> 'source_revision_hash',
            source_event_count = v_source_event_count,
            source_event_chain_hash = v_job_payload ->> 'source_event_chain_hash'
        where video_studio_jobs.job_id = v_job_id;
      elsif v_job.source_event_count is distinct from v_source_event_count
        or v_job.source_event_chain_hash is distinct from (v_job_payload ->> 'source_event_chain_hash')
        or v_job.source_revision_hash is distinct from (v_job_payload ->> 'source_revision_hash') then
        raise exception 'projection_conflict' using errcode = 'P0001';
      end if;
      v_is_source_adoption := true;
    elsif v_has_source_event_count then
      if v_job.source_event_count is null or (
        v_source_event_count < v_job.source_event_count
        or (
          v_source_event_count > v_job.source_event_count
          and v_job.source_event_chain_hash is not distinct from (v_job_payload ->> 'source_event_chain_hash')
        )
        or (
          v_source_event_count = v_job.source_event_count
          and (
            v_job.source_revision_hash is distinct from (v_job_payload ->> 'source_revision_hash')
            or v_job.source_event_chain_hash is distinct from (v_job_payload ->> 'source_event_chain_hash')
            or v_job.stage is distinct from (v_job_payload ->> 'stage')
            or v_job.status is distinct from (v_job_payload ->> 'status')
          )
        )
      ) then
        raise exception 'projection_conflict' using errcode = 'P0001';
      elsif v_source_event_count > v_job.source_event_count then
        update public.video_studio_jobs
        set stage = v_job_payload ->> 'stage',
            status = v_job_payload ->> 'status',
            safe_title = v_job_payload ->> 'safe_title',
            safe_summary = v_job_payload ->> 'safe_summary',
            source_revision_hash = v_job_payload ->> 'source_revision_hash',
            source_event_count = v_source_event_count,
            source_event_chain_hash = v_job_payload ->> 'source_event_chain_hash'
        where video_studio_jobs.job_id = v_job_id;
      end if;
    elsif v_job.source_event_count is not null
      or v_job.stage is distinct from (v_job_payload ->> 'stage')
      or v_job.status is distinct from (v_job_payload ->> 'status') then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
  else
    if (v_has_expected_state and pg_catalog.jsonb_typeof(v_expected_state_payload) <> 'null')
      or (v_has_source_event_count and not v_has_expected_state)
      or v_state_payload ->> 'active_candidate_hash' is not null
      or v_state_payload ->> 'parent_revision_hash' is not null
      or v_state_payload ->> 'parent_artifact_hash' is not null
      or v_state_payload ->> 'parent_candidate_hash' is not null then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    insert into public.video_studio_jobs (
      job_id, target_platforms, series, mode, stage, status, safe_title, safe_summary,
      source_revision_hash, source_event_count, source_event_chain_hash
    ) values (
      v_job_id, v_target_platforms, v_job_payload ->> 'series', v_job_payload ->> 'mode',
      v_job_payload ->> 'stage', v_job_payload ->> 'status',
      v_job_payload ->> 'safe_title', v_job_payload ->> 'safe_summary',
      coalesce(v_job_payload ->> 'source_revision_hash', v_state_payload ->> 'active_revision_hash'),
      v_source_event_count,
      v_job_payload ->> 'source_event_chain_hash'
    );
  end if;

  if v_state_found then
    if v_has_expected_state then
      if pg_catalog.jsonb_typeof(v_expected_state_payload) <> 'object'
        or v_expected_state_payload ->> 'platform' is distinct from v_platform
        or v_state.active_revision_hash is distinct from (v_expected_state_payload ->> 'active_revision_hash')
        or v_state.active_artifact_hash is distinct from (v_expected_state_payload ->> 'active_artifact_hash')
        or v_state.active_candidate_hash is distinct from (v_expected_state_payload ->> 'active_candidate_hash')
        or v_state.active_parent_revision_hash is distinct from (v_expected_state_payload ->> 'parent_revision_hash')
        or v_state.active_parent_artifact_hash is distinct from (v_expected_state_payload ->> 'parent_artifact_hash')
        or v_state.active_parent_candidate_hash is distinct from (v_expected_state_payload ->> 'parent_candidate_hash')
        or v_state.semantic_target_map_hash is distinct from (v_expected_state_payload ->> 'semantic_target_map_hash')
        or v_state.editorial_state is distinct from (v_expected_state_payload ->> 'editorial_state')
        or v_state.route_state is distinct from (v_expected_state_payload ->> 'route_state') then
        raise exception 'projection_conflict' using errcode = 'P0001';
      end if;
    elsif v_is_source_adoption then
      null;
    elsif v_state.active_revision_hash is distinct from (v_state_payload ->> 'active_revision_hash')
      or v_state.active_artifact_hash is distinct from (v_state_payload ->> 'active_artifact_hash')
      or v_state.active_parent_revision_hash is distinct from (v_state_payload ->> 'parent_revision_hash')
      or v_state.active_parent_artifact_hash is distinct from (v_state_payload ->> 'parent_artifact_hash')
      or v_state.active_parent_candidate_hash is distinct from (v_state_payload ->> 'parent_candidate_hash')
      or v_state.active_candidate_hash is distinct from (v_state_payload ->> 'active_candidate_hash')
      or v_state.semantic_target_map_hash is distinct from (v_state_payload ->> 'semantic_target_map_hash') then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    if v_state.active_candidate_hash is distinct from (v_state_payload ->> 'active_candidate_hash')
      or v_state.active_parent_revision_hash is distinct from (v_state_payload ->> 'parent_revision_hash')
      or v_state.active_parent_artifact_hash is distinct from (v_state_payload ->> 'parent_artifact_hash')
      or v_state.active_parent_candidate_hash is distinct from (v_state_payload ->> 'parent_candidate_hash')
      or (
        v_state.active_candidate_hash is not null
        and v_state.active_artifact_hash is distinct from (v_state_payload ->> 'active_artifact_hash')
      ) then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    update public.video_studio_job_platform_states
    set editorial_state = v_state_payload ->> 'editorial_state',
        runner_state = 'idle',
        route_state = v_state_payload ->> 'route_state',
        active_revision_hash = v_state_payload ->> 'active_revision_hash',
        active_artifact_hash = v_state_payload ->> 'active_artifact_hash',
        semantic_target_map_hash = v_state_payload ->> 'semantic_target_map_hash',
        source_cursor_adopted_at = case
          when v_has_source_event_count then coalesce(source_cursor_adopted_at, pg_catalog.now())
          else source_cursor_adopted_at
        end,
        runner_last_seen_at = pg_catalog.now()
    where video_studio_job_platform_states.job_id = v_job_id
      and video_studio_job_platform_states.platform = v_platform;
  else
    if (v_has_expected_state and pg_catalog.jsonb_typeof(v_expected_state_payload) <> 'null')
      or v_state_payload ->> 'active_candidate_hash' is not null
      or v_state_payload ->> 'parent_revision_hash' is not null
      or v_state_payload ->> 'parent_artifact_hash' is not null
      or v_state_payload ->> 'parent_candidate_hash' is not null then
      raise exception 'projection_conflict' using errcode = 'P0001';
    end if;
    insert into public.video_studio_job_platform_states (
      job_id, platform, editorial_state, runner_state, route_state,
      active_revision_hash, active_artifact_hash, active_candidate_hash,
      active_parent_revision_hash, active_parent_artifact_hash,
      active_parent_candidate_hash, semantic_target_map_hash, source_cursor_adopted_at,
      runner_last_seen_at
    ) values (
      v_job_id, v_platform, v_state_payload ->> 'editorial_state', 'idle',
      v_state_payload ->> 'route_state', v_state_payload ->> 'active_revision_hash',
      v_state_payload ->> 'active_artifact_hash', v_state_payload ->> 'active_candidate_hash',
      v_state_payload ->> 'parent_revision_hash', v_state_payload ->> 'parent_artifact_hash',
      v_state_payload ->> 'parent_candidate_hash', v_state_payload ->> 'semantic_target_map_hash',
      case when v_has_source_event_count then pg_catalog.now() else null end,
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

  update public.video_studio_review_requests as older_review
  set status = 'superseded'
  where older_review.job_id = v_job_id
    and older_review.platform = v_platform
    and older_review.gate = v_review_payload ->> 'gate'
    and older_review.id <> v_review_id
    and older_review.status = 'pending'
    and older_review.source_command_id is null
    and older_review.preview_source_command_id is null
    and older_review.recovery_of_command_id is null
    and older_review.recovery_root_command_id is null
    and not exists (
      select 1
      from public.video_studio_commands as review_command
      where review_command.review_id = older_review.id
    );

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

create or replace function public.video_studio_restore_recovery_event_cursor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_count text := nullif(pg_catalog.current_setting(
    'video_studio.recovery_result_source_event_count', true
  ), '');
  v_event_chain_hash text := nullif(pg_catalog.current_setting(
    'video_studio.recovery_result_source_event_chain_hash', true
  ), '');
  v_source_revision_hash text := nullif(pg_catalog.current_setting(
    'video_studio.recovery_result_source_revision_hash', true
  ), '');
begin
  if v_event_count is null and v_event_chain_hash is null and v_source_revision_hash is null then
    return new;
  end if;
  if v_event_count is null
    or v_event_count !~ '^[1-9][0-9]*$'
    or v_event_chain_hash is null
    or v_event_chain_hash !~ '^[a-f0-9]{64}$'
    or v_source_revision_hash is null
    or v_source_revision_hash !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1
      from public.video_studio_commands
      where id = new.command_id
        and command_kind = 'review_recovery_record'
    ) then
    raise exception 'invalid_receipt' using errcode = 'P0001';
  end if;
  new.result_refs := new.result_refs || pg_catalog.jsonb_build_object(
    'result_source_event_count', v_event_count::bigint,
    'result_source_event_chain_hash', v_event_chain_hash,
    'result_source_revision_hash', v_source_revision_hash
  );
  perform pg_catalog.set_config('video_studio.recovery_result_source_event_count', '', true);
  perform pg_catalog.set_config('video_studio.recovery_result_source_event_chain_hash', '', true);
  perform pg_catalog.set_config('video_studio.recovery_result_source_revision_hash', '', true);
  return new;
end;
$$;

create trigger video_studio_receipts_restore_recovery_event_cursor
before insert on public.video_studio_command_receipts
for each row execute function public.video_studio_restore_recovery_event_cursor();

revoke execute on function public.video_studio_restore_recovery_event_cursor()
  from public, anon, authenticated, service_role;

create or replace function public.video_studio_protect_review_core()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_late_binding_review_id text := nullif(pg_catalog.current_setting(
    'video_studio.late_binding_review_id', true
  ), '');
begin
  if new.binding_state is distinct from old.binding_state
    and not coalesce((
      old.binding_state = 'failed'
      and new.binding_state = 'queued'
      and old.recovery_of_command_id is not null
      and old.id::text = v_late_binding_review_id
    ), false)
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

create or replace function public.video_studio_reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_refresh_command_id text := nullif(pg_catalog.current_setting(
    'video_studio.preview_slot_refresh_command_id', true
  ), '');
begin
  if tg_table_name = 'video_studio_preview_upload_slots'
    and tg_op = 'UPDATE'
    and old.command_id::text = v_refresh_command_id
    and new.id is not distinct from old.id
    and new.command_id is not distinct from old.command_id
    and new.job_id is not distinct from old.job_id
    and new.runner_id_hash is not distinct from old.runner_id_hash
    and new.side is not distinct from old.side
    and new.content_sha256 is not distinct from old.content_sha256
    and new.content_md5 is not distinct from old.content_md5
    and new.object_key is not distinct from old.object_key
    and new.byte_size is not distinct from old.byte_size
    and new.content_type is not distinct from old.content_type
    and new.created_at is not distinct from old.created_at
    and new.slot_expires_at >= old.slot_expires_at
    and new.slot_expires_at > pg_catalog.now() then
    return new;
  end if;
  raise exception 'append_only_violation' using errcode = 'P0001';
end;
$$;

alter function public.video_studio_complete_command(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, boolean, text, timestamptz, timestamptz
) rename to video_studio_complete_command_without_job_event_guard;

revoke execute on function public.video_studio_complete_command_without_job_event_guard(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, boolean, text, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

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
  v_command_kind text;
  v_event_count bigint;
  v_event_chain_hash text;
  v_source_revision_hash text;
  v_refreshed_slots integer;
  v_existing_receipt boolean;
  v_is_late_completion boolean := false;
  v_forwarded_result_refs jsonb := p_result_refs;
  v_command public.video_studio_commands%rowtype;
  v_downstream_recovery public.video_studio_command_recoveries%rowtype;
  v_job public.video_studio_jobs%rowtype;
  v_result record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-job:' || p_job_id, 0)
  );

  select * into v_command
  from public.video_studio_commands
  where id = p_command_id
  for update;
  if not found then raise exception 'command_not_found' using errcode = 'P0001'; end if;
  if v_command.job_id <> p_job_id then raise exception 'receipt_conflict' using errcode = 'P0001'; end if;
  v_command_kind := v_command.command_kind;

  select * into v_job
  from public.video_studio_jobs
  where job_id = p_job_id
  for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;

  select exists (
    select 1
    from public.video_studio_command_receipts
    where receipt_hash = p_receipt_hash
  ) into v_existing_receipt;

  if not v_existing_receipt
    and v_command.status = 'attention'
    and v_command.safe_code in ('attempts_exhausted', 'command_expired') then
    if v_command.completed_at is null
      or v_command.result_receipt_hash is not null
      or v_command.command_hash is distinct from p_command_hash
      or v_command.last_lease_owner_hash is distinct from p_runner_id_hash then
      raise exception 'lease_conflict' using errcode = 'P0001';
    end if;
    if p_started_at is null
      or p_finished_at is null
      or p_started_at > p_finished_at
      or p_finished_at > v_command.completed_at then
      raise exception 'invalid_receipt' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.video_studio_command_receipts as prior_receipt
      where prior_receipt.command_id = p_command_id
        or prior_receipt.receipt_hash = p_receipt_hash
    ) then
      raise exception 'receipt_conflict' using errcode = 'P0001';
    end if;
    select * into v_downstream_recovery
    from public.video_studio_command_recoveries as downstream_recovery
    where downstream_recovery.source_command_id = p_command_id;
    if found then
      update public.video_studio_commands as recovery_command
      set status = 'cancelled',
          safe_code = 'superseded_by_late_source_receipt',
          completed_at = pg_catalog.now(),
          lease_owner_hash = null,
          lease_token_hash = null,
          lease_expires_at = null
      where recovery_command.id = v_downstream_recovery.binding_command_id
        and recovery_command.status = 'queued'
        and recovery_command.attempt_count = 0
        and recovery_command.lease_owner_hash is null
        and recovery_command.lease_token_hash is null
        and recovery_command.result_receipt_hash is null
        and not exists (
          select 1
          from public.video_studio_review_events as recovery_event
          where recovery_event.review_id = v_downstream_recovery.recovery_review_id
        );
      if not found then
        raise exception 'recovery_exists' using errcode = 'P0001';
      end if;
      update public.video_studio_review_requests as recovery_review
      set status = 'superseded', binding_state = 'failed'
      where recovery_review.id = v_downstream_recovery.recovery_review_id
        and recovery_review.status = 'pending'
        and recovery_review.binding_state = 'queued';
      if not found then
        raise exception 'recovery_exists' using errcode = 'P0001';
      end if;
    end if;
    if exists (
      select 1 from public.video_studio_commands as newer_command
      where newer_command.job_id = p_job_id
        and newer_command.id <> p_command_id
        and newer_command.status in ('queued', 'leased')
    ) then
      raise exception 'command_in_flight' using errcode = 'P0001';
    end if;
    if exists (
      select 1
      from public.video_studio_job_platform_states as other_state
      where other_state.job_id = p_job_id
        and other_state.platform <> v_command.platform
        and (
          other_state.active_candidate_hash is not null
          or other_state.active_parent_revision_hash is not null
          or other_state.active_parent_artifact_hash is not null
          or other_state.active_parent_candidate_hash is not null
        )
    ) then
      raise exception 'cross_platform_magic_lineage' using errcode = 'P0001';
    end if;
    if not exists (
      select 1
      from public.video_studio_job_platform_states as current_state
      where current_state.job_id = p_job_id
        and current_state.platform = v_command.platform
        and current_state.active_revision_hash
          is not distinct from v_command.expected_parent_revision_hash
        and current_state.active_artifact_hash
          is not distinct from v_command.expected_parent_artifact_hash
    ) then
      raise exception 'stale_parent' using errcode = 'P0001';
    end if;
    v_is_late_completion := true;
  end if;

  if not v_existing_receipt and p_receipt_status = 'failed' then
    if p_result_refs ? 'result_source_event_count'
      or p_result_refs ? 'result_source_event_chain_hash'
      or p_result_refs ? 'result_source_revision_hash' then
      raise exception 'invalid_receipt' using errcode = 'P0001';
    end if;
  elsif not v_existing_receipt then
    if not (p_result_refs ? 'result_source_event_count')
      or not (p_result_refs ? 'result_source_event_chain_hash')
      or not (p_result_refs ? 'result_source_revision_hash')
      or pg_catalog.jsonb_typeof(p_result_refs -> 'result_source_event_count') <> 'number'
      or p_result_refs ->> 'result_source_event_count' !~ '^[1-9][0-9]{0,17}$'
      or p_result_refs ->> 'result_source_event_chain_hash' !~ '^[a-f0-9]{64}$'
      or p_result_refs ->> 'result_source_revision_hash' !~ '^[a-f0-9]{64}$'
      or (
        v_command_kind = 'magic_edit_prepare'
        and p_result_refs ->> 'result_source_revision_hash'
          is distinct from v_job.source_revision_hash
      )
      or (
        v_command_kind <> 'magic_edit_prepare'
        and p_result_refs ->> 'result_source_revision_hash'
          is distinct from p_result_revision_hash
      ) then
      raise exception 'invalid_receipt' using errcode = 'P0001';
    end if;
    v_event_count := (p_result_refs ->> 'result_source_event_count')::bigint;
    v_event_chain_hash := p_result_refs ->> 'result_source_event_chain_hash';
    v_source_revision_hash := p_result_refs ->> 'result_source_revision_hash';
    if v_job.source_event_count is null
      or v_job.source_event_chain_hash is null
      or v_event_count < v_job.source_event_count
      or (
        v_event_count = v_job.source_event_count
        and (
          v_event_chain_hash is distinct from v_job.source_event_chain_hash
          or v_source_revision_hash is distinct from v_job.source_revision_hash
        )
      )
      or (
        v_event_count > v_job.source_event_count
        and v_event_chain_hash is not distinct from v_job.source_event_chain_hash
      )
      or v_event_count <= v_job.source_event_count then
      raise exception 'stale_event_count' using errcode = 'P0001';
    end if;
    if v_command_kind = 'review_recovery_record' then
      perform pg_catalog.set_config(
        'video_studio.recovery_result_source_event_count', v_event_count::text, true
      );
      perform pg_catalog.set_config(
        'video_studio.recovery_result_source_event_chain_hash', v_event_chain_hash, true
      );
      perform pg_catalog.set_config(
        'video_studio.recovery_result_source_revision_hash', v_source_revision_hash, true
      );
      v_forwarded_result_refs := p_result_refs
        - 'result_source_event_count'
        - 'result_source_event_chain_hash'
        - 'result_source_revision_hash';
    end if;
  end if;

  -- Upload-slot expiry authorizes writes to preview storage; it must not make an
  -- already-written, API-verified receipt impossible to acknowledge. Refresh
  -- only the two immutable slots whose complete binding was just presented.
  if not v_existing_receipt
    and v_command_kind = 'magic_edit_prepare'
    and p_receipt_status = 'succeeded' then
    if p_result_refs ->> 'before_preview_object_key' is null
      or p_result_refs ->> 'before_preview_hash' !~ '^[a-f0-9]{64}$'
      or p_result_refs ->> 'before_preview_md5' !~ '^[a-f0-9]{32}$'
      or p_result_refs ->> 'before_preview_byte_size' !~ '^[0-9]{1,8}$'
      or (p_result_refs ->> 'before_preview_byte_size')::integer not between 1 and 26214400
      or p_result_refs ->> 'after_preview_object_key' is null
      or p_result_refs ->> 'after_preview_hash' !~ '^[a-f0-9]{64}$'
      or p_result_refs ->> 'after_preview_md5' !~ '^[a-f0-9]{32}$'
      or p_result_refs ->> 'after_preview_byte_size' !~ '^[0-9]{1,8}$'
      or (p_result_refs ->> 'after_preview_byte_size')::integer not between 1 and 26214400 then
      raise exception 'invalid_preview_refs' using errcode = 'P0001';
    end if;

    perform pg_catalog.set_config(
      'video_studio.preview_slot_refresh_command_id', p_command_id::text, true
    );
    update public.video_studio_preview_upload_slots as slot
    set slot_expires_at = greatest(
      slot.slot_expires_at,
      pg_catalog.now() + interval '5 minutes'
    )
    where slot.command_id = p_command_id
      and slot.job_id = p_job_id
      and slot.runner_id_hash = p_runner_id_hash
      and slot.content_type = 'video/mp4'
      and (
        (
          slot.side = 'before'
          and slot.object_key = p_result_refs ->> 'before_preview_object_key'
          and slot.content_sha256 = p_result_refs ->> 'before_preview_hash'
          and slot.content_md5 = p_result_refs ->> 'before_preview_md5'
          and slot.byte_size = (p_result_refs ->> 'before_preview_byte_size')::integer
        )
        or (
          slot.side = 'after'
          and slot.object_key = p_result_refs ->> 'after_preview_object_key'
          and slot.content_sha256 = p_result_refs ->> 'after_preview_hash'
          and slot.content_md5 = p_result_refs ->> 'after_preview_md5'
          and slot.byte_size = (p_result_refs ->> 'after_preview_byte_size')::integer
        )
      );
    get diagnostics v_refreshed_slots = row_count;
    perform pg_catalog.set_config('video_studio.preview_slot_refresh_command_id', '', true);
    if v_refreshed_slots <> 2 then
      raise exception 'preview_slot_missing' using errcode = 'P0001';
    end if;
  end if;

  if v_is_late_completion then
    if v_command_kind = 'review_recovery_record' then
      perform pg_catalog.set_config(
        'video_studio.late_binding_review_id', v_command.review_id::text, true
      );
      update public.video_studio_review_requests
      set binding_state = 'queued'
      where id = v_command.review_id
        and binding_state = 'failed'
        and recovery_of_command_id is not null;
      if not found then
        raise exception 'invalid_review_binding_transition' using errcode = 'P0001';
      end if;
      perform pg_catalog.set_config('video_studio.late_binding_review_id', '', true);
    end if;
    perform pg_catalog.set_config('video_studio.late_completion_lease', 'on', true);
    update public.video_studio_commands
    set status = 'leased',
        safe_code = null,
        completed_at = null,
        lease_owner_hash = p_runner_id_hash,
        lease_token_hash = p_lease_token_hash,
        lease_expires_at = pg_catalog.now() + interval '5 minutes'
    where id = p_command_id;
    perform pg_catalog.set_config('video_studio.late_completion_lease', '', true);
  end if;

  select result.* into v_result
  from public.video_studio_complete_command_without_job_event_guard(
    p_command_id,
    p_job_id,
    p_runner_id_hash,
    p_lease_token_hash,
    p_command_hash,
    p_receipt_hash,
    p_receipt_signature,
    p_receipt_status,
    p_result_revision_hash,
    p_result_artifact_hash,
    v_forwarded_result_refs,
    p_hard_gates,
    p_retryable,
    p_safe_code,
    p_started_at,
    p_finished_at
  ) as result;

  if not v_result.duplicate
    and v_event_count is not null
    and v_event_count > v_job.source_event_count then
    update public.video_studio_jobs
    set source_revision_hash = v_source_revision_hash,
        source_event_count = v_event_count,
        source_event_chain_hash = v_event_chain_hash
    where job_id = p_job_id;
  end if;

  return query select
    v_result.command_status::text,
    v_result.duplicate::boolean,
    v_result.review_id::uuid,
    v_result.activation_eligible::boolean;
end;
$$;

alter function public.video_studio_enqueue_command(
  text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text
) rename to video_studio_enqueue_command_without_job_lock;

revoke execute on function public.video_studio_enqueue_command_without_job_lock(
  text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text
) from public, anon, authenticated, service_role;

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
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-job:' || p_job_id, 0)
  );
  return query
  select result.command_id, result.command_status, result.duplicate, result.created_at
  from public.video_studio_enqueue_command_without_job_lock(
    p_job_id,
    p_platform,
    p_source_review_id,
    p_command_kind,
    p_candidate_hash,
    p_expected_parent_revision_hash,
    p_expected_parent_artifact_hash,
    p_semantic_target_map_hash,
    p_payload,
    p_payload_hash,
    p_command_hash,
    p_idempotency_key,
    p_requested_by
  ) as result;
end;
$$;

alter function public.video_studio_record_decision(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text
) rename to video_studio_record_decision_without_job_lock;

revoke execute on function public.video_studio_record_decision_without_job_lock(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text
) from public, anon, authenticated, service_role;

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
  v_job_id text;
begin
  select job_id into v_job_id
  from public.video_studio_review_requests
  where id = p_review_id;
  if not found then raise exception 'review_not_found' using errcode = 'P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-job:' || v_job_id, 0)
  );
  return query
  select
    result.review_status,
    result.result_action,
    result.command_id,
    result.command_status,
    result.command_created_at,
    result.duplicate,
    result.decided_at
  from public.video_studio_record_decision_without_job_lock(
    p_review_id,
    p_idempotency_key,
    p_expected_parent_revision_hash,
    p_expected_parent_artifact_hash,
    p_revision_hash,
    p_artifact_hash,
    p_decision,
    p_feedback,
    p_override_reason,
    p_learning_confirmation,
    p_submitted_at,
    p_decision_hash,
    p_runner_payload,
    p_runner_payload_hash,
    p_runner_command_hash
  ) as result;
end;
$$;

alter function public.video_studio_recover_failed_review(
  uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text
) rename to video_studio_recover_failed_review_without_job_lock;

revoke execute on function public.video_studio_recover_failed_review_without_job_lock(
  uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text
) from public, anon, authenticated, service_role;

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
  v_source_command public.video_studio_commands%rowtype;
  v_healthy_runner_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-job:' || p_job_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('video-studio-recovery:' || p_idempotency_key::text, 0)
  );

  -- A lost HTTP response must remain retryable even if runner health later
  -- changes. The original function verifies the complete idempotent binding.
  if exists (
    select 1
    from public.video_studio_command_recoveries
    where idempotency_key = p_idempotency_key
  ) then
    return query
    select
      result.duplicate,
      result.recovery_review_id,
      result.recovery_generation,
      result.job_id,
      result.platform,
      result.review_status,
      result.parent_revision_hash,
      result.parent_artifact_hash,
      result.created_at,
      result.binding_command_id,
      result.binding_command_status,
      result.binding_command_created_at
    from public.video_studio_recover_failed_review_without_job_lock(
      p_command_id,
      p_job_id,
      p_platform,
      p_expected_parent_revision_hash,
      p_expected_parent_artifact_hash,
      p_idempotency_key,
      p_submitted_at,
      p_recovery_hash,
      p_recovery_review_id,
      p_runner_payload,
      p_runner_payload_hash,
      p_runner_command_hash
    ) as result;
    return;
  end if;

  select * into v_source_command
  from public.video_studio_commands
  where id = p_command_id and job_id = p_job_id
  for update;
  if not found then raise exception 'command_not_found' using errcode = 'P0001'; end if;
  if v_source_command.last_lease_owner_hash is not null then
    select pg_catalog.count(*) into v_healthy_runner_count
    from public.video_studio_runner_heartbeats as heartbeat
    where heartbeat.runner_id_hash = v_source_command.last_lease_owner_hash
      and heartbeat.runner_status = 'idle'
      and heartbeat.drive_state = 'ready'
      and heartbeat.active_command_id is null
      and heartbeat.pending_receipts = 0
      and v_source_command.schema_version = any(heartbeat.command_schema_versions)
      and heartbeat.received_at > v_source_command.completed_at
      and heartbeat.received_at > pg_catalog.now() - interval '2 minutes';
  elsif v_source_command.status = 'attention'
    and v_source_command.safe_code = 'command_expired'
    and v_source_command.attempt_count = 0 then
    select pg_catalog.count(*) into v_healthy_runner_count
    from public.video_studio_runner_heartbeats as heartbeat
    where heartbeat.runner_status = 'idle'
      and heartbeat.drive_state = 'ready'
      and heartbeat.active_command_id is null
      and heartbeat.pending_receipts = 0
      and v_source_command.schema_version = any(heartbeat.command_schema_versions)
      and heartbeat.received_at > v_source_command.completed_at
      and heartbeat.received_at > pg_catalog.now() - interval '2 minutes';
  else
    v_healthy_runner_count := 0;
  end if;
  if v_healthy_runner_count <> 1 then
    raise exception 'recovery_not_available' using errcode = 'P0001';
  end if;
  return query
  select
    result.duplicate,
    result.recovery_review_id,
    result.recovery_generation,
    result.job_id,
    result.platform,
    result.review_status,
    result.parent_revision_hash,
    result.parent_artifact_hash,
    result.created_at,
    result.binding_command_id,
    result.binding_command_status,
    result.binding_command_created_at
  from public.video_studio_recover_failed_review_without_job_lock(
    p_command_id,
    p_job_id,
    p_platform,
    p_expected_parent_revision_hash,
    p_expected_parent_artifact_hash,
    p_idempotency_key,
    p_submitted_at,
    p_recovery_hash,
    p_recovery_review_id,
    p_runner_payload,
    p_runner_payload_hash,
    p_runner_command_hash
  ) as result;
end;
$$;

revoke execute on function public.video_studio_project_review(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.video_studio_project_review(text, text, uuid, text, jsonb) to service_role;
revoke execute on function public.video_studio_complete_command(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, boolean, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.video_studio_complete_command(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, boolean, text, timestamptz, timestamptz
) to service_role;
revoke execute on function public.video_studio_enqueue_command(
  text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.video_studio_enqueue_command(
  text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid, text
) to service_role;
revoke execute on function public.video_studio_record_decision(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.video_studio_record_decision(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, text, jsonb, text, text
) to service_role;
revoke execute on function public.video_studio_recover_failed_review(
  uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.video_studio_recover_failed_review(
  uuid, text, text, text, text, uuid, timestamptz, text, uuid, jsonb, text, text
) to service_role;

revoke insert, update, delete on public.video_studio_jobs from service_role;
revoke insert, update, delete on public.video_studio_job_platform_states from service_role;
revoke insert, update, delete on public.video_studio_review_requests from service_role;
revoke insert, update, delete on public.video_studio_commands from service_role;
revoke insert, update, delete on public.video_studio_review_events from service_role;
revoke insert, update, delete on public.video_studio_command_receipts from service_role;
revoke insert, update, delete on public.video_studio_preview_upload_slots from service_role;
revoke insert, update, delete on public.video_studio_runner_heartbeats from service_role;
revoke insert, update, delete on public.video_studio_rate_limits from service_role;
revoke insert, update, delete on public.video_studio_projection_events from service_role;
revoke insert, update, delete on public.video_studio_preview_retention_events from service_role;
revoke insert, update, delete on public.video_studio_command_recoveries from service_role;

comment on table public.video_studio_magic_candidate_lineage is
  'Immutable immediate-parent links for reversible magic-edit activation chains.';
comment on function public.video_studio_project_review(text, text, uuid, text, jsonb) is
  'Projects a safe review using an optional exact acknowledged platform state for CAS. Desired parent fields remain magic-edit undo lineage only.';
comment on function public.video_studio_complete_command(
  uuid, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, boolean, text, timestamptz, timestamptz
) is 'Completes a signed runner command and atomically advances its source event count and revision.';

commit;
