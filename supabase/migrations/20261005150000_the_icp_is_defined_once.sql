-- The ICP is defined once, in Control Center, and the agents read it.
--
-- Krish, 2026-10-05: "Can you add in Control Center somewhere I can define ICP
-- for each and it gets saved and acted on by the system durably?"
--
-- WHY A TABLE AND NOT ANOTHER COLUMN. Six places already hold something called
-- an ICP and none of them hold the thing an agent needs:
--   venture_registry.icp_description     one paragraph of prose
--   venture_registry.voice_profile->>icp one line, inside a jsonb blob
--   lane_directions.icp                  one line, versioned per acquisition lane
--   growth_aeo_subjects.icp_line         one line, for AI answer questions
--   growth_touchpoints.icp_trigger       one line per channel on the places map
--   leads.icp_score / icp_scores         scores, not a definition
-- Every one of them is prose. Buyer TITLES, the one field a prospecting run
-- actually sends to Apollo, have never lived in Postgres at all. They were
-- hardcoded in four disagreeing places: docs/icp.json, scripts/apollo/burn.ts,
-- a Code node inside Maya's revenue engine, and a Code node inside Zara's
-- signal sweep. This table is where they live now, and the prose columns above
-- stay as prose.
--
-- The grain is one row per venture, keyed on venture_registry.slug, which is
-- the key src/lib/portfolio.ts already carries as `venture` for every product
-- on the ladder. No second ranking and no second slug space.
--
-- THE POINT OF IT. Maya's Revenue Engine prospected with a hardcoded map of
-- three products and fell back to Mindmake's buyer titles for anything else,
-- so an unconfigured product was prospected against the WRONG buyer and the run
-- still reported success. A row here is what unblocks that lane, and the
-- absence of a row is what must stop it. `defined` is generated, not asserted,
-- so no agent can be told an ICP exists when it does not.

create table if not exists public.product_icp (
  venture text primary key
    references public.venture_registry(slug) on update cascade,

  -- The fields a prospecting run sends. Empty means "do not prospect", never
  -- "use somebody else's".
  buyer_titles text[] not null default '{}'::text[],
  seniorities  text[] not null default '{}'::text[],
  geos         text[] not null default '{}'::text[],

  -- The fields a writing run reads, in plain English.
  who            text check (char_length(who) <= 600),
  who_not        text check (char_length(who_not) <= 600),
  company_shape  text check (char_length(company_shape) <= 400),
  buying_trigger text check (char_length(buying_trigger) <= 400),
  notes          text check (char_length(notes) <= 2000),

  -- An ICP counts as defined when it can answer both questions an agent asks:
  -- who to look for (titles) and who they are (one line). Generated, so a row
  -- cannot claim to be defined by having the flag set.
  defined boolean generated always as (
    coalesce(array_length(buyer_titles, 1), 0) > 0
    and who is not null
    and char_length(btrim(who)) > 0
  ) stored,

  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.product_icp is
  'One ICP per venture. The only home for buyer titles. Written from Control Center (Growth, Buyers view) through api/icp.ts; read by Maya''s Revenue Engine, the Sunday growth review, the acquisition direction spine and tab grounding. An absent or undefined row blocks prospecting for that venture; nothing may fall back to another venture''s buyer.';

comment on column public.product_icp.defined is
  'Generated. True only when buyer_titles is non-empty AND who is set. Agents gate on this column, never on a hand-set flag.';

create index if not exists product_icp_defined_idx on public.product_icp (defined);

-- Service role only. Buyer titles are internal commercial material and the
-- anon key reaches the browser, so unlike venture_registry this table is not
-- anon-readable: Control Center reads and writes it over api/icp.ts, and the
-- agents read it with the service key.
alter table public.product_icp enable row level security;

drop policy if exists product_icp_service_all on public.product_icp;
create policy product_icp_service_all on public.product_icp
  for all to service_role using (true) with check (true);

create or replace function public.tg_product_icp_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists product_icp_touch on public.product_icp;
create trigger product_icp_touch before update on public.product_icp
  for each row execute function public.tg_product_icp_touch();

-- Seed: Mindmake only.
--
-- Mindmake's buyer is canon (krishanraja/mindmake, 00_NORTH_STAR.md and
-- 01_CANON.md), so it is the one row that can be filled without inventing
-- anything. Control Center is public, so this seed carries only what that repo
-- permits to leave it: no archetype name, no rate card, no sales wedge, no
-- method name. Krish can add those in the app, where they stay internal.
--
-- Every other venture is left ABSENT on purpose. Heartside, Full Time,
-- Legibility, CTRL and Pulse have no ICP, their prospecting stays blocked, and
-- the app says so by name. Inventing his buyers would be worse than an empty
-- state, and a guessed row would read as defined to every agent downstream.
insert into public.product_icp (venture, buyer_titles, seniorities, geos, who, who_not, company_shape, buying_trigger, updated_by)
values (
  'mindmake',
  array['Founder','Co-Founder','Chief Executive Officer','Managing Director','Managing Partner','Principal','Chief Commercial Officer','Chief Strategy Officer','Chief Operating Officer','General Manager'],
  array['owner','founder','c_suite','partner','vp'],
  array['United States','United Kingdom','Australia'],
  'A founder, principal or senior commercial leader who can move a decision and the result behind it. They own the outcome, not a recommendation about it.',
  'Anyone who has to take the idea to somebody else before anything changes. A researcher, an analyst, or a team shopping for a tool rather than for a decision.',
  'Owner-led or partner-led businesses where one person carries the commercial number.',
  'A decision they already own has stalled, and the cost of it staying stalled is now visible to them.',
  'seed:canon'
)
on conflict (venture) do nothing;
