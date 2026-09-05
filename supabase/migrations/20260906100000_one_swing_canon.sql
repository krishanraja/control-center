-- One swing (2026-09-06): the canon repoints to Krish's ikigai v4.
--
-- Three things happen here, all reversible by status:
--   1. goals, tasks and daily_focus gain a `job` tag: which of the five jobs
--      of the OS a piece of work serves (fill_room, keep_honest, run_room,
--      feed_demand, keep_edge). Nullable, so nothing existing breaks; the UI
--      offers it as chips and api/_goals.ts renders it into the canon block.
--   2. The three pre-ikigai OS goals retire (status 'dropped', never deleted)
--      and the single mission line becomes the OS rung. It is seeded by SQL
--      rather than POST /api/objectives because the goal gate rejects OS titles
--      that open with a task verb, and the mission line opens with "Build".
--      That is deliberate: the gate stays as it is, and this row is the one
--      documented exception (docs/DECISIONS/016-ikigai-v4-one-swing.md).
--   3. system_config.north_star is upserted directly, because the mirror in
--      api/_northStar.ts only runs on API writes and readers outside this repo
--      (agent briefs, n8n) resolve the key on wake.
--
-- Also seeds the three dated keep-him-honest tasks from the Master tab so the
-- OS holds the dates rather than Krish's memory.

-- 1. The job tag ----------------------------------------------------------
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS job text;
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_job_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_job_check
  CHECK (job IS NULL OR job IN ('fill_room','keep_honest','run_room','feed_demand','keep_edge'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS job text;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_job_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_job_check
  CHECK (job IS NULL OR job IN ('fill_room','keep_honest','run_room','feed_demand','keep_edge'));

ALTER TABLE public.daily_focus
  ADD COLUMN IF NOT EXISTS target_1_job text,
  ADD COLUMN IF NOT EXISTS target_2_job text,
  ADD COLUMN IF NOT EXISTS target_3_job text;
ALTER TABLE public.daily_focus DROP CONSTRAINT IF EXISTS daily_focus_job_check;
ALTER TABLE public.daily_focus ADD CONSTRAINT daily_focus_job_check CHECK (
  (target_1_job IS NULL OR target_1_job IN ('fill_room','keep_honest','run_room','feed_demand','keep_edge')) AND
  (target_2_job IS NULL OR target_2_job IN ('fill_room','keep_honest','run_room','feed_demand','keep_edge')) AND
  (target_3_job IS NULL OR target_3_job IN ('fill_room','keep_honest','run_room','feed_demand','keep_edge'))
);

-- 2. The OS rung becomes the mission --------------------------------------
UPDATE public.goals
   SET status = 'dropped', updated_at = now()
 WHERE horizon = 'os'
   AND status = 'active'
   AND id IN ('goal:os:leaders-served', 'goal:os:ops-load', 'goal:os:licensable');

INSERT INTO public.goals (id, title, horizon, status, priority, source, created_by, activated_at, created_at, updated_at)
VALUES (
  'goal:os:mission',
  'Build the company that gives leaders their edge back before what is coming takes it, and sell it at scale with my name on it.',
  'os', 'active', 1, 'krish_declared', 'krish', now(), now(), now()
)
ON CONFLICT (id) DO UPDATE
   SET title = EXCLUDED.title, status = 'active', priority = 1, updated_at = now();

-- 3. The mirror for readers outside the repo --------------------------------
INSERT INTO public.system_config (key, value, updated_at)
VALUES (
  'north_star',
  'Build the company that gives leaders their edge back before what is coming takes it, and sell it at scale with my name on it.',
  now()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 4. The dated commitments, held by the OS ----------------------------------
INSERT INTO public.tasks (title, description, status, owner, priority, workstream, group_label, job, due_date, created)
SELECT v.title, v.description, 'active', 'krish', 'high', 'keep_honest', 'One swing', 'keep_honest', v.due_date, now()
FROM (VALUES
  ('Rerun R12.1 cold',
   'Master Ikigai v4, section 5. Rerun round 12.1 cold. If the same answer wins, the twelve month commitment stands. If anything else comes first, the mission wording is wrong and one more round is owed before anything is sent.',
   timestamptz '2026-09-12 09:00:00-04'),
  ('Read the stop rule',
   'Master Ikigai v4, section 7. Stop rule: fewer than 2 of 25 leaders took a call, or no paid room by today. If it fires, the network advantage is not real for this offer. Record the verdict.',
   timestamptz '2026-10-05 09:00:00-04'),
  ('Day 90 review: score the ledger',
   'Master Ikigai v4, section 6. Score the twelve week scorecard. Decide: raise on the company, or run two more rooms first. Record the decision with rationale and the next revisit date.',
   timestamptz '2026-12-05 09:00:00-05')
) AS v(title, description, due_date)
WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.title = v.title AND t.owner = 'krish');
