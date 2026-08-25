-- Spend & connections tracker: the OS's money-out ledger and service registry.
--
-- service_registry: one row per service the OS pays for or authenticates to.
--   Registry metadata (name, env var NAME, check endpoints category) is seeded
--   here; sweep state columns (last_status, balance, ...) are written only by
--   /api/health/connections-sweep. env_key_name holds the NAME of the env var
--   or app_secrets key, never a value.
-- spend_invoices: parsed receipt emails (Gmail "Subscriptions" label), one row
--   per message, idempotent on gmail_message_id. amount_usd/amount_aud stay
--   NULL when no FX rate is known -- a missing rate is never treated as 1.0
--   (the revenue_from_stripe rule).
--
-- Access rule: service-role only, mirroring revenue_events / revenue_subscriptions
-- (20260811230000_revenue_from_stripe.sql). This deviates from the
-- CONTRIBUTING.md anon-SELECT default on purpose: the frontend reads the
-- computed summary through GET /api/spend, and the raw tables carry an env-var
-- inventory and money data that do not belong on the anon surface.

BEGIN;

create table if not exists public.service_registry (
  key              text primary key,
  display_name     text not null,
  category         text not null check (category in ('llm','infra','data','outreach','media','finance','other')),
  criticality      text not null default 'standard' check (criticality in ('critical','standard','low')),
  env_key_name     text,
  check_kind       text not null default 'none' check (check_kind in ('balance','ping','none')),
  top_up_url       text,
  dashboard_url    text,
  vendor_match     text[] not null default '{}',
  low_threshold    numeric,
  active           boolean not null default true,
  -- sweep state (written only by the connections sweep)
  last_status      text check (last_status is null or last_status in ('ok','empty','skipped_no_key','auth_failed','exhausted','rate_limited','error','not_checked')),
  last_http_status integer,
  last_error       text,
  last_checked_at  timestamptz,
  balance          numeric,
  balance_unit     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.spend_invoices (
  id               uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  vendor_raw       text not null,
  service_key      text references public.service_registry(key) on delete set null,
  amount           numeric,
  currency         text,
  amount_usd       numeric,
  amount_aud       numeric,
  fx_rate          numeric,
  kind             text not null default 'charge' check (kind in ('charge','refund')),
  paid_at          date,
  period_start     date,
  period_end       date,
  cadence          text not null default 'unknown' check (cadence in ('monthly','annual','one_off','unknown')),
  plan_label       text,
  parse_confidence numeric,
  needs_review     boolean not null default false,
  review_note      text,
  raw_subject      text,
  raw_from         text,
  parsed_by        text,
  created_at       timestamptz not null default now()
);

create index if not exists spend_invoices_paid_idx    on public.spend_invoices (paid_at desc);
create index if not exists spend_invoices_service_idx on public.spend_invoices (service_key, paid_at desc);
create index if not exists spend_invoices_review_idx  on public.spend_invoices (needs_review) where needs_review;

-- Ad-hoc / warehouse rollup. security_invoker so it inherits the tables'
-- service-role-only access; the UI never reads this directly (/api/spend
-- computes the summary live).
create or replace view public.spend_monthly with (security_invoker = true) as
select date_trunc('month', paid_at)::date as month,
       coalesce(service_key, 'unmatched:' || vendor_raw) as service,
       sum(case when kind = 'refund' then -coalesce(amount_usd, 0) else coalesce(amount_usd, 0) end) as total_usd,
       sum(case when kind = 'refund' then -coalesce(amount_aud, 0) else coalesce(amount_aud, 0) end) as total_aud,
       count(*) as invoices,
       bool_or(needs_review) as has_review_items
from public.spend_invoices
where paid_at is not null
group by 1, 2;

alter table public.service_registry enable row level security;
alter table public.spend_invoices   enable row level security;

drop policy if exists service_registry_service_all on public.service_registry;
create policy service_registry_service_all on public.service_registry
  for all to service_role using (true) with check (true);

drop policy if exists spend_invoices_service_all on public.spend_invoices;
create policy spend_invoices_service_all on public.spend_invoices
  for all to service_role using (true) with check (true);

revoke all on public.service_registry from anon, authenticated;
revoke all on public.spend_invoices   from anon, authenticated;
revoke all on public.spend_monthly    from anon, authenticated;
grant  all    on public.service_registry to service_role;
grant  all    on public.spend_invoices   to service_role;
grant  select on public.spend_monthly    to service_role;

-- Seed: metadata only. Keys align with api_usage_state.api_name where a row
-- already exists there (gemini not google-ai, moonshot not kimi, xai not
-- grok) so the sweep's best-effort mirror lands on the same rows the VPS
-- pollers use. On conflict the seed refreshes metadata and never touches
-- sweep state.
insert into public.service_registry
  (key, display_name, category, criticality, env_key_name, check_kind, vendor_match, top_up_url, dashboard_url, low_threshold) values
  -- LLMs
  ('openai',        'OpenAI',               'llm', 'critical', 'OPENAI_API_KEY',        'ping',    '{openai.com}',                          'https://platform.openai.com/settings/organization/billing', 'https://platform.openai.com', null),
  ('anthropic',     'Anthropic',            'llm', 'critical', 'ANTHROPIC_API_KEY',     'ping',    '{anthropic.com,mail.anthropic.com}',    'https://console.anthropic.com/settings/billing', 'https://console.anthropic.com', null),
  ('gemini',        'Google AI',            'llm', 'standard', 'GEMINI_API_KEY',        'ping',    '{}',                                    'https://aistudio.google.com', 'https://aistudio.google.com', null),
  ('perplexity',    'Perplexity',           'llm', 'critical', 'PERPLEXITY_API_KEY',    'ping',    '{perplexity.ai}',                       'https://www.perplexity.ai/settings/api', 'https://www.perplexity.ai/settings/api', null),
  ('deepseek',      'DeepSeek',             'llm', 'standard', 'DEEPSEEK_API_KEY',      'balance', '{deepseek.com}',                        'https://platform.deepseek.com/top_up', 'https://platform.deepseek.com', 2),
  ('moonshot',      'Kimi (Moonshot)',      'llm', 'low',      'MOONSHOT_API_KEY',      'balance', '{moonshot}',                            'https://platform.moonshot.ai', 'https://platform.moonshot.ai', 2),
  ('xai',           'Grok (xAI)',           'llm', 'low',      'XAI_API_KEY',           'ping',    '{x.ai}',                                'https://console.x.ai', 'https://console.x.ai', null),
  -- Infra
  ('vercel',        'Vercel',               'infra', 'critical', 'VERCEL_TOKEN',            'ping', '{vercel.com}',      'https://vercel.com/account/billing', 'https://vercel.com/dashboard', null),
  ('supabase',      'Supabase',             'infra', 'critical', 'SUPABASE_SERVICE_ROLE_KEY','ping','{supabase.com,supabase.io}', 'https://supabase.com/dashboard/org/_/billing', 'https://supabase.com/dashboard', null),
  ('n8n',           'n8n Cloud',            'infra', 'critical', 'N8N_API_KEY',             'ping', '{n8n}',             'https://app.n8n.cloud/manage', 'https://krishraja10101.app.n8n.cloud', null),
  ('github',        'GitHub',               'infra', 'standard', 'GITHUB_TOKEN',            'ping', '{github.com}',      'https://github.com/settings/billing', 'https://github.com', null),
  ('cloudflare',    'Cloudflare',           'infra', 'standard', 'CLOUDFLARE_API_TOKEN',    'ping', '{cloudflare.com}',  'https://dash.cloudflare.com', 'https://dash.cloudflare.com', null),
  ('railway',       'Railway',              'infra', 'low',      null,                      'none', '{railway}',         'https://railway.app/account/billing', 'https://railway.app/dashboard', null),
  ('hetzner',       'Hetzner (OpenClaw VPS)','infra','standard', null,                      'none', '{hetzner.com}',     'https://accounts.hetzner.com', 'https://console.hetzner.cloud', null),
  ('expo',          'Expo / EAS',           'infra', 'low',      'EXPO_TOKEN',              'ping', '{expo.dev}',        'https://expo.dev/settings/billing', 'https://expo.dev', null),
  ('google-workspace','Google Workspace',   'infra', 'critical', null,                      'none', '{payments-noreply@google.com,"Google Workspace"}', 'https://admin.google.com/ac/billing', 'https://admin.google.com', null),
  ('google-play',   'Google Play subs',     'other', 'low',      null,                      'none', '{googleplay,google play}', 'https://play.google.com/store/account/subscriptions', 'https://play.google.com/store/account/subscriptions', null),
  ('telegram',      'Telegram bot',         'infra', 'critical', 'TELEGRAM_APPROVALS_BOT_TOKEN', 'ping', '{}',           null, 'https://web.telegram.org', null),
  ('stripe',        'Stripe',               'finance', 'critical', 'STRIPE_API_KEY',        'ping', '{}',                null, 'https://dashboard.stripe.com', null),
  ('stripe-fractionl','Stripe (Fractionl)',  'finance', 'standard', 'STRIPE_API_KEY_FRACTIONL', 'ping', '{}',             null, 'https://dashboard.stripe.com', null),
  -- Data / enrichment / search
  ('apify',         'Apify',                'data', 'critical', 'APIFY_TOKEN',           'balance', '{apify.com}',       'https://console.apify.com/billing', 'https://console.apify.com', 5),
  ('apollo',        'Apollo.io',            'data', 'critical', 'APOLLO_API_KEY',        'ping',    '{apollo.io}',       'https://app.apollo.io/#/settings/plans/upgrade', 'https://app.apollo.io', null),
  ('peopledatalabs','People Data Labs',     'data', 'standard', 'PEOPLE_DATA_LABS_API_KEY','ping',  '{peopledatalabs.com}', 'https://dashboard.peopledatalabs.com', 'https://dashboard.peopledatalabs.com', null),
  ('exa',           'Exa',                  'data', 'standard', 'EXA_API_KEY',           'ping',    '{exa.ai}',          'https://dashboard.exa.ai', 'https://dashboard.exa.ai', null),
  ('brave',         'Brave Search',         'data', 'standard', 'BRAVE_API_KEY',         'ping',    '{brave.com}',       'https://api-dashboard.search.brave.com', 'https://api-dashboard.search.brave.com', null),
  ('neverbounce',   'NeverBounce',          'data', 'standard', 'NEVERBOUNCE_API_KEY',   'balance', '{neverbounce.com}', 'https://app.neverbounce.com/billing', 'https://app.neverbounce.com', 500),
  ('phantombuster', 'PhantomBuster',        'data', 'low',      'PHANTOMBUSTER_API_KEY', 'balance', '{phantombuster.com}', 'https://phantombuster.com/upgrade', 'https://phantombuster.com', null),
  ('browserless',   'Browserless',          'data', 'low',      'BROWSERLESS_API_KEY',   'ping',    '{browserless.io}',  'https://account.browserless.io', 'https://account.browserless.io', null),
  ('builtwith',     'BuiltWith',            'data', 'low',      'BUILTWITH_API_KEY',     'balance', '{builtwith.com}',   'https://builtwith.com/plans', 'https://builtwith.com', null),
  ('podchaser',     'Podchaser',            'data', 'low',      null,                    'none',    '{podchaser.com}',   'https://www.podchaser.com/profile/settings/api', 'https://www.podchaser.com', null),
  ('skyvern',       'Skyvern',              'data', 'low',      null,                    'none',    '{skyvern}',         'https://app.skyvern.com', 'https://app.skyvern.com', null),
  ('dataforseo',    'DataForSEO',           'data', 'low',      null,                    'none',    '{dataforseo}',      'https://app.dataforseo.com', 'https://app.dataforseo.com', null),
  ('newsapi',       'NewsAPI',              'data', 'low',      'NEWSAPI_KEY',           'ping',    '{newsapi.org}',     'https://newsapi.org/account', 'https://newsapi.org/account', null),
  ('marketaux',     'Marketaux',            'data', 'low',      'MARKETAUX_API_KEY',     'ping',    '{marketaux.com}',   'https://www.marketaux.com/account', 'https://www.marketaux.com/account', null),
  ('fmp',           'Financial Modeling Prep','finance','low',  'FMP_API_KEY',           'ping',    '{"Financial Modeling Prep",financialmodelingprep}', 'https://site.financialmodelingprep.com/developer/docs/pricing', 'https://site.financialmodelingprep.com', null),
  ('fred',          'FRED',                 'finance', 'low',   'FRED_API_KEY',          'ping',    '{}',                null, 'https://fred.stlouisfed.org', null),
  ('coingecko',     'CoinGecko',            'finance', 'low',   'COINGECKO_API_KEY',     'ping',    '{coingecko.com}',   'https://www.coingecko.com/en/api/pricing', 'https://www.coingecko.com/en/developers/dashboard', null),
  ('football-data', 'football-data.org',    'data', 'low',      'FOOTBALL_DATA_API_KEY', 'ping',    '{football-data.org}', null, 'https://www.football-data.org/client/home', null),
  ('api-football',  'API-Football',         'data', 'low',      'API_FOOTBALL_API_KEY',  'balance', '{api-football,apisports}', 'https://dashboard.api-football.com', 'https://dashboard.api-football.com', 10),
  ('tranco',        'Tranco',               'data', 'low',      null,                    'none',    '{tranco}',          null, 'https://tranco-list.eu', null),
  ('brandfetch',    'Brandfetch',           'data', 'low',      null,                    'none',    '{brandfetch.com}',  'https://www.brandfetch.com/pricing', 'https://www.brandfetch.com', null),
  ('artificialanalysis','Artificial Analysis','data','low',     'ARTIFICIAL_ANALYSIS_API_KEY', 'ping', '{artificialanalysis.ai}', null, 'https://artificialanalysis.ai', null),
  ('mcpmarket',     'MCPMarket',            'other', 'low',     null,                    'none',    '{mcpmarket}',       null, 'https://mcpmarket.com', null),
  -- Outreach / media
  ('instantly',     'Instantly.ai',         'outreach', 'standard', 'INSTANTLY_API_KEY', 'ping',    '{instantly.ai}',    'https://app.instantly.ai/app/settings/billing', 'https://app.instantly.ai', null),
  ('resend',        'Resend',               'outreach', 'standard', 'RESEND_API_KEY',    'ping',    '{resend.com}',      'https://resend.com/settings/billing', 'https://resend.com', null),
  ('fireflies',     'Fireflies.ai',         'media', 'low',      'FIREFLIES_API_KEY',    'ping',    '{fireflies.ai}',    'https://app.fireflies.ai/settings', 'https://app.fireflies.ai', null),
  ('elevenlabs',    'ElevenLabs',           'media', 'low',      'ELEVENLABS_API_KEY',   'balance', '{elevenlabs.io}',   'https://elevenlabs.io/app/subscription', 'https://elevenlabs.io/app', 5000),
  ('relume',        'Relume',               'other', 'low',      null,                   'none',    '{relume.io,relume}', null, 'https://www.relume.io', null),
  -- Surfaced by the n8n credential inventory (2026-08-25): tracked for
  -- invoice matching and the connections list even without an API check.
  ('serper',        'Serper',               'data', 'low',       'SERPER_API_KEY',       'none',    '{serper.dev}',      'https://serper.dev/billing', 'https://serper.dev/dashboard', null),
  ('posthog',       'PostHog',              'infra', 'low',      null,                   'none',    '{posthog.com}',     'https://us.posthog.com/organization/billing', 'https://us.posthog.com', null),
  ('producthunt',   'Product Hunt',         'other', 'low',      null,                   'none',    '{producthunt.com}', null, 'https://www.producthunt.com', null),
  ('tally',         'Tally',                'other', 'low',      null,                   'none',    '{tally.so}',        'https://tally.so/settings/billing', 'https://tally.so', null),
  ('getwaitlist',   'Getwaitlist',          'other', 'low',      null,                   'none',    '{getwaitlist.com}', null, 'https://getwaitlist.com', null),
  ('onesignal',     'OneSignal',            'outreach', 'low',   null,                   'none',    '{onesignal.com}',   'https://dashboard.onesignal.com', 'https://dashboard.onesignal.com', null),
  ('zernio',        'Zernio',               'other', 'low',      null,                   'none',    '{zernio}',          null, null, null),
  ('linkedin',      'LinkedIn',             'outreach', 'low',   null,                   'none',    '{linkedin.com}',    'https://www.linkedin.com/premium', 'https://www.linkedin.com', null)
on conflict (key) do update set
  display_name  = excluded.display_name,
  category      = excluded.category,
  criticality   = excluded.criticality,
  env_key_name  = excluded.env_key_name,
  check_kind    = excluded.check_kind,
  vendor_match  = excluded.vendor_match,
  top_up_url    = excluded.top_up_url,
  dashboard_url = excluded.dashboard_url,
  low_threshold = excluded.low_threshold,
  updated_at    = now();

COMMIT;

NOTIFY pgrst, 'reload schema';
