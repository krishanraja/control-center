-- COMPOUND spend surface. Every outgoing from every source in one itemised
-- table, priced in USD, with the merchant and scope worked out by the daily
-- pipeline. Same posture as the property migration: RLS enabled and forced
-- everywhere, member reads scoped to auth.uid() or to membership, the
-- service-role pipeline writes everything except the member's own override
-- table, and nothing personal is seeded here.
--
-- Sources mirrored read-only: the bills and receipts Google Sheet tab, the
-- Control Center invoice and usage-meter tables (read by the pipeline only,
-- never by a browser role), and the property ledger mirror already in this
-- schema. Nothing here writes back to any of them.

-- ---------------------------------------------------------------------------
-- Items: one row per outgoing, all sources
-- ---------------------------------------------------------------------------

create table compound.spend_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  source text not null check (source in ('bills_sheet', 'cc_invoices', 'property_ledger')),
  source_ref text not null check (char_length(source_ref) between 4 and 80),
  occurred_on date not null,
  merchant text not null check (char_length(merchant) between 1 and 200),
  merchant_key text not null check (merchant_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  registry_key text,
  item text,
  category text,
  scope text not null check (scope in ('personal', 'os', 'property')),
  scope_reason text not null check (scope_reason in ('override', 'alias', 'registry', 'ledger', 'default')),
  kind text not null check (kind in ('charge', 'refund')),
  amount numeric check (amount is null or amount >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  amount_usd numeric,
  fx_rate numeric check (fx_rate is null or fx_rate > 0),
  fx_date date,
  fx_source text check (fx_source is null or fx_source in ('rba', 'control_center', 'none')),
  evidence text,
  payment_method text,
  account_email text,
  confidence text,
  invoice_ref text,
  message_id text check (message_id is null or message_id ~ '^[0-9a-f]{16}$'),
  dedupe_key text not null,
  superseded_by_ref text,
  possible_duplicate_of_ref text,
  flags text[] not null default '{}',
  hidden boolean not null default false,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, source, source_ref)
);

create index spend_items_user_date_idx on compound.spend_items (user_id, occurred_on desc);
create index spend_items_user_scope_idx on compound.spend_items (user_id, scope, occurred_on desc);
create index spend_items_message_idx on compound.spend_items (user_id, message_id) where message_id is not null;

-- ---------------------------------------------------------------------------
-- Merchants: the Control Center registry mirrored, plus merchants discovered in
-- the items. Rebuilt by the pipeline each run.
-- ---------------------------------------------------------------------------

