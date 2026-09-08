/* Make prompt-cache savings visible.
 *
 * meter_daily has recorded input and output tokens since 2026-08-27 and nothing
 * about caching, so a cached call and an uncached one of the same size look
 * identical in the meter. That is not a gap in reporting, it is a gap in
 * feedback: nobody can tell whether a cache breakpoint is working, and a
 * breakpoint that silently stopped working has no other symptom.
 *
 * Three columns, and the choice of three rather than one is the point.
 *
 *   cache_read_tokens   served from an existing entry, priced at 0.1x input
 *   cache_write_tokens  written into a new entry, priced at 1.25x or 2x input
 *   usd_uncached        what the same work would have cost with no caching
 *
 * Reads and writes are NOT netted together. A write costs more than an ordinary
 * input token and a read costs a tenth of one, so a site that writes entries
 * nobody reads is more expensive than a site with no caching at all. Netting
 * them would hide exactly that case. usd_uncached minus usd is the saving, and
 * it goes negative when caching is being used wrongly, which is the number
 * worth having.
 *
 * Existing rows get zeros and usd_uncached backfilled to usd, so history reads
 * as "no caching, no saving", which is true of it.
 */

alter table public.meter_daily
  add column if not exists cache_read_tokens  numeric not null default 0,
  add column if not exists cache_write_tokens numeric not null default 0,
  add column if not exists usd_uncached       numeric not null default 0;

/* Backfill: before today nothing was cached, so the uncached cost is the cost. */
update public.meter_daily set usd_uncached = usd where usd_uncached = 0 and usd <> 0;

/* meter_add gains three parameters, all defaulted, so any caller that has not
   been updated keeps working and simply records no caching. The old signature
   is dropped only after the new one exists, and the grants are restated
   because a changed signature is a different function to Postgres. */
create or replace function public.meter_add(
  p_provider           text,
  p_unit_kind          text,
  p_unit_key           text,
  p_day                date,
  p_bucket             text    default '',
  p_unit_label         text    default null,
  p_category           text    default null,
  p_usd                numeric default 0,
  p_runs               integer default 1,
  p_failed             integer default 0,
  p_units              numeric default 0,
  p_unit_name          text    default null,
  p_cache_read_tokens  numeric default 0,
  p_cache_write_tokens numeric default 0,
  p_usd_uncached       numeric default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.meter_daily as m (
    provider, unit_kind, unit_key, day, bucket,
    unit_label, category, usd, runs, failed, units, unit_name,
    cache_read_tokens, cache_write_tokens, usd_uncached, updated_at
  ) values (
    p_provider, p_unit_kind, p_unit_key, p_day, coalesce(p_bucket, ''),
    p_unit_label, p_category, coalesce(p_usd, 0), coalesce(p_runs, 0),
    coalesce(p_failed, 0), coalesce(p_units, 0), p_unit_name,
    coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0),
    /* A caller that does not know its uncached cost is a caller that is not
       caching, so its uncached cost is what it paid. */
    coalesce(p_usd_uncached, p_usd, 0), now()
  )
  on conflict (provider, unit_kind, unit_key, day, bucket) do update set
    usd                = m.usd                + excluded.usd,
    runs               = m.runs               + excluded.runs,
    failed             = m.failed             + excluded.failed,
    units              = m.units              + excluded.units,
    cache_read_tokens  = m.cache_read_tokens  + excluded.cache_read_tokens,
    cache_write_tokens = m.cache_write_tokens + excluded.cache_write_tokens,
    usd_uncached       = m.usd_uncached       + excluded.usd_uncached,
    unit_label = coalesce(excluded.unit_label, m.unit_label),
    category   = coalesce(excluded.category,   m.category),
    unit_name  = coalesce(excluded.unit_name,  m.unit_name),
    updated_at = now();
$$;

revoke all on function public.meter_add(text,text,text,date,text,text,text,numeric,integer,integer,numeric,text,numeric,numeric,numeric) from public, anon, authenticated;

/* The twelve-argument form is now unreachable from the application and would
   silently swallow cache figures if a caller found it. Dropped rather than
   left as a trap. */
drop function if exists public.meter_add(text,text,text,date,text,text,text,numeric,integer,integer,numeric,text);
