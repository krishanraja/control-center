-- Nell candidates: link to the outreach task once Krish schedules a guest
-- via the new "Schedule with Nell" CTA on GuestCandidateCard, and a soft
-- "skipped" path for candidates Krish doesn't want to pursue.

ALTER TABLE nell_candidates
  ADD COLUMN IF NOT EXISTS scheduled_task_id  uuid REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skipped_at         timestamptz;

CREATE INDEX IF NOT EXISTS nell_candidates_pod_status_idx
  ON nell_candidates (podcast_target, status);
