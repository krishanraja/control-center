-- Phase 6 data re-level + backfill (Krish-approved live data fix).
--
-- 1. Re-level Builder Economy. "Build a repeatable Builder Economy guest pipeline"
--    was pitched at MILESTONE altitude. Promote the real outcome objective —
--    "Launch Builder Economy podcast with guests in the pipeline" — and re-home
--    the pipeline-build milestones under it; the old objective is dropped (not
--    deleted, so it's reversible) and an objective-altitude learning row is
--    recorded.
-- 2. Backfill the two highest-priority objectives that shipped with null
--    primary_kpi / definition_of_done / why_now (lead-nurture + the new podcast).
-- 3. Demote the task-altitude milestone "Consolidate and score all existing
--    leads" (is_accomplishment=false) so it stops masquerading as a weekly move.
--
-- Idempotent: ON CONFLICT / guarded inserts / SET. Safe to re-run.

BEGIN;

-- 1a. Promote the outcome objective at the old one's priority slot (2).
INSERT INTO public.goals
  (id, title, venture, objective_kind, status, priority, definition_of_done, why_now, target_horizon, primary_kpi, is_auto, created_by, source, activated_at)
VALUES
  ('obj:builder-economy:podcast-launch',
   'Launch Builder Economy podcast with guests in the pipeline',
   'builder_economy', 'launch', 'active', 2,
   'Show is live with the first 3 episodes published, a documented repeatable booking workflow, and >=3 guests booked ahead.',
   'The guest-pipeline work only compounds once it ships as a live show — the pipeline is the means, the launched podcast is the outcome.',
   DATE '2026-09-30',
   'First 3 episodes recorded & published; repeatable pipeline feeding >=3 booked guests.',
   false, 'krish', 'krish_declared', now())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  venture = EXCLUDED.venture,
  objective_kind = EXCLUDED.objective_kind,
  status = 'active',
  priority = EXCLUDED.priority,
  definition_of_done = EXCLUDED.definition_of_done,
  why_now = EXCLUDED.why_now,
  target_horizon = EXCLUDED.target_horizon,
  primary_kpi = EXCLUDED.primary_kpi;

-- 1b. Re-home the pipeline milestones + the contributing agent to the new parent.
UPDATE public.milestones
   SET goal_id = 'obj:builder-economy:podcast-launch'
 WHERE goal_id = 'obj:builder-economy:guest-pipeline';

UPDATE public.goal_agent_contributions
   SET goal_id = 'obj:builder-economy:podcast-launch'
 WHERE goal_id = 'obj:builder-economy:guest-pipeline';

INSERT INTO public.goal_agent_contributions (goal_id, agent_id, contribution_note)
VALUES ('obj:builder-economy:podcast-launch', 'nell', 'Source, pitch and book guests; run the repeatable booking workflow.')
ON CONFLICT (goal_id, agent_id) DO NOTHING;

-- 1c. Add the launch-outcome milestone (guarded so re-runs do not duplicate).
INSERT INTO public.milestones (goal_id, title, sequence, status, source, est_deep_work_hours, marcus_reasoning, is_accomplishment)
SELECT 'obj:builder-economy:podcast-launch',
       'Record and publish the first 3 Builder Economy episodes',
       5, 'proposed', 'marcus_proposed', 8,
       'The pipeline only proves out when it produces published episodes; three is the minimum that shows the show is real and repeatable.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.milestones
   WHERE goal_id = 'obj:builder-economy:podcast-launch'
     AND title = 'Record and publish the first 3 Builder Economy episodes'
);

-- 1d. Drop the mis-leveled objective (reversible: status only).
UPDATE public.goals
   SET status = 'dropped'
 WHERE id = 'obj:builder-economy:guest-pipeline';

-- 1e. Objective-altitude learning row (guarded).
INSERT INTO public.feedback_queue
  (source_table, source_id, agent_id, original_agent, original_item_id, vote, reason_code, reason_text, meta, status)
SELECT 'goals', 'obj:builder-economy:guest-pipeline', 'marcus', 'marcus', 'obj:builder-economy:guest-pipeline',
       -1, 'marcus_objective_releveled',
       'Launch Builder Economy podcast with guests in the pipeline',
       jsonb_build_object(
         'original_title', 'Build a repeatable Builder Economy guest pipeline',
         'promoted_to', 'obj:builder-economy:podcast-launch',
         'demoted_reason', 'objective was milestone-altitude; promoted the outcome objective above it',
         'captured_at', now()
       ),
       'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feedback_queue
   WHERE source_table = 'goals'
     AND source_id = 'obj:builder-economy:guest-pipeline'
     AND reason_code = 'marcus_objective_releveled'
);

-- 2. Backfill the under-specified Mindmaker lead-nurture objective.
UPDATE public.goals SET
  primary_kpi = COALESCE(primary_kpi, 'Every existing lead scored and in a live nurture sequence; >=1 booked call from the nurtured queue.'),
  definition_of_done = COALESCE(definition_of_done, 'All leads consolidated & scored, a 3-step nurture sequence live, and the queue producing replies.'),
  why_now = COALESCE(why_now, 'Leads already in hand decay without a nurture engine; standing it up converts sunk sourcing into pipeline.'),
  target_horizon = COALESCE(target_horizon, DATE '2026-06-30')
WHERE id = 'obj:mindmaker:lead-nurture';

-- 3. Demote the task-altitude milestone out of the weekly slate.
UPDATE public.milestones
   SET is_accomplishment = false
 WHERE goal_id = 'obj:mindmaker:lead-nurture'
   AND title ILIKE 'Consolidate and score all existing leads';

COMMIT;
