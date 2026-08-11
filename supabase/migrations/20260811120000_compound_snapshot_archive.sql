-- Extend COMPOUND's member-scoped snapshots into an immutable daily archive.
-- Existing rows are starter records. A captured or reconstructed row is only
-- created by the service-role pipeline after its evidence packet is complete.

alter table compound.daily_snapshots
  add column if not exists snapshot_date date,
  add column if not exists published_at timestamptz,
  add column if not exists schema_version integer,
  add column if not exists engine_version text,
  add column if not exists origin text,
  add column if not exists coverage jsonb,
  add column if not exists brief jsonb;

update compound.daily_snapshots
set
  snapshot_date = coalesce(snapshot_date, as_of::date),
  published_at = coalesce(published_at, created_at),
  schema_version = coalesce(schema_version, 1),
  engine_version = coalesce(engine_version, 'starter'),
  origin = coalesce(origin, 'starter'),
  coverage = coalesce(coverage, '{}'::jsonb),
  brief = coalesce(brief, '{"state":"starter","stories":[]}'::jsonb)
where snapshot_date is null
   or published_at is null
   or schema_version is null
   or engine_version is null
   or origin is null
   or coverage is null
   or brief is null;

alter table compound.daily_snapshots
  alter column snapshot_date set not null,
  alter column published_at set not null,
  alter column schema_version set not null,
  alter column engine_version set not null,
  alter column origin set not null,
  alter column coverage set not null,
  alter column brief set not null,
  alter column coverage set default '{}'::jsonb,
  alter column brief set default '{"state":"quiet","stories":[]}'::jsonb;

alter table compound.chat_messages
  add column if not exists request_scope jsonb not null default '{}'::jsonb;

alter table compound.chat_messages
  drop constraint if exists chat_messages_request_scope_object_check;
alter table compound.chat_messages
  add constraint chat_messages_request_scope_object_check
  check (jsonb_typeof(request_scope) = 'object');

alter table compound.daily_snapshots
  drop constraint if exists daily_snapshots_coverage_object_check;
alter table compound.daily_snapshots
  add constraint daily_snapshots_coverage_object_check
  check (jsonb_typeof(coverage) = 'object');

alter table compound.daily_snapshots
  drop constraint if exists daily_snapshots_brief_object_check;
alter table compound.daily_snapshots
  add constraint daily_snapshots_brief_object_check
  check (jsonb_typeof(brief) = 'object');

alter table compound.daily_snapshots
  drop constraint if exists daily_snapshots_status_check;
alter table compound.daily_snapshots
  add constraint daily_snapshots_status_check
  check (
    (origin = 'starter' and status in ('representative', 'partial', 'quiet', 'stale'))
    or (origin in ('captured', 'reconstructed') and status in ('complete', 'partial', 'quiet'))
  );

alter table compound.daily_snapshots
  drop constraint if exists daily_snapshots_origin_check;
alter table compound.daily_snapshots
  add constraint daily_snapshots_origin_check
  check (origin in ('captured', 'reconstructed', 'starter'));

alter table compound.daily_snapshots
  drop constraint if exists daily_snapshots_schema_version_check;
alter table compound.daily_snapshots
  add constraint daily_snapshots_schema_version_check
  check (schema_version > 0);

drop index if exists compound.daily_snapshots_user_date_horizon_idx;
create unique index daily_snapshots_user_date_horizon_idx
  on compound.daily_snapshots (user_id, snapshot_date, horizon)
  where origin in ('captured', 'reconstructed');

create or replace function compound.prevent_published_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.origin in ('captured', 'reconstructed') then
    raise exception 'Published COMPOUND snapshots are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_published_snapshot_mutation on compound.daily_snapshots;
create trigger prevent_published_snapshot_mutation
  before update or delete on compound.daily_snapshots
  for each row execute function compound.prevent_published_snapshot_mutation();

create table if not exists compound.snapshot_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  snapshot_date date not null,
  mode text not null check (mode in ('scheduled', 'manual', 'backfill')),
  attempt integer not null check (attempt between 1 and 3),
  status text not null check (status in ('running', 'complete', 'partial', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  provider_results jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_results) = 'object'),
  error_summary text,
  snapshot_id uuid references compound.daily_snapshots(id) on delete set null,
  alert_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date, mode, attempt)
);

create index if not exists snapshot_runs_user_date_idx
  on compound.snapshot_runs (user_id, snapshot_date desc, started_at desc);

create table if not exists compound.snapshot_backfill_checkpoints (
  user_id uuid not null references compound.members(user_id) on delete cascade,
  range_start date not null,
  range_end date not null,
  next_date date not null,
  status text not null check (status in ('pending', 'running', 'complete', 'failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, range_start, range_end),
  check (range_start <= range_end),
  check (next_date between range_start and range_end + 1)
);

create table if not exists compound.snapshot_context_cache (
  user_id uuid not null references compound.members(user_id) on delete cascade,
  snapshot_date date not null,
  story_key text not null,
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, snapshot_date, story_key)
);

alter table compound.snapshot_runs enable row level security;
alter table compound.snapshot_runs force row level security;
alter table compound.snapshot_backfill_checkpoints enable row level security;
alter table compound.snapshot_backfill_checkpoints force row level security;
alter table compound.snapshot_context_cache enable row level security;
alter table compound.snapshot_context_cache force row level security;

create policy snapshot_runs_read_self
  on compound.snapshot_runs for select to authenticated
  using (user_id = (select auth.uid()));

create policy snapshot_backfill_checkpoints_read_self
  on compound.snapshot_backfill_checkpoints for select to authenticated
  using (user_id = (select auth.uid()));

create policy snapshot_context_cache_read_self
  on compound.snapshot_context_cache for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on compound.snapshot_runs, compound.snapshot_backfill_checkpoints, compound.snapshot_context_cache from public, anon;
grant select on compound.snapshot_runs, compound.snapshot_backfill_checkpoints, compound.snapshot_context_cache to authenticated;
grant all on compound.snapshot_runs, compound.snapshot_backfill_checkpoints, compound.snapshot_context_cache to service_role;

alter default privileges for role postgres in schema compound revoke all on tables from public, anon;
