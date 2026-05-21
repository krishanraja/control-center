-- Pillar 5 — Anti-busywork discipline.
-- Every task gets rated 1-10 on revenue impact and how many hours until
-- it actually moves the needle. Today's hero slot becomes the highest-lever
-- shortest-path task — never the most overdue.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS lever_score          int,
  ADD COLUMN IF NOT EXISTS est_hours_to_revenue int,
  ADD COLUMN IF NOT EXISTS lever_rated_at       timestamptz;

CREATE INDEX IF NOT EXISTS tasks_lever_idx
  ON tasks (lever_score DESC NULLS LAST, est_hours_to_revenue ASC NULLS LAST)
  WHERE status NOT IN ('done','superseded');

-- Streak ceiling so the Daily Lock has a denominator.
INSERT INTO system_config (key, value, updated_at)
  VALUES ('daily_lock_threshold', '7', now())
  ON CONFLICT (key) DO NOTHING;

INSERT INTO system_config (key, value, updated_at)
  VALUES ('daily_lock_enabled', 'true', now())
  ON CONFLICT (key) DO NOTHING;
