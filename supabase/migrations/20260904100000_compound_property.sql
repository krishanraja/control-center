-- COMPOUND property surface. One owned unit, its loan, its rent history, a
-- read-only mirror of the cost ledger sheet, public market observations, stored
-- value estimates and suburb rankings. Same posture as the foundation
-- migration: RLS enabled and forced everywhere, member reads scoped to
-- auth.uid(), the service-role pipeline writes market and mirrored data, and
-- nothing personal is seeded here. Facts arrive through the import CLI.

-- ---------------------------------------------------------------------------
-- Manual-input tables. The member may edit these so a future in-app form needs
-- no schema change.
-- ---------------------------------------------------------------------------

create table compound.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  label text not null check (char_length(label) between 1 and 120),
  address text not null check (char_length(address) between 1 and 200),
  suburb text not null check (char_length(suburb) between 1 and 80),
  state text not null default 'QLD' check (char_length(state) between 2 and 3),
  postcode text not null check (postcode ~ '^\d{4}$'),
  dwelling_type text not null check (dwelling_type in ('unit', 'house', 'townhouse')),
  bedrooms smallint not null check (bedrooms between 0 and 20),
  bathrooms smallint not null check (bathrooms between 0 and 20),
  car_spaces smallint not null check (car_spaces between 0 and 20),
  floor_note text,
  purchase_price_aud numeric not null check (purchase_price_aud > 0),
  contract_on date,
  settled_on date not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table compound.property_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  property_id uuid not null references compound.properties(id) on delete cascade,
  lender text not null check (char_length(lender) between 1 and 80),
  product text,
  purpose text not null check (purpose in ('investment', 'owner_occupier')),
  principal_aud numeric not null check (principal_aud > 0),
  term_months integer not null check (term_months between 12 and 480),
  repayment_type text not null check (repayment_type in ('principal_and_interest', 'interest_only')),
  first_repayment_on date not null,
  repayment_aud numeric check (repayment_aud is null or repayment_aud > 0),
  offset_balance_aud numeric not null default 0 check (offset_balance_aud >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, property_id, lender, first_repayment_on)
);

create table compound.property_loan_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  loan_id uuid not null references compound.property_loans(id) on delete cascade,
  effective_from date not null,
  rate_pct numeric not null check (rate_pct between 0 and 30),
  source text not null check (source in ('settlement', 'bank_notice', 'manual', 'estimate')),
  note text,
  created_at timestamptz not null default now(),
  unique (loan_id, effective_from)
);

create table compound.property_rents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  property_id uuid not null references compound.properties(id) on delete cascade,
  effective_from date not null,
  amount_aud numeric not null check (amount_aud > 0),
  period text not null check (period in ('week', 'fortnight', 'month')),
  management_fee_pct numeric check (management_fee_pct is null or management_fee_pct between 0 and 30),
  lease_ends_on date,
  kind text not null default 'unknown_prior'
    check (kind in ('initial', 'increase', 'new_lease', 'renewal', 'unknown_prior')),
  note text,
  created_at timestamptz not null default now(),
  unique (property_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Ledger mirror. The Google Sheet is the editing surface; this table is a
-- read-only copy written by the service-role pipeline (or the import CLI).
-- ---------------------------------------------------------------------------

create table compound.property_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  property_id uuid not null references compound.properties(id) on delete cascade,
  occurred_on date not null,
  sheet_category text not null,
  category text not null check (category in (
    'rent_received', 'management_fee', 'loan_repayment', 'council_rates', 'body_corporate',
    'water', 'insurance', 'purchase_cost', 'legal', 'repairs', 'other'
  )),
  direction text not null check (direction in ('in', 'out', 'gap', 'milestone')),
  amount_aud numeric,
  description text,
  payee text,
  confidence text,
  source_note text,
  external_ref text not null check (char_length(external_ref) between 4 and 64),
  source text not null check (source in ('google_sheet', 'manual')),
  sheet_row integer,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, external_ref),
  constraint property_ledger_amount_matches_direction check (
    (direction in ('in', 'out') and amount_aud is not null and amount_aud > 0)
    or direction in ('gap', 'milestone')
  )
);

