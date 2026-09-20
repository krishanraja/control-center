-- The cadence table held two formats that no longer exist, and was missing one
-- that does.
--
-- content_cadence had four rows on 2026-09-20: cadence:techonomic (slot 'paid')
-- and cadence:builder_economy_ig (slot 'built'), both naming formats retired on
-- 2026-09-17, plus split_the_bill and mind_the_gap. lift_the_lid, the third live
-- subchannel, had no row at all, so it could never be scheduled.
--
-- WHY A FLAG AND NOT A STATUS. The obvious move is to set the two dead rows to
-- a retired status. It does not work: recompute_content_cadence() rewrites
-- `status` on every row on every run, from published history alone, so a
-- retired status is reset to 'no_data' within seconds of the next sourcing run
-- and the row is counted as due again. The RPC does not touch this column, so
-- the flag survives it.
--
-- WHY NOT DELETE. These rows carry created_at and streak history for formats
-- that really ran. Deleting them loses that to save a boolean, and `active` is
-- the pattern venture_formats and intake_sources already use for exactly this.

alter table public.content_cadence
  add column if not exists active boolean not null default true;

comment on column public.content_cadence.active is
  'False for a cadence row whose format no longer exists. Readers must filter on it: recompute_content_cadence() rewrites status unconditionally, so status cannot carry retirement.';

update public.content_cadence
   set active = false, updated_at = now()
 where slot in ('paid', 'built');

-- lift.the.lid: 0.5 a week, which is a 14 day interval. It publishes when a
-- subject earns it rather than on a fixed day, which is why its cadence_label
-- in venture_formats reads "No fixed day"; the interval is what the sourcing
-- planner needs to decide whether a draft is overdue.
insert into public.content_cadence (id, lane, slot, label, interval_days, target_per_week, status, active)
values ('cadence:lift_the_lid', 'publication', 'lift_the_lid', 'lift.the.lid', 14, 0.5, 'no_data', true)
on conflict (id) do update
  set lane = excluded.lane,
      slot = excluded.slot,
      label = excluded.label,
      interval_days = excluded.interval_days,
      target_per_week = excluded.target_per_week,
      active = true,
      updated_at = now();

-- APPLIED and read back 2026-09-20: three active rows (lift_the_lid,
-- mind_the_gap, split_the_bill) matching the three subchannels in
-- venture_formats, two inactive with their history intact.
--
-- The n8n side of this is Cleo | Mindmaker OS | Content Lane Sourcing
-- (rRAyEUs7NsY06hFy), published as c06c48b6: Get Cadence filters active,
-- Get Lane Configs reads venture_formats instead of system_config, Plan Due
-- Lanes joins on slug instead of a string built from names, and Build Heartbeat
-- reports planned alongside due instead of counting work it did not do.
