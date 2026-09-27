-- One honest read per site per day, written by api/growth/web-insights.ts.
--
-- Why: Krish added Google Analytics tags to fulltime.fm and legibility.io on
-- 2026-09-27 and asked for one read of all four sites, what the OS fixed on its
-- own, and the one thing only he can do on each. That is a verdict (is this
-- property even wired?), findings, fixes and one action with the evidence behind
-- each, not a number per day. growth_metrics keeps the four headline flows per
-- site (api/growth/snapshot.ts) and web_analytics_daily the daily breakdowns;
-- neither changes shape.
--
-- An unmeasured property is never written as zeros: totals and series stay null
-- until health says the read succeeded. A refresh on the same day overwrites
-- that day's row. property has no CHECK on purpose: src/lib/webProperties.ts is
-- the registry, and adding a site must not need a migration.
create table if not exists public.web_property_insights (
  id uuid primary key default gen_random_uuid(),
  property text not null,
  as_of date not null,
  run_at timestamptz not null default now(),
  trigger text not null check (trigger in ('cron', 'refresh', 'run')),
  property_id text,
  id_source text check (id_source is null or id_source in ('env', 'default', 'discovered', 'none')),
  property_tz text,
  health text not null check (health in ('no_access', 'api_disabled', 'wrong_stream', 'tag_missing',
                                         'never_received', 'provisional', 'quiet', 'ok')),
  health_flags text[] not null default '{}',
  health_detail text,
  checks jsonb not null default '{}'::jsonb,       -- data read, admin, probe, lifetime, host filter, quota: the raw proof
  totals jsonb,                                    -- {cur:{...}, prev:{...}}; null = not measured
  series jsonb,                                    -- [{date, sessions|null}] x28; null = not measured
  top jsonb not null default '{}'::jsonb,          -- {sources, pages, ai, channels, hosts}
  crosscheck jsonb not null default '{}'::jsonb,   -- {posthog, plausible}
  insight text not null,
  findings jsonb not null default '[]'::jsonb,
  fixed jsonb not null default '[]'::jsonb,
  action jsonb,
  closed jsonb not null default '[]'::jsonb,
  llm jsonb,                                       -- {writer, model, evidence_hash, candidates, rejected, alternate, attempted_at}
  meta jsonb not null default '{}'::jsonb,         -- report metadata
  unique (property, as_of)
);

create index if not exists web_property_insights_recent_idx
  on public.web_property_insights (property, run_at desc);

alter table public.web_property_insights enable row level security;

-- Written by the service role only; the app reads through /api/growth/web-insights.
revoke all on public.web_property_insights from anon, authenticated;

comment on table public.web_property_insights is
  'One read per GA4 property per day: health verdict, findings, auto fixes and the one Krish action. Service role only.';
