-- Grader calibration: best-worst responses on real rows + learned weights.
--
-- The backburner sweep (api/triage/sweep) scores items with per-domain
-- attribute weights stored in system_config (grader_weights_content,
-- grader_weights_lead, grader_weights_visibility, grader_thresholds),
-- falling back to repo defaults when absent. Calibration sessions record
-- best/worst picks over the user's real agent-generated rows; the fit step
-- turns them into weights. Nightly learning nudges weights from real
-- approve/reject actions within capped steps.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.calibration_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('content','lead','visibility','task','guest')),
  shown_profiles jsonb NOT NULL,          -- [{item_id, profile:{attr: level}}, ...]
  best_id text NOT NULL,
  worst_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calibration_responses_domain_idx
  ON public.calibration_responses (domain, created_at);

ALTER TABLE public.calibration_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_calibration_responses"        ON public.calibration_responses;
DROP POLICY IF EXISTS "service_role_all_calibration_responses" ON public.calibration_responses;
CREATE POLICY "anon_read_calibration_responses"        ON public.calibration_responses FOR SELECT TO anon USING (true);
CREATE POLICY "service_role_all_calibration_responses" ON public.calibration_responses FOR ALL    TO service_role USING (true) WITH CHECK (true);
