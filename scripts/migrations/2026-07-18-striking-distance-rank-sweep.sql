-- maya_striking_distance becomes a live rank board the Maya SEO Rank Sweep
-- upserts into. APPLIED LIVE 2026-07-18 (striking_distance_rank_sweep_columns +
-- striking_distance_position_shift_trigger).

-- 1) Unique (product, query) so PostgREST on_conflict upsert works; durable
--    columns for the DataForSEO volume enrichment and staleness.
create unique index if not exists maya_striking_distance_product_query_uidx
  on public.maya_striking_distance (product, query);

alter table public.maya_striking_distance
  add column if not exists search_volume integer,
  add column if not exists last_checked_at timestamptz;

-- found_at becomes first-seen: omitted from upsert payloads so INSERT stamps it
-- and UPDATE leaves it untouched.
alter table public.maya_striking_distance
  alter column found_at set default now();

-- 2) The sweep upserts current_position; the DB shifts the old value into
--    previous_position on every real move. Keeps the sweep a pure transform +
--    upsert (no read-back of prior state) and makes movement correct even if
--    two writers touch the same row.
create or replace function public.maya_striking_distance_shift_position()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.current_position is distinct from old.current_position then
    new.previous_position := old.current_position;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_maya_sd_shift_position on public.maya_striking_distance;
create trigger trg_maya_sd_shift_position
  before update on public.maya_striking_distance
  for each row execute function public.maya_striking_distance_shift_position();

-- Merge-duplicates upsert only touches columns present in the payload, so the
-- rank sweep (product/query/current_position/search_volume/priority/last_checked_at)
-- and a later GSC sweep (clicks/impressions/ctr) coexist on the same row.
