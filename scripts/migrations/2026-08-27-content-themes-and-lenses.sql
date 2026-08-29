-- Step 2 of the rewrite: replace the vocabulary.
--
-- Two different jobs, deliberately two different structures. The final brief
-- (27 Aug) puts it plainly: "Folders are the memory, lenses are the
-- classification."
--
--   content_themes   eleven long-running questions. Rows, because Krish edits
--                    them, seeds them, and they accumulate a view over months.
--   shifts.lens      six values. A CHECK, because it is a closed classification
--                    and the brief forbids a catch-all bucket.
--
-- ---------------------------------------------------------------------------
-- Why the nine old categories are NOT deleted
--
-- The brief says "Delete the current areas: security, proof, economics,
-- governance, org, model, orchestration, tools, product." Taken literally that
-- means either dropping the column or force-mapping 54 live rows onto six
-- values that do not cover them. Three of the nine (governance, security,
-- proof) have no honest destination among the six, which is the entire point:
-- the new vocabulary exists to stop producing those stories.
--
-- So `category` stays, frozen, as the historical record of how a row was
-- classified under the old scheme, and `lens` is added beside it for the new
-- one. Nothing is invented and nothing is lost, which is the same rule the
-- archive sweep followed. New arcs must carry a lens; old rows keep their
-- history and simply have no lens.
-- ---------------------------------------------------------------------------

begin;

-- ============ the six lenses ============
alter table public.shifts add column if not exists lens text;

alter table public.shifts drop constraint if exists shifts_lens_check;
alter table public.shifts add constraint shifts_lens_check check (lens is null or lens = any (array[
  'pricing_packaging',      -- price changes, tiering, bundling, metering, free-tier moves
  'distribution_channel',   -- how the product reaches a buyer, platform dependence, referral
  'moat_defensibility',     -- what actually holds: switching costs, data and harness advantage
  'buyer_behaviour',        -- what buyers now ask for, and what they stopped paying for
  'category_positioning',   -- category creation, collapse, renaming, incumbent displacement
  'build_practice'          -- team shape, eval and QA, orchestration with a stated outcome
]::text[]));

comment on column public.shifts.lens is
  'One of six, or null for rows classified before 2026-08-27 under shifts.category. Exactly one per arc: the brief forbids multi-tagging and forbids an "other" bucket. A candidate fitting no lens is discarded, and a discard rate above roughly 60 percent is signal about the corpus rather than permission to widen the ontology.';

comment on column public.shifts.category is
  'FROZEN 2026-08-27. The pre-rewrite classification, kept as history. Three of its nine values (governance, security, proof) have no counterpart among the six lenses by design. Do not write this column on new rows; write shifts.lens.';

