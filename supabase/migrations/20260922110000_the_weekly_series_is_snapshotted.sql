-- The weekly trend series, computed in the database and snapshotted.
--
-- trend_observations is raw and grows forever, which is the point of it. This
-- is the layer a dashboard or a brief actually reads: how much was written,
-- about what, by whom, each week.
--
-- Two decisions worth stating, because both look like over-engineering until
-- the day they matter.
--
-- It is computed HERE rather than by a job pulling rows. A year of gathers is
-- hundreds of thousands of rows, and a route that pages through them to count
-- them gets slower every week until somebody quietly adds a limit to it and
-- the series silently starts lying. Counting is what the database is for.
--
-- It is SNAPSHOTTED rather than computed on read, and a recomputation writes a
-- NEW row rather than replacing the old one. A metric computed on read changes
-- its own history the moment the method changes, so a line that moves cannot
-- be attributed to the world or to us. That is the exact failure the whole
-- observation record exists to prevent, and it would be perverse to rebuild it
-- one layer up. `method` names the recipe; trend_weekly_metrics_current takes
-- the newest per point; both readings stay.

create or replace function public.snapshot_trend_weekly_metrics(
  p_week text,
  p_method text default 'v1'
)
returns integer
language plpgsql
as $$
declare
  v_start date;
  v_end date;
  v_written integer;
begin
  -- ISO week label ('2026-W38') to the Monday that starts it. to_date with
  -- IYYY-IW resolves the ISO week-numbering year, which is what the content
  -- week is keyed on everywhere else in this system.
  if p_week !~ '^\d{4}-W\d{2}$' then
    raise exception 'week must look like 2026-W38, got %', p_week;
  end if;
  v_start := to_date(replace(p_week, '-W', '-'), 'IYYY-IW');
  v_end := v_start + 7;

  with scope as (
    select *
    from public.trend_observations
    where observed_on >= v_start and observed_on < v_end
  ),
  -- Entity mentions are counted once per observation per entity however many
  -- extractors found them, and a model's mention counts for its lab too, so a
  -- question about Anthropic sweeps in every Claude release without anyone
  -- maintaining a list.
  entity_scope as (
    select distinct s.id, s.url_hash, s.source_host, s.surfaced, s.source_tier, s.observed_on,
           coalesce(e.parent_slug, e.slug) as slug
    from scope s
    join public.trend_observation_entities oe on oe.observation_id = s.id
    join public.trend_entities e on e.slug = oe.entity_slug
    union
    select distinct s.id, s.url_hash, s.source_host, s.surfaced, s.source_tier, s.observed_on, e.slug
    from scope s
    join public.trend_observation_entities oe on oe.observation_id = s.id
    join public.trend_entities e on e.slug = oe.entity_slug
  ),
  rolled as (
    select 'category'::text as dimension, coalesce(category, 'unclassified') as dimension_key,
           count(*)::integer as observations,
           count(distinct url_hash)::integer as distinct_urls,
           count(distinct source_host)::integer as distinct_hosts,
           count(*) filter (where surfaced)::integer as surfaced,
           coalesce(sum(coalesce(source_tier, 1)), 0)::numeric as tier_weighted,
           min(observed_on) as first_seen_on
    from scope group by coalesce(category, 'unclassified')

    union all
    select 'origin', origin, count(*)::integer, count(distinct url_hash)::integer,
           count(distinct source_host)::integer, count(*) filter (where surfaced)::integer,
           coalesce(sum(coalesce(source_tier, 1)), 0)::numeric, min(observed_on)
    from scope group by origin

    union all
    select 'source_host', source_host, count(*)::integer, count(distinct url_hash)::integer,
           1, count(*) filter (where surfaced)::integer,
           coalesce(sum(coalesce(source_tier, 1)), 0)::numeric, min(observed_on)
    from scope where source_host is not null group by source_host

    union all
    select 'stance', coalesce(stance, 'unclassified'), count(*)::integer, count(distinct url_hash)::integer,
           count(distinct source_host)::integer, count(*) filter (where surfaced)::integer,
           coalesce(sum(coalesce(source_tier, 1)), 0)::numeric, min(observed_on)
    from scope group by coalesce(stance, 'unclassified')

    union all
    select 'entity', slug, count(*)::integer, count(distinct url_hash)::integer,
           count(distinct source_host)::integer, count(*) filter (where surfaced)::integer,
           coalesce(sum(coalesce(source_tier, 1)), 0)::numeric, min(observed_on)
    from entity_scope group by slug

    union all
    select 'total', 'all', count(*)::integer, count(distinct url_hash)::integer,
           count(distinct source_host)::integer, count(*) filter (where surfaced)::integer,
           coalesce(sum(coalesce(source_tier, 1)), 0)::numeric, min(observed_on)
    from scope
  )
  insert into public.trend_weekly_metrics
    (week, dimension, dimension_key, observations, distinct_urls, distinct_hosts,
     surfaced, tier_weighted, first_seen_on, method)
  select p_week, dimension, dimension_key, observations, distinct_urls, distinct_hosts,
         surfaced, tier_weighted, first_seen_on, p_method
  from rolled;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

comment on function public.snapshot_trend_weekly_metrics(text, text) is
  'Roll one ISO week of trend_observations into trend_weekly_metrics. Appends; never replaces. Re-running with the same method writes a second snapshot beside the first, so a number that moved can always be attributed to late-arriving observations rather than to a silent rewrite.';

-- The week-over-week view. Every trend question ("is this rising", "who is
-- gaining") is a delta, and computing it at every call site is how two
-- surfaces end up disagreeing about the same number.
create or replace view public.trend_weekly_momentum as
select
  m.dimension,
  m.dimension_key,
  m.week,
  m.observations,
  m.distinct_hosts,
  m.tier_weighted,
  m.surfaced,
  lag(m.observations) over w as prev_observations,
  m.observations - lag(m.observations) over w as delta,
  case
    when lag(m.observations) over w is null then null
    when lag(m.observations) over w = 0 then null
    else round(((m.observations - lag(m.observations) over w)::numeric
                / lag(m.observations) over w) * 100, 1)
  end as pct_change,
  m.first_seen_on
from public.trend_weekly_metrics_current m
window w as (partition by m.dimension, m.dimension_key order by m.week);

comment on view public.trend_weekly_momentum is
  'Week over week per series point, from the current snapshot of each week. pct_change is null rather than infinite where the previous week was zero, because a first appearance is not a percentage rise and reporting it as one would make every new entity look like the story of the year.';