create index property_ledger_property_date_idx
  on compound.property_ledger (property_id, occurred_on desc);

-- ---------------------------------------------------------------------------
-- Market observations are public facts, so they carry no user id. Any member
-- may read them; only the pipeline writes them.
-- ---------------------------------------------------------------------------

create table compound.property_market_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('rta', 'domain', 'qld_open_data', 'rba', 'apify', 'manual')),
  area_kind text not null check (area_kind in ('postcode', 'suburb', 'lga', 'state', 'national', 'building')),
  area_code text not null check (char_length(area_code) between 1 and 120),
  dwelling_type text check (dwelling_type is null or dwelling_type in ('unit', 'house', 'townhouse', 'all')),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 20),
  metric text not null check (char_length(metric) between 1 and 60),
  period_start date not null,
  period_end date not null,
  value numeric not null,
  unit text not null check (char_length(unit) between 1 and 20),
  source_url text,
  source_date date,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  observed_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create unique index property_market_observations_natural_key
  on compound.property_market_observations (
    source, area_kind, area_code,
    coalesce(dwelling_type, '-'), coalesce(bedrooms, -1),
    metric, period_start, period_end, coalesce(detail->>'ref', '-')
  );

create index property_market_observations_lookup_idx
  on compound.property_market_observations (area_code, metric, period_end desc);

create table compound.property_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references compound.members(user_id) on delete cascade,
  property_id uuid not null references compound.properties(id) on delete cascade,
  estimated_on date not null,
  method text not null check (method in ('purchase_price', 'hedonic_lite_v1', 'index_from_purchase_v1', 'manual')),
  low_aud numeric check (low_aud is null or low_aud > 0),
  mid_aud numeric not null check (mid_aud > 0),
  high_aud numeric check (high_aud is null or high_aud > 0),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  engine_version text not null,
  run_id uuid,
  created_at timestamptz not null default now(),
  unique (property_id, estimated_on, method)
);

create index property_valuations_property_date_idx
  on compound.property_valuations (property_id, estimated_on desc);

create table compound.property_suburb_rankings (
  id uuid primary key default gen_random_uuid(),
  run_on date not null,
  suburb text not null,
  postcode text not null check (postcode ~ '^\d{4}$'),
  dwelling_type text check (dwelling_type is null or dwelling_type in ('unit', 'house', 'townhouse', 'all')),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 20),
  score numeric not null,
  rank smallint not null check (rank >= 1),
  gross_yield_pct numeric,
  rent_growth_pct numeric,
  price_growth_pct numeric,
  listing_count integer,
  median_sold_price_aud numeric,
  median_weekly_rent_aud numeric,
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  missing text[] not null default '{}',
  engine_version text not null,
  created_at timestamptz not null default now()
);

create unique index property_suburb_rankings_natural_key
  on compound.property_suburb_rankings (run_on, suburb, postcode, coalesce(dwelling_type, '-'), coalesce(bedrooms, -1));

create index property_suburb_rankings_run_idx
  on compound.property_suburb_rankings (run_on desc, rank);

