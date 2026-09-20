-- The quiet-source monitor was reporting the wrong clock.
--
-- 20260920100000 built intake_source_health to answer one question: is this
-- writer still writing. It computed last_seen_at as
--
--   max(coalesce(i.received_at, i.first_seen_at))
--
-- and received_at is the MATERIAL's own date, not the machine's. It is when the
-- Drive file was last modified, or when the newsletter was sent. first_seen_at
-- is when this machine actually wrote the row.
--
-- Preferring received_at made the view answer "how old is the newest material"
-- while claiming to answer "when did this writer last write". For drive_files
-- the two are 470 hours apart: the newest file in the folder was modified on
-- 2026-08-19, but the scanner wrote its most recent row on 2026-09-08. The view
-- said 759 hours quiet. The truth is 289. That number was quoted to Krish four
-- times on 2026-09-20 as evidence the lane had been dead for a month.
--
-- No verdict changes. All eight active sources with an expectation land on the
-- same verdict under either clock, checked before this was written, so the
-- monitor's conclusions were sound and only its arithmetic was not. That is
-- worth stating plainly rather than quietly correcting: the machinery found
-- four genuinely dead sources and it still does.
--
-- Both clocks are kept, because both questions are real. A lane can be writing
-- steadily about material that is months old, and that is a different problem
-- from a lane that has stopped. newest_material_at is appended rather than
-- slotted beside last_seen_at so this stays a CREATE OR REPLACE and no
-- dependent object has to be dropped to fix a reporting bug.
--
-- flag_quiet_intake_sources() reads this view and names no column of its own,
-- so the hand-off rows it writes inherit the correction rather than needing one.

create or replace view public.intake_source_health as
select
  s.slug,
  s.label,
  s.active,
  s.owner,
  s.expects_every_hours,
  s.expectation_set_on,
  m.last_seen_at,
  m.rows_ever,
  case
    when m.last_seen_at is null then null::integer
    else floor(extract(epoch from now() - m.last_seen_at) / 3600::numeric)::integer
  end as hours_quiet,
  case
    when not s.active then 'inactive'::text
    when s.expects_every_hours is null then 'no expectation'::text
    when m.last_seen_at is null then 'never produced'::text
    when (extract(epoch from now() - m.last_seen_at) / 3600::numeric) > s.expects_every_hours::numeric then 'overdue'::text
    else 'producing'::text
  end as verdict,
  case
    when not s.active then 'Inactive on purpose. Silence is the expected reading.'::text
    when s.expects_every_hours is null then 'No cadence is claimed for this source, so nothing here can tell a quiet week from a dead writer. That is honest for a source Krish fills by hand and is a gap for any source a machine writes.'::text
    when m.last_seen_at is null then 'Declared active and has never produced a row. A writer that has never written is invisible to anything that only watches what it finds.'::text
    when (extract(epoch from now() - m.last_seen_at) / 3600::numeric) > s.expects_every_hours::numeric then
      'Last row ' || floor(extract(epoch from now() - m.last_seen_at) / 3600::numeric)::integer
      || ' hours ago against an expectation of ' || s.expects_every_hours
      || '. Its writer is ' || s.owner || '; start there, and read `formerly` for where it runs.'
    else 'Producing inside its expectation.'::text
  end as says,
  -- How fresh the material itself is. A separate question, reported beside the
  -- verdict rather than folded into it.
  m.newest_material_at
from public.intake_sources s
left join lateral (
  select
    -- WHEN THIS MACHINE WROTE, which is the only clock a liveness verdict may
    -- read. Never coalesce received_at ahead of it.
    max(i.first_seen_at) as last_seen_at,
    max(coalesce(i.received_at, i.first_seen_at)) as newest_material_at,
    count(*) as rows_ever
  from public.intake_items i
  where i.source = s.slug
) m on true;

comment on view public.intake_source_health is
  'Is each intake source still writing. hours_quiet and verdict read first_seen_at, the machine clock. newest_material_at reports how old the material is, which is a different question and must never decide the verdict: preferring it made drive_files read 759 hours quiet when its scanner had written 289 hours ago.';

grant select on public.intake_source_health to anon, authenticated, service_role;

-- APPLIED and read back 2026-09-20. drive_files now reads hours_quiet 289 with
-- newest_material_at 759 hours old, which is the honest pair: the scanner is
-- overdue against its 72-hour expectation AND the folder itself has had nothing
-- new in a month. Every other source is unchanged in both numbers and verdict.
