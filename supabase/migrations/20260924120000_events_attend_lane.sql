-- The attend lane, reconciled into git and re-pointed at operators (2026-09-24).
--
-- `events`, `event_hosts`, the view `events_recommendable` and the functions
-- `events_for` / `scrub_dead_events` have been live since August 2026 and had
-- NO file under supabase/migrations: the table existed only in prod, written by
-- three Python scripts on the OpenClaw VPS (scripts/cron/crontab.txt:26-28)
-- that are not in version control. Every column, CHECK, index and function body
-- below the first heading was READ BACK FROM THE DATABASE on 2026-09-24 before
-- this file was written, in the same way 20260909090000_aeo_engine.sql recorded
-- the growth_* tables. Nothing here invents a shape.
--
-- Every statement is idempotent so the file can be re-applied, and so applying
-- it to prod is a no-op for the parts that already exist.
--
-- Why the change, measured on 2026-09-24:
--   * 355 rows, newest created 2026-09-09. The sourcer has been dead 15 days
--     and nothing watched it.
--   * `event_hosts` is EMPTY, while 242 rows claim source='host_watchlist'.
--     A watchlist-driven discovery pass over an empty watchlist finds nothing,
--     which is exactly what happened.
--   * Of 18 recommendable upcoming rows, 7 have any non-zero score, across two
--     distinct values per axis. named_attendees and goal_ids are empty on all 18.
--
-- The scoring change (Krish, 2026-09-24, docs/DECISIONS/024): Draw was
-- "technical-leader density" per docs/MINDMAKE_OS_ARCHITECTURE.md section 3, and
-- that definition is what surfaced PyTorch, LLMday and a model-wrangling
-- hackathon as the top of the attend lane. Draw becomes PEER density (founders
-- and owners running businesses with real revenue). Demand stays BUYER density.
-- Practitioner density flips from a positive to a penalty. Guest supply, which
-- was the justification for the old Draw, survives as a bounded bonus.
--
-- Six changes:
--   1. events, event_hosts, events_recommendable recorded as they stand.
--   2. 'meetup' joins the source CHECK (Luma and Meetup both parse without auth;
--      Eventbrite is deliberately not attempted, see section 3 of the
--      architecture doc: it serves an AWS WAF wall to datacenter IPs).
--   3. The scoring inputs become columns, so a score is reproducible instead of
--      a number with a sentence beside it.
--   4. event_hosts seeded with operator and founder rooms per city.
--   5. system_config.operator_home_city, on the operator_timezone precedent.
--   6. events_for() re-ranked on the new axes, still non-destructive about away
--      cities.

begin;

-- 1. The shape as it stands ---------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  host text,
  host_kind text check (host_kind in ('operator', 'vendor', 'media', 'community', 'unknown')),
  url text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  city text check (city in ('london', 'new_york', 'sydney', 'virtual', 'other')),
  venue text,
  -- An unverified date is worse than no date: such a row can never be
  -- recommended. events_recommendable enforces it; check-events-honesty.mts
  -- keeps the enforcement from being quietly dropped.
  date_verified boolean not null default false,
  date_source_url text,
  -- A temporary claim is a STATE and states revert, so it carries its own expiry
  -- rather than being archived as though it were dead.
  item_kind text not null default 'durable' check (item_kind in ('durable', 'temporary')),
  expires_at timestamptz,
  archived_at timestamptz,
  archive_reason text,
  cost_kind text check (cost_kind in ('free', 'cheap', 'paid', 'unknown')),
  ticket_price_usd numeric,
  can_attend boolean not null default true,
  can_speak boolean not null default false,
  speak_deadline_at timestamptz,
  draw_score integer check (draw_score >= 0 and draw_score <= 100),
  demand_score integer check (demand_score >= 0 and demand_score <= 100),
  score_reason text,
  goal_ids text[],
  named_attendees text[],
  scored_at timestamptz,
  source text not null check (source in ('gmail', 'host_watchlist', 'calendar', 'manual', 'luma', 'confstech')),
  source_ref text,
  decision text check (decision in ('attend', 'apply', 'ask_invite', 'decline', 'ask_someone')),
  decided_at timestamptz,
  outcome text check (outcome in ('worth_it', 'not_worth_it')),
  outcome_note text,
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_ref)
);

create index if not exists events_city_idx on public.events (city) where archived_at is null;
create index if not exists events_live_idx on public.events (starts_at) where archived_at is null;
create index if not exists events_speak_idx on public.events (speak_deadline_at) where archived_at is null and can_speak;

