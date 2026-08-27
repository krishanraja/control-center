-- Seed the source registry.
--
-- api/shifts/detect.ts:236 reads content_sources to put a tier on every beat:
--
--   const { data: known } = await supabase.from('content_sources')
--     .select('name, tier').in('name', origins)
--
-- and arc_maturity weights a primary beat double a secondary one, so the tier
-- is a direct input to whether an arc can top out.
--
-- The table was not empty. It held eleven rows, and they are the reason the
-- lookup never matched: they name INGEST CHANNELS ("Headline pool",
-- "Inspiration sweep (newsletters)", "Lane sourcing", "Toolkits") while
-- detect.ts matches on realSource(), which deliberately returns the PUBLISHER
-- and not the channel. Its own comment says so:
--
--   "The gate's source-diversity floor needs the actual publication, not the
--    ingest channel: an inspiration_sweep row citing thedeepview.com must
--    count as thedeepview.com or every newsletter item collapses into one
--    source."
--
-- So the seed and the reader disagreed about what a source IS, and the
-- disagreement is silent: `.in('name', origins)` returning nothing looks
-- exactly like a corpus of unregistered publishers. Measured before this
-- migration: 0 of 180 corpus items matched a registry row, and all 365 rows in
-- shift_beats carry source_tier null. After it: 138 of 180 match.
--
-- The five publisher rows that were already here (digiday, adexchanger,
-- press-gazette, sec-edgar, the-rebooting) are preserved and updated in place
-- by the ON CONFLICT below; the six channel rows are left alone, since they
-- describe something real even though detect.ts will never match them.
--
-- MATCHING IS EXACT, on `name`, against realSource(r) — which returns
-- meta.pool.source first (a hostname, from the CTRL headline pool), then
-- meta.source_label (a publication name, from the newsletter sweep). So the
-- registry has to carry both spellings, and the names here are taken from what
-- the corpus actually contains rather than from what the sources are called:
--
--   select meta->'pool'->>'source', count(*) from content_ideas group by 1
--   select meta->>'source_label', count(*) from content_ideas group by 1
--
-- One honest limit, recorded rather than hidden: the newsletter sweep writes
-- compound labels for items that cite a second outlet ("The Deep View /
-- Reuters", "Evolving AI Insights (evolvingai@mail.beehiiv.com)"). Those do
-- not match any single row and stay untiered, which is the behaviour they have
-- today. Fixing that means splitting the label at ingest, which is a change to
-- the sweep and not to this table.
--
-- tier: primary  = the party to the event (a filing, a vendor's own post, a
--                  regulator, a first-hand report)
--       secondary = someone reporting on it
-- class matches the CHECK on the table: filing, pricing, ad_market, rights,
-- trade, operator, jobs, traffic, data.

begin;

-- Idempotent DDL so this migration stands alone if applied to a fresh project.
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

insert into public.content_sources (slug, name, tier, class, url, ingest, access, active, notes) values
  -- ── Vendor primary sources. The party to the event, so a beat from one of
  -- these is first-hand and weights double in arc_maturity.
  ('openai',        'openai.com',          'primary',   'operator', 'https://openai.com/news/',        'none', 'open', true,  'Vendor announcements. Reaches the corpus through the CTRL pool.'),
  ('anthropic',     'anthropic.com',       'primary',   'operator', 'https://www.anthropic.com/news',  'none', 'open', true,  'Vendor announcements.'),
  ('nvidia-blog',   'blogs.nvidia.com',    'primary',   'operator', 'https://blogs.nvidia.com/',       'none', 'open', true,  'Vendor announcements.'),
  ('deepmind',      'deepmind.google',     'primary',   'operator', 'https://deepmind.google/discover/blog/', 'none', 'open', true, 'Vendor announcements.'),
  ('microsoft',     'microsoft.com',       'primary',   'operator', 'https://blogs.microsoft.com/',    'none', 'open', true,  'Vendor announcements.'),
  ('huggingface',   'huggingface.co',      'primary',   'operator', 'https://huggingface.co/blog',     'none', 'open', true,  'Model and dataset releases.'),
  ('sec-edgar',     'sec.gov',             'primary',   'filing',   'https://www.sec.gov/cgi-bin/browse-edgar', 'none', 'open', false, 'Probed 2026-08-26 and serves. Registered, not yet wired: active=false means no ingest, not unreachable.'),

  -- ── Wire and financial press. Secondary by definition (reporting on the
  -- event), but the highest-confidence secondary tier.
  ('reuters',       'reuters.com',         'secondary', 'trade',    'https://www.reuters.com/technology/', 'none', 'open',    true, 'Wire. Arrives via the CTRL pool.'),
  ('bloomberg',     'bloomberg.com',       'secondary', 'trade',    'https://www.bloomberg.com/technology', 'none', 'paid',   true, 'Paywalled: headline and pool metadata only.'),
  ('ft',            'ft.com',              'secondary', 'trade',    'https://www.ft.com/technology',   'none', 'paid',   true, 'Paywalled.'),
  ('wsj',           'wsj.com',             'secondary', 'trade',    'https://www.wsj.com/tech',        'none', 'paid',   true, 'Paywalled.'),
  ('cnbc',          'cnbc.com',            'secondary', 'trade',    'https://www.cnbc.com/technology/', 'none', 'open',  true, null),
  ('economic-times','economictimes.indiatimes.com', 'secondary', 'trade', null,                        'none', 'open',   true, 'India desk. Reaches the corpus via the pool.'),
  ('qz',            'qz.com',              'secondary', 'trade',    'https://qz.com/',                 'none', 'open',   true, null),

  -- ── Tech trade press.
  ('techcrunch',    'techcrunch.com',      'secondary', 'trade',    'https://techcrunch.com/category/artificial-intelligence/', 'none', 'open', true, null),
  ('the-verge',     'theverge.com',        'secondary', 'trade',    'https://www.theverge.com/ai-artificial-intelligence',      'none', 'open', true, null),
  ('wired',         'wired.com',           'secondary', 'trade',    'https://www.wired.com/tag/artificial-intelligence/',       'none', 'open', true, null),
  ('ars-technica',  'arstechnica.com',     'secondary', 'trade',    'https://arstechnica.com/ai/',     'none', 'open', true, null),
  ('mit-tech-review','technologyreview.com','secondary','trade',    'https://www.technologyreview.com/topic/artificial-intelligence/', 'none', 'paid', true, 'Metered paywall.'),
  ('venturebeat',   'venturebeat.com',     'secondary', 'trade',    'https://venturebeat.com/category/ai/', 'none', 'open', true, null),
  ('the-register',  'theregister.com',     'secondary', 'trade',    'https://www.theregister.com/software/ai_ml/', 'none', 'open', true, null),
  ('zdnet',         'zdnet.com',           'secondary', 'trade',    'https://www.zdnet.com/topic/artificial-intelligence/', 'none', 'open', true, null),
  ('the-decoder',   'the-decoder.com',     'secondary', 'trade',    'https://the-decoder.com/',        'none', 'open', true, 'Highest-volume single pool source in the corpus.'),
  ('biztoc',        'biztoc.com',          'secondary', 'trade',    'https://biztoc.com/',             'none', 'open', true, 'Aggregator, not an outlet. Low tier by nature: it republishes.'),
  ('simon-willison','simonwillison.net',   'secondary', 'operator', 'https://simonwillison.net/',      'none', 'open', true, 'Practitioner blog. Operator class: he ships and writes about shipping.'),

  -- ── Newsletters, matched on source_label from the inspiration sweep. These
  -- are the labels that actually appear in content_ideas.meta.source_label.
  ('the-rundown-ai',       'The Rundown AI',        'secondary', 'trade',    'https://www.therundown.ai/', 'manual', 'open', true, 'Gmail inspiration sweep. Highest-volume newsletter label in the corpus.'),
  ('the-deep-view',        'The Deep View',         'secondary', 'trade',    'https://www.thedeepview.co/', 'manual', 'open', true, 'Gmail inspiration sweep.'),
  ('evolving-ai-insights', 'Evolving AI Insights',  'secondary', 'trade',    null,                        'manual', 'open', true, 'Gmail inspiration sweep.'),
  ('opinion-ai',           'Opinion AI',            'secondary', 'trade',    null,                        'manual', 'open', true, 'Gmail inspiration sweep.'),
  ('last-week-in-ai',      'Last Week in AI',       'secondary', 'trade',    'https://lastweekin.ai/',    'manual', 'open', true, 'Gmail inspiration sweep.'),
  ('a16z',                 'a16z',                  'primary',   'operator', 'https://a16z.com/',         'manual', 'open', true, 'Investor primary: they are a party to the funding events they describe.'),

  -- ── Registered, probed 2026-08-26, not yet ingesting. active=false is
  -- "registered but not wired", which is a different fact from unreachable.
  ('digiday',       'digiday.com',         'secondary', 'ad_market', 'https://digiday.com/',           'none', 'open',    false, 'Probed 2026-08-26: serves. Ad-market coverage, the class the corpus has none of.'),
  ('adexchanger',   'adexchanger.com',     'secondary', 'ad_market', 'https://www.adexchanger.com/',   'none', 'open',    false, 'Probed 2026-08-26: serves.'),
  ('the-rebooting', 'therebooting.com',    'secondary', 'operator',  'https://therebooting.substack.com/feed', 'none', 'open', false, 'Own domain 404s; the Substack feed serves. URL recorded is the one that works.'),
  ('press-gazette', 'pressgazette.co.uk',  'secondary', 'trade',     'https://pressgazette.co.uk/',    'none', 'blocked', false, 'Probed 2026-08-26: 403 on every feed path tried. access=blocked so nobody wires it and wonders why it is empty.')
on conflict (slug) do update set
  name    = excluded.name,
  tier    = excluded.tier,
  class   = excluded.class,
  url     = excluded.url,
  ingest  = excluded.ingest,
  access  = excluded.access,
  active  = excluded.active,
  notes   = excluded.notes;

insert into public.audit_log (event_type, actor, details)
values (
  'content_source_registry',
  'system',
  jsonb_build_object(
    'action', 'seed',
    'note', 'Registry seeded with publisher names. The prior eleven rows named ingest channels, which realSource() never returns, so 0 of 180 corpus items matched and all 365 shift_beats carried source_tier null. After this seed 138 of 180 match.',
    'matching', 'exact on name, against realSource(): meta.pool.source (hostname) then meta.source_label (publication)',
    'known_gap', 'compound source_labels such as "The Deep View / Reuters" match no row and stay untiered'
  )::text
);

commit;
