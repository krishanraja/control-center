-- content_creators: the curated-creator registry behind "favorite creators as
-- content inspiration" (Krish, 2026-09-02: the writers he rates, Andreas Horn
-- and Alex Lieberman first, should feed the content engine's proactive
-- suggestions).
--
-- The concept already lived in code: api/_judgmentLens.ts hardcodes nine
-- curatedVoices, and the header of api/discover-lens-radar.ts records the
-- planned next step, pulling those voices' LinkedIn posts via the validated
-- Apify actors. A hardcoded array cannot carry scrape state, per-creator
-- learning, or a new creator without a deploy, so this table becomes the
-- source of truth and the constant demotes to a bootstrap fallback
-- (loadCuratedVoices in api/_creators.ts reads here first).
--
-- Consumers:
--   api/discover-creator-posts.ts   weekly Apify scrape of each scrapeable
--                                   creator's recent LinkedIn posts, move
--                                   extraction, capped insert into
--                                   content_ideas as source_type 'creator_move'
--   api/discover-lens-radar.ts      Exa voices radar (name-based, slug optional)
--   api/content-creators.ts         thin CRUD, no UI yet
--
-- Rows are never deleted, only active=false (the growth_touchpoints rule).
-- linkedin_slug NULL means "not scrapeable yet": the Exa radar still covers
-- the person by name; the scraper skips them until the slug is filled in.
-- Only slugs verified against the real profile are seeded; guessing a slug
-- scrapes a stranger.

begin;

create table if not exists public.content_creators (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  linkedin_slug   text,
  linkedin_url    text,
  -- What Krish rates about this voice: the transferable move to emulate,
  -- never wording to copy. Fed verbatim into the move-extraction prompt.
  why             text not null,
  lens_id         text not null default 'judgment-economy',
  active          boolean not null default true,
  -- Per-creator scrape state, updated by api/discover-creator-posts.ts even
  -- on empty runs so a silent lane is visible.
  last_scraped_at timestamptz,
  last_post_url   text,
  last_post_at    timestamptz,
  posts_seen      integer not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.content_creators enable row level security;

drop policy if exists "anon read content_creators" on public.content_creators;
create policy "anon read content_creators" on public.content_creators
  for select to anon using (true);

drop policy if exists "service write content_creators" on public.content_creators;
create policy "service write content_creators" on public.content_creators
  for all to service_role using (true) with check (true);

-- Seed: the nine curatedVoices from api/_judgmentLens.ts plus Andreas Horn.
-- ON CONFLICT DO NOTHING, not DO UPDATE: `why` is Krish's editable taste
-- field, and a re-applied migration must never clobber his edits.
insert into public.content_creators (slug, name, linkedin_slug, linkedin_url, why) values
  ('dan-pratl', 'Dan Pratl', 'danpratl', 'https://www.linkedin.com/in/danpratl',
   'ex-SEC attorney building verification and credibility infrastructure for the AI economy; monetize judgment.'),
  ('alanna-laforet', 'Alanna Laforet', 'alanna-laforet-7672281', 'https://www.linkedin.com/in/alanna-laforet-7672281',
   'serial reinventor (adtech to web3 to AI regulation); portfolio-of-you, thesis-led.'),
  ('justin-kramm', 'Justin Kramm', 'justinkramm', 'https://www.linkedin.com/in/justinkramm',
   'creative director turned movement-builder; taste, attention and community as the moat.'),
  ('melissa-rosenthal', 'Melissa Rosenthal', null, null,
   'the clone test: the software moat was never the features.'),
  ('sharon-goldman', 'Sharon Goldman', null, null,
   'Ground Level AI: what happens when AI meets the real world.'),
  ('cole-medin', 'Cole Medin', null, null,
   'multi-agent orchestration; the model that writes the code is not the one grading it.'),
  ('aaron-levie', 'Aaron Levie', null, null,
   'token cost and model routing as the applied-AI differentiator.'),
  ('alex-lieberman', 'Alex Lieberman', 'alex-lieberman', 'https://www.linkedin.com/in/alex-lieberman',
   'most of AI transformation has nothing to do with AI; founder-as-media, audience-first business building. Emulate: story-led essays that build the audience before the product.'),
  ('joe-reid', 'Joe Reid', null, null,
   'when coordination gets cheap, the moat migrates to owning the work context.'),
  ('andreas-horn', 'Andreas Horn', 'andreashorn1', 'https://www.linkedin.com/in/andreashorn1',
   'AI-practitioner essays that name a concept (verification debt), define it in one economic sentence, back it with cohort or social proof, end with a newsletter CTA. Emulate: named concept plus one-line economics plus proof plus CTA.')
on conflict (slug) do nothing;

-- New source_type for scraped-creator move suggestions. Re-declare the full
-- current list (canon before this migration:
-- 20260813110000_content_ideas_requested_research.sql) plus 'creator_move'.
alter table public.content_ideas drop constraint if exists content_ideas_source_type_check;
alter table public.content_ideas add constraint content_ideas_source_type_check
  check (source_type = any (array[
    'signal_inbox',
    'cleo_chat',
    'agatha_chat',
    'openclaw_workspace',
    'zara_signal',
    'manual',
    'inspiration_sweep',
    'synthesis_hypothesis',
    'customer_voice',
    'crm_opportunity',
    'synthesis',
    'pool_headline',
    'lane_sourcing',
    'requested_research',
    -- New 2026-09-02: a transferable move extracted from a curated creator's
    -- LinkedIn post, with Krish's differentiated take.
    'creator_move'
  ]));

-- One live parent suggestion per scraped post URL, enforced at the database
-- (mirrors content_ideas_inspiration_url_live_uq), so a re-scrape can never
-- duplicate a suggestion.
create unique index if not exists content_ideas_creator_move_url_live_uq
  on public.content_ideas (source_url)
  where source_type = 'creator_move'
    and buried_at is null
    and source_url is not null
    and parent_idea_id is null;

insert into public.audit_log (event_type, actor, details)
values (
  'content_creators_registry',
  'system',
  jsonb_build_object(
    'action', 'seed',
    'note', 'curatedVoices promoted from api/_judgmentLens.ts to content_creators; the constant stays as bootstrap fallback. Added Andreas Horn (andreashorn1) and verified Alex Lieberman (alex-lieberman). Added creator_move source_type and the live-URL unique index.',
    'scrapeable_at_seed', jsonb_build_array('dan-pratl', 'alanna-laforet', 'justin-kramm', 'alex-lieberman', 'andreas-horn')
  )::text
);

commit;
