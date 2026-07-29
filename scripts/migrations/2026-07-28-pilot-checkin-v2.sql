-- Pilot check-in v2. APPLIED LIVE 2026-07-28 (migration name: pilot_checkin_v2).
--
-- Three changes, all driven by using v1 on a phone.
--
-- 1. checkin_date. v1 decided "is there a row for today" by scanning created_at
--    against a timestamp range. That works until the civil day rolls over while
--    the operator is mid-session, at which point the gate reappears on a day he
--    already answered. A real date column, stamped once at write time, plus a
--    unique index, makes one-row-per-kind-per-day a database guarantee rather
--    than a query convention.
--
-- 2. intent. What the day is for, chosen at check-in. The dashboard opens on
--    the matching tab instead of dropping him on Home to choose again, which is
--    the same choosing-is-the-blocker problem the layer exists to remove.
--
-- 3. pilot_daily. One row per day joining state, intent and output, so the
--    check-in data is queryable as a time series later. No UI reads this: the
--    layer shows output, not analytics. It exists so the history is worth
--    having when there is enough of it.

alter table public.pilot_checkins add column if not exists checkin_date date;
alter table public.pilot_checkins add column if not exists intent text;

-- Backfill from created_at in the operator's civil zone.
update public.pilot_checkins
   set checkin_date = (created_at at time zone 'America/New_York')::date
 where checkin_date is null;

alter table public.pilot_checkins alter column checkin_date set default (now() at time zone 'America/New_York')::date;

-- One morning and one evening per day, enforced. Dedup any historical
-- duplicates first, keeping the most recent row per (kind, date).
delete from public.pilot_checkins a
 using public.pilot_checkins b
 where a.kind = b.kind
   and a.checkin_date = b.checkin_date
   and a.created_at < b.created_at;

create unique index if not exists pilot_checkins_one_per_kind_per_day
  on public.pilot_checkins (kind, checkin_date);

create index if not exists pilot_checkins_date_idx on public.pilot_checkins (checkin_date desc);

-- The operator's day, one row per date. State in, output out.
create or replace view public.pilot_daily as
select
  d.day::date                                   as day,
  m.energy,
  m.anxiety,
  m.mode,
  m.one_word,
  m.intent,
  m.override_at is not null                     as overrode,
  e.tomorrow_one,
  e.shipped_today,
  coalesce(s.ships, 0)                          as ships,
  coalesce(s.external_ships, 0)                 as external_ships
from (
  select generate_series(
    coalesce((select min(checkin_date) from public.pilot_checkins), current_date),
    current_date,
    interval '1 day'
  ) as day
) d
left join public.pilot_checkins m
  on m.kind = 'morning' and m.checkin_date = d.day::date
left join public.pilot_checkins e
  on e.kind = 'evening' and e.checkin_date = d.day::date
left join (
  select (occurred_at at time zone 'America/New_York')::date as day,
         count(*) as ships,
         count(*) filter (where source = 'webhook') as external_ships
    from public.ships
   group by 1
) s on s.day = d.day::date;

grant select on public.pilot_daily to anon;
grant select on public.pilot_daily to service_role;
