-- One clock. APPLIED LIVE 2026-07-29 (migration name: operator_timezone).
--
-- Before this the product decided "what day is it" three different ways:
--   America/New_York  the pilot layer (gate, shutdown, ships, worries)
--   Europe/London     the focus spine (useWeeklyFocus, useAltitudes, and the
--                     weekly rollup in api/daily-focus/suggestions)
--   UTC               daily_focus.focus_date, written by the client picker and
--                     read back by api/daily-focus/today
--
-- So useAltitudes could believe today's focus was unset while daily_focus held
-- a row for it, and a check-in filed at 9am London landed on the previous
-- Eastern day. Those are not edge cases, they are every morning for a European
-- operator.
--
-- The zone is now one configurable value with a single default, readable from
-- SQL, from the server routes, and from the browser. Changing it moves every
-- day boundary in the product together.

insert into public.system_config (key, value)
values ('operator_timezone', 'America/New_York')
on conflict (key) do nothing;

-- The SQL-side reader. Stable so it can be used in defaults and views, and
-- falls back to Eastern if the row is ever missing, so no query can break on a
-- deleted setting.
create or replace function public.operator_tz() returns text
language sql
stable
as $$
  select coalesce(
    (select value from public.system_config where key = 'operator_timezone'),
    'America/New_York'
  )
$$;

grant execute on function public.operator_tz() to anon, service_role;

-- The check-in date default now follows the setting. The routes still set this
-- column explicitly; the default is the backstop for direct inserts.
alter table public.pilot_checkins
  alter column checkin_date set default (now() at time zone public.operator_tz())::date;

-- The daily rollup follows the same clock, so the history stays coherent with
-- whatever the operator is actually living in.
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
  select (occurred_at at time zone public.operator_tz())::date as day,
         count(*) as ships,
         count(*) filter (where source = 'webhook') as external_ships
    from public.ships
   group by 1
) s on s.day = d.day::date;

grant select on public.pilot_daily to anon;
grant select on public.pilot_daily to service_role;