create table compound.spend_merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  merchant_key text not null check (merchant_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  registry_key text,
  category text,
  scope_default text not null check (scope_default in ('personal', 'os', 'property')),
  vendor_match text[] not null default '{}',
  included_usd numeric,
  overage_trigger_usd numeric,
  cycle_usd numeric,
  cycle_start date,
  cycle_end date,
  balance numeric,
  balance_unit text,
  top_up_url text,
  active boolean not null default true,
  first_seen_on date,
  last_seen_on date,
  item_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

-- ---------------------------------------------------------------------------
-- Overrides: the one table the member edits. A row here decides a merchant's
-- scope regardless of what the registry says.
-- ---------------------------------------------------------------------------

create table compound.spend_merchant_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  merchant_key text not null check (merchant_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  scope text not null check (scope in ('personal', 'os', 'property')),
  display_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

-- ---------------------------------------------------------------------------
-- Usage meter mirror (trailing window) and exchange rates. Shared facts, not
-- personal rows: read by any member, written by the pipeline.
-- ---------------------------------------------------------------------------

create table compound.spend_meter_daily (
  provider text not null,
  unit_kind text not null,
  unit_key text not null,
  day date not null,
  bucket text not null default '',
  unit_label text,
  category text,
  usd numeric not null default 0,
  runs integer not null default 0,
  failed integer not null default 0,
  units numeric not null default 0,
  unit_name text,
  synced_at timestamptz not null default now(),
  primary key (provider, unit_kind, unit_key, day, bucket)
);

create index spend_meter_daily_day_idx on compound.spend_meter_daily (day desc);

-- RBA table F11.1 publishes "A$1 = X units" of each currency, and per_aud keeps
-- exactly that number so a reader can check it against the published sheet.
create table compound.spend_fx_rates (
  rate_on date not null,
  currency text not null check (currency in ('USD', 'EUR', 'GBP')),
  per_aud numeric not null check (per_aud > 0),
  source text not null default 'rba_f11_1',
  synced_at timestamptz not null default now(),
  primary key (rate_on, currency)
);

create table compound.spend_runs (
  id uuid primary key default gen_random_uuid(),
  run_on date not null,
  mode text not null check (mode in ('scheduled', 'manual')),
  attempt smallint not null check (attempt between 1 and 3),
  status text not null check (status in ('running', 'complete', 'partial', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  provider_results jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_results) = 'object'),
  error_summary text,
  created_at timestamptz not null default now(),
  unique (run_on, mode, attempt)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger spend_merchants_set_updated_at
  before update on compound.spend_merchants
  for each row execute function compound.set_updated_at();
create trigger spend_merchant_overrides_set_updated_at
  before update on compound.spend_merchant_overrides
  for each row execute function compound.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table compound.spend_items enable row level security;
alter table compound.spend_merchants enable row level security;
alter table compound.spend_merchant_overrides enable row level security;
alter table compound.spend_meter_daily enable row level security;
alter table compound.spend_fx_rates enable row level security;
alter table compound.spend_runs enable row level security;

alter table compound.spend_items force row level security;
alter table compound.spend_merchants force row level security;
alter table compound.spend_merchant_overrides force row level security;
alter table compound.spend_meter_daily force row level security;
alter table compound.spend_fx_rates force row level security;
alter table compound.spend_runs force row level security;

create policy spend_items_read_self on compound.spend_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy spend_merchants_read_self on compound.spend_merchants for select to authenticated
  using (user_id = (select auth.uid()));

create policy spend_merchant_overrides_read_self on compound.spend_merchant_overrides for select to authenticated
  using (user_id = (select auth.uid()));
create policy spend_merchant_overrides_insert_self on compound.spend_merchant_overrides for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy spend_merchant_overrides_update_self on compound.spend_merchant_overrides for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy spend_merchant_overrides_delete_self on compound.spend_merchant_overrides for delete to authenticated
  using (user_id = (select auth.uid()));

create policy spend_meter_daily_read_members on compound.spend_meter_daily
  for select to authenticated
  using (exists (select 1 from compound.members m where m.user_id = (select auth.uid())));

create policy spend_fx_rates_read_members on compound.spend_fx_rates
  for select to authenticated
  using (exists (select 1 from compound.members m where m.user_id = (select auth.uid())));

create policy spend_runs_read_members on compound.spend_runs
  for select to authenticated
  using (exists (select 1 from compound.members m where m.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on
  compound.spend_items, compound.spend_merchants, compound.spend_merchant_overrides,
  compound.spend_meter_daily, compound.spend_fx_rates, compound.spend_runs
from public, anon;

grant select on
  compound.spend_items, compound.spend_merchants,
  compound.spend_meter_daily, compound.spend_fx_rates, compound.spend_runs
to authenticated;

grant select, insert, update, delete on
  compound.spend_merchant_overrides
to authenticated;

grant all on
  compound.spend_items, compound.spend_merchants, compound.spend_merchant_overrides,
  compound.spend_meter_daily, compound.spend_fx_rates, compound.spend_runs
to service_role;

comment on table compound.spend_items is 'COMPOUND spend: every outgoing from the bills sheet, Control Center invoices and the property ledger, priced in USD. Written by the daily pipeline only.';
comment on table compound.spend_merchants is 'Control Center service registry mirrored plus discovered merchants. Rebuilt each run.';
comment on table compound.spend_merchant_overrides is 'Member-owned scope overrides by merchant key. The one spend table a member writes.';
comment on table compound.spend_meter_daily is 'Trailing mirror of the Control Center usage meter. Breakdown only; never added to a total.';
comment on table compound.spend_fx_rates is 'RBA F11.1 daily rates, units of currency per A$1.';

notify pgrst, 'reload schema';