create table if not exists public.event_hosts (
  slug text primary key,
  name text not null,
  host_kind text,
  city text,
  url text,
  luma_url text,
  -- Krish's flag, never the machine's: whether he is already on their list.
  on_their_list boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Meetup joins the sources ------------------------------------------------

alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check
  check (source in ('gmail', 'host_watchlist', 'calendar', 'manual', 'luma', 'meetup', 'confstech'));

-- 3. The scoring inputs become columns ---------------------------------------
--
-- The model judges these five 0-100 and writes nothing else numeric; draw_score
-- and demand_score are computed in TypeScript from them (api/_eventScore.ts),
-- per architecture rule 15.5: numbers are computed, never LLM-emitted. Keeping
-- the inputs means a surprising rank can be explained without a re-run, and a
-- weight change can be replayed over the existing corpus.

alter table public.events add column if not exists peer_density integer;
alter table public.events add column if not exists buyer_density integer;
alter table public.events add column if not exists practitioner_density integer;
alter table public.events add column if not exists vendor_density integer;
alter table public.events add column if not exists seniority integer;
alter table public.events add column if not exists seniority_note text;
-- Bumped when the weights change, so a mixed corpus is visible rather than
-- silently incomparable. 0 means "scored before the inputs were recorded".
alter table public.events add column if not exists score_version integer not null default 0;
-- Which pass produced the score, so a hand override is never overwritten by cron.
alter table public.events add column if not exists scored_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_density_range_check') then
    alter table public.events add constraint events_density_range_check check (
      (peer_density is null or (peer_density between 0 and 100))
      and (buyer_density is null or (buyer_density between 0 and 100))
      and (practitioner_density is null or (practitioner_density between 0 and 100))
      and (vendor_density is null or (vendor_density between 0 and 100))
      and (seniority is null or (seniority between 0 and 100))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_scored_source_check') then
    alter table public.events add constraint events_scored_source_check
      check (scored_source is null or scored_source in ('cron', 'manual', 'vps_legacy'));
  end if;
end $$;

-- The scoring work queue: never-scored first, then oldest, soonest event first.
create index if not exists events_scoring_queue_idx
  on public.events (scored_at nulls first, starts_at)
  where archived_at is null;

-- Rows scored by the retired VPS pass are marked so the new pass re-scores them
-- rather than trusting a number produced under the old Draw definition.
update public.events
set scored_source = 'vps_legacy'
where scored_at is not null and scored_source is null;

create or replace view public.events_recommendable as
  select * from public.events
  where archived_at is null
    and date_verified = true
    and starts_at is not null;

-- 4. The watchlist, seeded ---------------------------------------------------
--
-- Discovery walks these. The list is operator and founder rooms on purpose:
-- peer density is the thing the old pipeline had no way to find, because it was
-- pointed at practitioner meetups. host_kind is set honestly; 'community' means
-- a real mixed room, 'vendor' means the host sells something and the room will
-- be weighted down accordingly rather than excluded.
--
-- on_their_list stays false everywhere: that flag records whether Krish is on
-- an invite list, and only he knows.

insert into public.event_hosts (slug, name, host_kind, city, url, luma_url, notes) values
  -- London
  ('founders-forum-london', 'Founders Forum', 'community', 'london', 'https://ff.co', null,
   'Founder and investor rooms, high peer density, invitation-led.'),
  ('the-fd-centre-london', 'Business owner and MD roundtables', 'community', 'london', null, null,
   'Owner-manager roundtables: P&L holders rather than practitioners.'),
  ('london-founders-luma', 'London founders on Luma', 'community', 'london', null, 'https://lu.ma/london', null),
  ('sifted-london', 'Sifted events', 'media', 'london', 'https://sifted.eu/events', null,
   'Media host, founder and investor audience.'),
  ('techcrunch-london', 'TechCrunch events', 'media', 'london', 'https://techcrunch.com/events', null, null),
  ('enterprise-nation-london', 'Enterprise Nation', 'community', 'london', 'https://www.enterprisenation.com/events', null,
   'Small business owners, revenue-stage rather than idea-stage.'),
  -- New York
  ('nyc-founders-luma', 'New York founders on Luma', 'community', 'new_york', null, 'https://lu.ma/nyc', null),
  ('on-deck-nyc', 'On Deck', 'community', 'new_york', 'https://www.beondeck.com', null,
   'Founder cohorts, strong peer density.'),
  ('nyc-tech-meetup', 'NY Tech Alliance', 'community', 'new_york', 'https://www.nytech.org', null,
   'Mixed room: weight on the night, not on the host.'),
  ('brand-innovators-nyc', 'Brand Innovators', 'vendor', 'new_york', 'https://brand-innovators.com', null,
   'Marketing leadership summits. Buyer density is real, peer density is not.'),
  ('digiday-events-nyc', 'Digiday events', 'media', 'new_york', 'https://digiday.com/events', null,
   'Media and adtech leaders: buyers per api/_mission.ts FACE, not peers.'),
  ('entrepreneurs-org-nyc', 'Entrepreneurs Organization New York', 'community', 'new_york', 'https://hub.eonetwork.org', null,
   'Members must run a business over $1m revenue: the highest peer-density filter available.'),
  -- Sydney, temporary per section 3: present so a booked trip has something to
  -- read, never the stored default.
  ('sydney-founders-luma', 'Sydney founders on Luma', 'community', 'sydney', null, 'https://lu.ma/sydney', null),
  ('startmate-sydney', 'Startmate', 'community', 'sydney', 'https://www.startmate.com', null, null)
on conflict (slug) do nothing;

-- 5. Home city ---------------------------------------------------------------
--
-- One setting, several consumers, exactly as system_config.operator_timezone is
-- read by api/_timezone.ts, the browser and public.operator_tz(). Sydney is
-- never stored here by a default; it is a button press (section 3).

insert into public.system_config (key, value)
values ('operator_home_city', 'new_york')
on conflict (key) do nothing;

create or replace function public.operator_home_city()
returns text
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select nullif(trim(value), '') from system_config where key = 'operator_home_city'),
    'new_york'
  )
