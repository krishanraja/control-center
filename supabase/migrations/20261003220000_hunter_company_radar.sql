-- hunter: the Company Radar. Companies he wants (his list, his Target
-- Companies tab, companies he has said Yes to, and scored lookalikes from the
-- portfolios hunter holds), their job boards and their open roles. Written by
-- hunter/src/hunter/radar.py; applied 2026-10-03 through the Supabase
-- connector and read back.
create table if not exists public.hunter_company_radar (
  key text primary key,
  name text not null,
  sources text[] not null default '{}',
  area text,
  why text,
  stage text,
  description text,
  ats text,
  slug text,
  lookalike numeric,
  lookalike_why text,
  top boolean not null default false,
  open_roles integer,
  matching_roles integer,
  best_roles jsonb,
  scored_at timestamptz,
  swept_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hunter_company_radar enable row level security;
comment on table public.hunter_company_radar is 'hunter: companies he wants (his list, Target Companies, his Yes companies, scored lookalikes), their boards and open roles. Written by hunter/src/hunter/radar.py.';