-- ============ the eleven theme folders ============
--
-- These are the memory. An arc files under a folder; the folder accumulates a
-- view over months. Krish seeds them and can add more, which is why this is a
-- table rather than an enum.
create table if not exists public.content_themes (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  question      text not null,
  -- 'built' | 'paid' to match shifts.lane, which already carries this split.
  -- Display names are "Built with AI" and "The Money of AI"; the keys stay as
  -- they are so the existing lane data and the content-corpus skill agree.
  channel       text not null check (channel in ('built', 'paid')),
  default_lens  text,
  -- seeded by Krish, or discovered by the engine. The distinction matters for
  -- the anti-echo rule: a seeded folder is a stated interest, and stated
  -- interests must never boost a candidate's rank.
  origin        text not null default 'seeded' check (origin in ('seeded', 'discovered')),
  state         text not null default 'open' check (state in ('open', 'settled', 'dormant')),
  -- What we currently believe. Revisable, and revisions are kept.
  standing_view text,
  view_history  jsonb not null default '[]'::jsonb,
  -- Evidence AGAINST the standing view, kept deliberately so a folder cannot
  -- quietly become a place that only collects agreement.
  disconfirming jsonb not null default '[]'::jsonb,
  -- Provenance: which ranked-slate items seeded this folder.
  seed_items    text[] not null default '{}',
  opened_at     timestamptz not null default now(),
  last_movement_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists content_themes_open_idx on public.content_themes (state, channel);

alter table public.content_themes enable row level security;
drop policy if exists "content_themes anon read" on public.content_themes;
create policy "content_themes anon read" on public.content_themes for select to anon using (true);
drop policy if exists "content_themes service all" on public.content_themes;
create policy "content_themes service all" on public.content_themes for all to service_role using (true) with check (true);

drop trigger if exists trg_content_themes_touch on public.content_themes;
create trigger trg_content_themes_touch before update on public.content_themes
  for each row execute function public.touch_updated_at();

-- An arc belongs to at most one folder. Null means it matched none, which is
-- not a failure state: the anti-echo rule reserves two of the seven visible
-- slots for exactly these.
alter table public.shifts add column if not exists theme_id uuid
  references public.content_themes(id) on delete set null;
create index if not exists shifts_theme_idx on public.shifts (theme_id) where theme_id is not null;

comment on column public.shifts.theme_id is
  'The folder this arc files under, or null when it matches none. Null is a first-class state: two of the seven surfaced slots are reserved for unthemed arcs, so a folder match widens what Krish sees and never narrows it.';

-- ============ seed: the eleven, in Krish''s own words where he supplied them ============
insert into public.content_themes (slug, question, channel, default_lens, standing_view, seed_items)
values
  ('seats-dying',
   'Are seats dying, and what replaces them as the unit of value?',
   'paid', 'pricing_packaging',
   'Krish: this "basically is the whole of my Money channel".',
   '{M10,M11,M13,M14}'),

  ('moat-vs-pricing',
   'Where is the moat actually moving to, and why has pricing not followed?',
   'paid', 'moat_defensibility',
   'Krish: "SaaS is not dead, the moat is still the internal build and distribution".',
   '{M23,B08}'),

  ('what-replaces-the-open-web',
   'Not is the open web dying, but what replaces it?',
   'paid', 'distribution_channel',
   'Krish: "not just a linear ''the open web is dying'' but more of a creative look at what replaces it".',
   '{M06,M08,M22}'),

  ('who-gets-paid-when-machines-read',
   'Who actually gets paid when a machine reads the work, and what happens to everyone else?',
   'paid', 'pricing_packaging',
   'Open question from Krish: "what is the real world implication to the media industry if that happens?"',
   '{M01,M02,M03}'),

  ('how-media-makes-money-now',
   'How is AI changing how media businesses make money, including the entrants that are built differently?',
   'paid', 'category_positioning',
   'Krish: "The whole media channel is ''the impact of AI on...''". Covers new entrants, not only incumbents.',
   '{M15,M22}'),

  ('attention-by-susceptibility',
   'Where is attention monetised by susceptibility rather than by value?',
   'paid', 'buyer_behaviour',
   'Krish supplied a full vice-economy corpus and wants equivalent-scale theses for creator media and retail media. That is a research commission, not a monitoring rule.',
   '{M16,M17,M19}'),

  ('selling-a-product-that-rebuilds-itself',
   'What happens to selling when the product can rebuild itself?',
   'built', 'buyer_behaviour',
   'Krish: "relates to everything I do and my customers".',
   '{B01,B14,B15}'),

  ('why-ai-output-homogenises',
   'Why does AI output homogenise, and what stops it?',
   'built', 'build_practice',
   'Krish on "leaders that all have a homogenous voice". Ties to codifying judgment and standards.',
   '{B02,B12}'),

  ('learning-from-you-not-the-average',
   'What does it take to make AI learn from you specifically rather than on average?',
   'built', 'build_practice',
   'Corrected framing, per final brief section 6. NOT "most deployed AI has no feedback path", which was wrong as written. Krish: "most enterprises are racing towards back end mining of context for their own purposes. The real story is that there is evidence that AI encourages people to just ask for something and never really give it feedback, or ask it to self reflect and then store that context in isolation, so the AI tool''s learning is aggregate and average, as opposed to pointed at actual outcomes."',
   '{B05,B06,B09}'),

  ('when-trying-costs-nothing',
   'What changes when trying an idea costs nothing?',
   'built', 'build_practice',
   'Krish: "velocity of movement and being less precious about an idea or its current state matters".',
   '{B03,B10,B16}'),

  -- Reframed on Krish''s instruction, 27 Aug. The brief proposed "Who owns the
  -- eval, as an organisational decision?" and offered to fold it into the folder
  -- above. He kept it separate and widened it: "the eval" is too narrow a hook to
  -- run for a year, and the durable question underneath is which judgment a
  -- leader keeps versus hands over. That also gives it a clean edge against
  -- folder 8, which asks why homogenisation happens rather than who decides.
  ('judgment-kept-or-codified',
   'Which judgment calls does a leader keep, and which get codified?',
   'built', 'build_practice',
   'Krish: "reframed as an org decision for the leader to make as they evolve their business". Widened from "who owns the eval" to cover evals, standards and the homogenisation thread.',
   '{B07,B11}')
on conflict (slug) do nothing;

insert into public.audit_log (event_type, actor, target, details)
values (
  'content_vocabulary_replaced',
  'krish',
  'content_themes,shifts',
  jsonb_build_object(
    'themes_seeded', 11,
    'lenses', 6,
    'category_frozen', true,
    'note', 'folder 11 reframed wider on Krish instruction; category kept as history rather than force-mapped',
    'migration', '2026-08-27-content-themes-and-lenses.sql'
  )::text
);

commit;
