-- A skipped morning is a real answer, and it is not a 3 out of 5.
--
-- The Skip button wrote energy 3 / anxiety 3 / green so that a row existed and
-- the gate would open. That works for the gate and lies to everything else: the
-- capacity layer reads it as a genuine steady day, pilot_daily shows a reading
-- for a day nobody answered, and yesterday's recap tells him he felt fine on a
-- morning he skipped. The reading history is the one thing in this layer that
-- has to be true.
--
-- So skipping now writes NULL energy and anxiety with this flag set.
-- capacityFor() already returns 'steady' for a null reading, which is the same
-- behaviour the fake 3/3 produced, without the invented data point.

ALTER TABLE public.pilot_checkins
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pilot_checkins.skipped IS
  'Morning rows only. True when the operator dismissed the check-in rather than answering it. energy and anxiety are NULL on these rows: they are not a reading and must never be read as one.';

-- Existing rows: a morning row carrying the exact signature the Skip button
-- wrote (3/3, green, no word, no intent, no venture) cannot have been produced
-- by the four-stage flow, which cannot reach Start without a word or an intent.
UPDATE public.pilot_checkins
   SET skipped = true, energy = NULL, anxiety = NULL
 WHERE kind = 'morning'
   AND energy = 3 AND anxiety = 3
   AND one_word IS NULL AND intent IS NULL AND venture IS NULL
   AND mode = 'green';

-- Surface it in the rollup, so a skipped day is legible as skipped rather than
-- inferred from a null reading next to a green mode.
CREATE OR REPLACE VIEW public.pilot_daily AS
  SELECT d.day::date AS day,
         m.energy,
         m.anxiety,
         m.mode,
         m.one_word,
         m.intent,
         (m.override_at IS NOT NULL) AS overrode,
         e.tomorrow_one,
         e.shipped_today,
         COALESCE(s.ships, 0::bigint) AS ships,
         COALESCE(s.external_ships, 0::bigint) AS external_ships,
         COALESCE(m.skipped, false) AS skipped
    FROM (SELECT generate_series(
                   COALESCE((SELECT min(checkin_date) FROM pilot_checkins), CURRENT_DATE)::timestamptz,
                   CURRENT_DATE::timestamptz,
                   '1 day'::interval) AS day) d
    LEFT JOIN pilot_checkins m ON m.kind = 'morning' AND m.checkin_date = d.day::date
    LEFT JOIN pilot_checkins e ON e.kind = 'evening' AND e.checkin_date = d.day::date
    LEFT JOIN (SELECT (occurred_at AT TIME ZONE operator_tz())::date AS day,
                      count(*) AS ships,
                      count(*) FILTER (WHERE source = 'webhook') AS external_ships
                 FROM ships
                GROUP BY (occurred_at AT TIME ZONE operator_tz())::date) s ON s.day = d.day::date;