create table compound.property_runs (
  id uuid primary key default gen_random_uuid(),
  run_on date not null,
  mode text not null check (mode in ('scheduled', 'manual', 'import')),
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

create trigger properties_set_updated_at
  before update on compound.properties
  for each row execute function compound.set_updated_at();
create trigger property_loans_set_updated_at
  before update on compound.property_loans
  for each row execute function compound.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table compound.properties enable row level security;
alter table compound.property_loans enable row level security;
alter table compound.property_loan_rates enable row level security;
alter table compound.property_rents enable row level security;
alter table compound.property_ledger enable row level security;
alter table compound.property_market_observations enable row level security;
alter table compound.property_valuations enable row level security;
alter table compound.property_suburb_rankings enable row level security;
alter table compound.property_runs enable row level security;

alter table compound.properties force row level security;
alter table compound.property_loans force row level security;
alter table compound.property_loan_rates force row level security;
alter table compound.property_rents force row level security;
alter table compound.property_ledger force row level security;
alter table compound.property_market_observations force row level security;
alter table compound.property_valuations force row level security;
alter table compound.property_suburb_rankings force row level security;
alter table compound.property_runs force row level security;

create policy properties_read_self on compound.properties for select to authenticated
  using (user_id = (select auth.uid()));
create policy properties_insert_self on compound.properties for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy properties_update_self on compound.properties for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy properties_delete_self on compound.properties for delete to authenticated
  using (user_id = (select auth.uid()));

create policy property_loans_read_self on compound.property_loans for select to authenticated
  using (user_id = (select auth.uid()));
create policy property_loans_insert_self on compound.property_loans for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy property_loans_update_self on compound.property_loans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy property_loans_delete_self on compound.property_loans for delete to authenticated
  using (user_id = (select auth.uid()));

create policy property_loan_rates_read_self on compound.property_loan_rates for select to authenticated
  using (user_id = (select auth.uid()));
create policy property_loan_rates_insert_self on compound.property_loan_rates for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy property_loan_rates_update_self on compound.property_loan_rates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy property_loan_rates_delete_self on compound.property_loan_rates for delete to authenticated
  using (user_id = (select auth.uid()));

create policy property_rents_read_self on compound.property_rents for select to authenticated
  using (user_id = (select auth.uid()));
create policy property_rents_insert_self on compound.property_rents for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy property_rents_update_self on compound.property_rents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy property_rents_delete_self on compound.property_rents for delete to authenticated
  using (user_id = (select auth.uid()));

create policy property_ledger_read_self on compound.property_ledger for select to authenticated
  using (user_id = (select auth.uid()));

create policy property_valuations_read_self on compound.property_valuations for select to authenticated
  using (user_id = (select auth.uid()));

-- Market facts and rankings are not personal: any approved member may read them.
create policy property_market_observations_read_members on compound.property_market_observations
  for select to authenticated
  using (exists (select 1 from compound.members m where m.user_id = (select auth.uid())));

create policy property_suburb_rankings_read_members on compound.property_suburb_rankings
  for select to authenticated
  using (exists (select 1 from compound.members m where m.user_id = (select auth.uid())));

create policy property_runs_read_members on compound.property_runs
  for select to authenticated
  using (exists (select 1 from compound.members m where m.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on
  compound.properties, compound.property_loans, compound.property_loan_rates, compound.property_rents,
  compound.property_ledger, compound.property_market_observations, compound.property_valuations,
  compound.property_suburb_rankings, compound.property_runs
from public, anon;

grant select, insert, update, delete on
  compound.properties, compound.property_loans, compound.property_loan_rates, compound.property_rents
to authenticated;

grant select on
  compound.property_ledger, compound.property_market_observations, compound.property_valuations,
  compound.property_suburb_rankings, compound.property_runs
to authenticated;

grant all on
  compound.properties, compound.property_loans, compound.property_loan_rates, compound.property_rents,
  compound.property_ledger, compound.property_market_observations, compound.property_valuations,
  compound.property_suburb_rankings, compound.property_runs
to service_role;

-- ---------------------------------------------------------------------------
-- Runtime secrets for the property pipeline can live in Supabase Vault so the
-- scheduled job needs only the service-role key it already holds. Only the
-- service role may call this; it is never exposed to browser roles.
-- ---------------------------------------------------------------------------

create or replace function compound.read_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke all on function compound.read_secret(text) from public, anon, authenticated;
grant execute on function compound.read_secret(text) to service_role;

comment on table compound.properties is 'COMPOUND owned property facts. Personal data enters via the import CLI, never migrations.';
comment on table compound.property_ledger is 'Read-only mirror of the cost ledger Google Sheet tab. The sheet is the editing surface.';
comment on table compound.property_market_observations is 'Public market facts from free feeds (RTA, Domain API, RBA, Qld Open Data). Not personal.';
comment on function compound.read_secret(text) is 'Service-role-only reader for Vault secrets used by the property pipeline.';

notify pgrst, 'reload schema';
