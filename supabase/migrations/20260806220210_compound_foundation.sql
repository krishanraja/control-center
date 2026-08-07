-- COMPOUND is isolated from Control Center by schema, grants, and RLS.
-- The only cross-schema relationship is the member allowlist's auth user id.

create schema if not exists compound;

comment on schema compound is 'Private COMPOUND application data. No Control Center runtime dependency.';

revoke all on schema compound from public, anon;
grant usage on schema compound to authenticated, service_role;

create table compound.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table compound.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 32),
  name text not null check (char_length(name) between 1 and 160),
  asset_type text not null check (asset_type in ('equity', 'crypto', 'cash', 'fund', 'other')),
  units numeric not null check (units >= 0),
  average_cost numeric check (average_cost is null or average_cost >= 0),
  currency text not null default 'AUD' check (char_length(currency) = 3),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table compound.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  as_of timestamptz not null,
  horizon text not null check (horizon in ('3m', '1y')),
  status text not null check (status in ('representative', 'partial', 'quiet', 'stale')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, as_of, horizon)
);

create table compound.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  snapshot_id uuid not null references compound.daily_snapshots(id) on delete restrict,
  horizon text not null check (horizon in ('3m', '1y')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table compound.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references compound.chat_threads(id) on delete cascade,
  user_id uuid not null references compound.members(user_id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  client_request_id uuid not null,
  content text not null check (char_length(content) between 1 and 8000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  status text not null default 'complete' check (status in ('complete', 'failed')),
  provider text,
  model text,
  created_at timestamptz not null default now()
);

create index daily_snapshots_user_horizon_as_of_idx
  on compound.daily_snapshots (user_id, horizon, as_of desc);
create index chat_threads_user_updated_idx
  on compound.chat_threads (user_id, updated_at desc);
create index chat_messages_thread_created_idx
  on compound.chat_messages (thread_id, created_at);
create index chat_messages_user_created_idx
  on compound.chat_messages (user_id, created_at desc);
create unique index chat_messages_request_role_idx
  on compound.chat_messages (user_id, client_request_id, role);

create or replace function compound.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function compound.set_updated_at() from public, anon, authenticated;

create trigger holdings_set_updated_at
  before update on compound.holdings
  for each row execute function compound.set_updated_at();
create trigger chat_threads_set_updated_at
  before update on compound.chat_threads
  for each row execute function compound.set_updated_at();

alter table compound.members enable row level security;
alter table compound.holdings enable row level security;
alter table compound.daily_snapshots enable row level security;
alter table compound.chat_threads enable row level security;
alter table compound.chat_messages enable row level security;

alter table compound.members force row level security;
alter table compound.holdings force row level security;
alter table compound.daily_snapshots force row level security;
alter table compound.chat_threads force row level security;
alter table compound.chat_messages force row level security;

create policy members_read_self
  on compound.members for select to authenticated
  using (user_id = (select auth.uid()));

create policy holdings_read_self
  on compound.holdings for select to authenticated
  using (user_id = (select auth.uid()));
create policy holdings_insert_self
  on compound.holdings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy holdings_update_self
  on compound.holdings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy holdings_delete_self
  on compound.holdings for delete to authenticated
  using (user_id = (select auth.uid()));

create policy snapshots_read_self
  on compound.daily_snapshots for select to authenticated
  using (user_id = (select auth.uid()));

create policy threads_read_self
  on compound.chat_threads for select to authenticated
  using (user_id = (select auth.uid()));
create policy threads_insert_self
  on compound.chat_threads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from compound.daily_snapshots snapshot
      where snapshot.id = snapshot_id and snapshot.user_id = (select auth.uid())
    )
  );
create policy threads_update_self
  on compound.chat_threads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy messages_read_self
  on compound.chat_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy messages_insert_self
  on compound.chat_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from compound.chat_threads thread
      where thread.id = thread_id and thread.user_id = (select auth.uid())
    )
  );

revoke all on all tables in schema compound from public, anon;
grant select on compound.members, compound.daily_snapshots to authenticated;
grant select, insert, update, delete on compound.holdings to authenticated;
grant select, insert, update on compound.chat_threads to authenticated;
grant select, insert on compound.chat_messages to authenticated;
grant all on all tables in schema compound to service_role;

alter default privileges for role postgres in schema compound revoke all on tables from public, anon;
alter default privileges for role postgres in schema compound revoke all on sequences from public, anon;
alter default privileges for role postgres in schema compound revoke all on functions from public, anon;
