-- The room is a pilot (ADR-023).
--
-- "The Room" was insider shorthand. It named a real thing - a paid three week
-- diagnostic sold to people Krish already knows - but nothing on screen ever
-- said so, and the classifier prompt interpolated the word straight back into
-- every generated ask line, so a card read "ask David if he knows an agency
-- leader who should hear about the room" to a reader who had never been told
-- what the room was. Krish's ruling, 2026-09-16: rename, all the way down.
--
-- Why pilot_deals and not pilot_targets: `pilot` is already taken in this
-- schema by the OPERATOR layer - pilot_checkins, pilot_asks, pilot_daily,
-- api/pilot/*, src/components/pilot/*, docs/PILOT-LAYER.md - which monitors
-- Krish, not the sales list. `pilot_targets` sitting beside `pilot_asks` would
-- read as the same family and is a trap for the next reader. `pilot_deals` is
-- unambiguous in a way `pilot_targets` is not.
--
-- Every statement is a RENAME or a bounded UPDATE, so no row is recreated and
-- no history is lost. Measured against production immediately before writing
-- this: 2 room_targets rows (1 drafted, 1 not_now), 1 scorecard_weeks row with
-- paid_rooms = 0, 0 daily_focus rows, 0 goals carrying a job, 0 ships with a
-- room: dedup key, and 1 meter_daily row under unit_key 'room'. The state and
-- job UPDATEs below therefore touch nothing today; they are written for
-- correctness, not for the rows that happen to exist.

-- ── 1. The table ───────────────────────────────────────────────────────────
ALTER TABLE public.room_targets RENAME TO pilot_deals;

ALTER TABLE public.pilot_deals RENAME COLUMN room_booked_at TO pilot_booked_at;
ALTER TABLE public.pilot_deals RENAME COLUMN room_paid_at   TO pilot_paid_at;

ALTER INDEX public.room_targets_pkey                  RENAME TO pilot_deals_pkey;
ALTER INDEX public.room_targets_contact_id_key        RENAME TO pilot_deals_contact_id_key;
ALTER INDEX public.room_targets_state_trigger_idx     RENAME TO pilot_deals_state_trigger_idx;
ALTER INDEX public.room_targets_ask_kind_state_idx    RENAME TO pilot_deals_ask_kind_state_idx;

ALTER TABLE public.pilot_deals RENAME CONSTRAINT room_targets_contact_id_fkey TO pilot_deals_contact_id_fkey;
ALTER TABLE public.pilot_deals RENAME CONSTRAINT room_targets_cash_gbp_check  TO pilot_deals_cash_gbp_check;
ALTER TABLE public.pilot_deals RENAME CONSTRAINT room_targets_sourced_by_check TO pilot_deals_sourced_by_check;
ALTER TABLE public.pilot_deals RENAME CONSTRAINT room_targets_ask_kind_check  TO pilot_deals_ask_kind_check;

-- ── 2. The two renamed ladder states ───────────────────────────────────────
-- Drop the CHECK first: the UPDATE would violate it otherwise.
ALTER TABLE public.pilot_deals DROP CONSTRAINT room_targets_state_check;
UPDATE public.pilot_deals SET state = 'pilot_booked' WHERE state = 'room_booked';
UPDATE public.pilot_deals SET state = 'pilot_paid'   WHERE state = 'room_paid';
ALTER TABLE public.pilot_deals ADD CONSTRAINT pilot_deals_state_check CHECK (state IN (
  'listed', 'drafted', 'sent', 'replied', 'call_booked', 'call_taken',
  'pilot_booked', 'pilot_paid', 'not_now'
));

-- ── 3. The scorecard column ────────────────────────────────────────────────
ALTER TABLE public.scorecard_weeks RENAME COLUMN paid_rooms          TO paid_pilots;
ALTER TABLE public.scorecard_weeks RENAME COLUMN override_paid_rooms TO override_paid_pilots;

-- ── 4. The job ids on the goal ladder ──────────────────────────────────────
ALTER TABLE public.goals       DROP CONSTRAINT IF EXISTS goals_job_check;
ALTER TABLE public.daily_focus DROP CONSTRAINT IF EXISTS daily_focus_job_check;

UPDATE public.goals SET job = 'fill_pilots' WHERE job = 'fill_room';
UPDATE public.goals SET job = 'run_pilots'  WHERE job = 'run_room';
UPDATE public.daily_focus SET target_1_job = 'fill_pilots' WHERE target_1_job = 'fill_room';
UPDATE public.daily_focus SET target_2_job = 'fill_pilots' WHERE target_2_job = 'fill_room';
UPDATE public.daily_focus SET target_3_job = 'fill_pilots' WHERE target_3_job = 'fill_room';
UPDATE public.daily_focus SET target_1_job = 'run_pilots'  WHERE target_1_job = 'run_room';
UPDATE public.daily_focus SET target_2_job = 'run_pilots'  WHERE target_2_job = 'run_room';
UPDATE public.daily_focus SET target_3_job = 'run_pilots'  WHERE target_3_job = 'run_room';

ALTER TABLE public.goals ADD CONSTRAINT goals_job_check
  CHECK (job IS NULL OR job IN ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge'));
ALTER TABLE public.daily_focus ADD CONSTRAINT daily_focus_job_check CHECK (
  (target_1_job IS NULL OR target_1_job IN ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge')) AND
  (target_2_job IS NULL OR target_2_job IN ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge')) AND
  (target_3_job IS NULL OR target_3_job IN ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge'))
);

-- ── 5. Carry the spend history across, rather than splitting it ────────────
-- callClaude({ agent: 'room' }) becomes agent: 'pilots'. Without this the
-- Spend panel would show one retired unit and one new one for the same work.
UPDATE public.meter_daily SET unit_key = 'pilots',
       unit_label = CASE WHEN unit_label = 'room' THEN 'pilots' ELSE unit_label END
 WHERE unit_kind = 'agent' AND unit_key = 'room'
   AND NOT EXISTS (
     SELECT 1 FROM public.meter_daily x
      WHERE x.provider = meter_daily.provider AND x.unit_kind = 'agent'
        AND x.unit_key = 'pilots' AND x.day = meter_daily.day AND x.bucket = meter_daily.bucket
   );

-- ── 6. Ship dedup keys ─────────────────────────────────────────────────────
-- api/pilot-deals/[id] now writes `pilot:<id>`. Any existing `room:<id>` row
-- must move with it or the same approach could be shipped twice.
UPDATE public.ships SET dedup_key = 'pilot:' || substring(dedup_key from 6)
 WHERE dedup_key LIKE 'room:%';

COMMENT ON TABLE public.pilot_deals IS
  'People who could pay for a paid three week pilot, on a nine state ladder. Renamed from room_targets 2026-09-16 (ADR-023). Not related to pilot_checkins / pilot_asks / pilot_daily, which are the operator layer.';
