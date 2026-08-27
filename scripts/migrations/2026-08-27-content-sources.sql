-- Step 1: the source registry.
--
-- content_ideas.source_type is a CHECK constraint, so every new source class
-- was its own migration. That is why the corpus is 220 items of newsletters and
-- headline pools with zero filings, zero pricing pages, zero ad-market data and
-- zero job postings: adding a class was friction, so no class was added.
--
-- tier and class feed the score directly. arc_maturity weights a primary beat
-- double a secondary one, so an arc built only from trade press can reach the
-- middle of the range and not the top of it.
--
-- access and active are deliberately separate and deliberately honest:
--   access=paid|blocked  a decision waiting, not a working feed
--   active=false         registered but not yet ingesting
-- A source that is registered, reachable and not yet wired is none of the same
-- things, and collapsing them is how a corpus ends up looking bigger than it is.
--
-- Reachability was probed from the session environment on 2026-08-26 rather
-- than assumed. Results are recorded per row: Digiday, AdExchanger, SEC EDGAR
-- and The Rebooting serve; Press Gazette returns 403 on every feed path tried
-- and is recorded as blocked so nobody wires it and wonders why it is empty.
-- The Rebooting's own domain 404s and its Substack feed serves, so the URL
-- recorded is the one that works.

begin;

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tier text not null check (tier in ('primary', 'secondary')),
  class text not null check (class in ('filing','pricing','ad_market','rights','trade','operator','jobs','traffic','data')),
  vertical text,
  url text,
  ingest text not null default 'manual' check (ingest in ('rss','api','scrape','manual','none')),
  access text not null default 'open' check (access in ('open','account','paid','blocked')),
  active boolean not null default false,
  notes text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_sources_tier_idx on public.content_sources (tier, class) where active;
alter table public.content_sources enable row level security;
drop policy if exists "content_sources anon read" on public.content_sources;
create policy "content_sources anon read" on public.content_sources for select to anon using (true);
drop policy if exists "content_sources service all" on public.content_sources;
create policy "content_sources service all" on public.content_sources for all to service_role using (true) with check (true);
drop trigger if exists trg_content_sources_touch on public.content_sources;
create trigger trg_content_sources_touch before update on public.content_sources
  for each row execute function public.touch_updated_at();

-- Seed and probe results are in the applied migration; see audit_log events
-- content_source_registry and content_source_probe for what was written.

commit;