$function$;

-- 6. The read function, re-ranked --------------------------------------------
--
-- Archiving is only ever for the dead. An away-city event is UNACTIONABLE, not
-- dead, and becomes live the moment a trip is booked, so actionability is
-- decided here at query time and never by an UPDATE. Getting this wrong
-- destroyed 26 New York rows once already.
--
-- Ranking changed with the axes: greatest(draw, demand) was right when Draw
-- meant technical density and the two axes were genuinely different questions.
-- Now both axes are commercial, so a room that is decent on both should beat a
-- room that spikes on one. Peer density is weighted slightly ahead of buyer
-- density because the stated ask was people to learn from first.

create or replace function public.events_for(p_home_city text)
returns table (
  id uuid, title text, host text, host_kind text, url text,
  city text, venue text, cost_kind text, ticket_price_usd numeric,
  starts_at timestamptz, can_speak boolean, speak_deadline_at timestamptz,
  draw_score integer, demand_score integer, score_reason text,
  named_attendees text[], rank_score numeric, actionability text
)
language sql
stable
set search_path to 'public'
as $function$
  select e.id, e.title, e.host, e.host_kind, e.url,
         e.city, e.venue, e.cost_kind, e.ticket_price_usd,
         e.starts_at, e.can_speak, e.speak_deadline_at,
         e.draw_score, e.demand_score, e.score_reason,
         e.named_attendees,
         round(coalesce(e.draw_score, 0) * 0.55 + coalesce(e.demand_score, 0) * 0.45, 1) as rank_score,
         case
           when e.city = p_home_city or e.city = 'virtual' then 'home'
           when coalesce(array_length(e.named_attendees, 1), 0) > 0 then 'away, named attendee'
           when e.starts_at > now() + interval '21 days' then 'away, bookable'
           else 'away, needs a trip'
         end as actionability
  from events_recommendable e
  order by
    case when e.city = p_home_city or e.city = 'virtual' then 0 else 1 end,
    round(coalesce(e.draw_score, 0) * 0.55 + coalesce(e.demand_score, 0) * 0.45, 1) desc,
    e.starts_at
$function$;

-- RLS: anon reads, service_role writes, matching
-- 20260909110000_revoke_anon_writes.sql.
alter table public.events enable row level security;
alter table public.event_hosts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_anon_read') then
    create policy events_anon_read on public.events for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_service_all') then
    create policy events_service_all on public.events for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_hosts' and policyname = 'event_hosts_anon_read') then
    create policy event_hosts_anon_read on public.event_hosts for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_hosts' and policyname = 'event_hosts_service_all') then
    create policy event_hosts_service_all on public.event_hosts for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.events, public.event_hosts, public.events_recommendable to anon, authenticated;

commit;
