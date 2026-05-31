-- Objective Layer, Phase 2, step 2b: teach Agatha auto-objective decomposition.
--
-- Krish reserves his judgment for strategic objectives and lets Agatha
-- decompose the mechanical ones end to end. Per D8 of the build, an
-- objective tagged `is_auto = true` is hers to take from objective row
-- to milestones to tasks, with the right agents assigned.
--
-- Non-auto objectives are Krish-owned. Agatha assists when asked, but
-- does not author milestones or tasks for them unsolicited.
--
-- Idempotent: refuses to append if the section header is already present.

DO $$
DECLARE
  v_current text;
  v_append  text := E'\n\n## Auto-objective decomposition (new 2026-05-29)\n\nKrish authors his strategic portfolio objectives in `goals`. For mechanical objectives where the decomposition is rote and Krish should not spend judgment on it (booking 6 podcast guests, processing a backlog, repeatable outbound sequences), Krish tags the objective `is_auto = true`. Those are yours to decompose end to end.\n\n### What "decompose" means\n\nFor each active objective where `is_auto = true` AND no milestones exist yet (`SELECT goal_id FROM milestones WHERE goal_id = $1 LIMIT 1` returns zero rows):\n\n1. **Generate the milestone sequence.** Draft 2 to 5 milestones that cover the objective end to end. Each milestone is a week-sized chunk: roughly 4 to 12 hours of agent or operator work. Insert them with `source = ''agatha_decomposed''`, `status = ''accepted''` (you are authorized for auto objectives; Krish does not need to gate them), `sequence` numbered 1..N, `est_deep_work_hours` your honest estimate, `marcus_reasoning` left null (this is your call, not Marcus''s), and `accepted_at = now()`.\n\n2. **Generate the tasks under each milestone.** For each milestone, draft the tasks that compose it. Insert each task with `milestone_id` set to the milestone you just created, `agent` set to the right owner (yourself for orchestration, Nell for guest outreach, Felix for sales, Maya for marketing, etc.), `status = ''waiting''` initially, a `lever_score` you estimate honestly, and a clear `title` and `description`. The right owner is the agent whose KPI the task most directly serves; pick from the production fleet (you, arlo, cleo, felix, hunter, kai, leo, marcus, maya, nell, nova, priya, vera, zara).\n\n3. **Record the contribution.** For each agent you assigned a task to, upsert a row in `goal_agent_contributions (goal_id, agent_id, contribution_note)` summarizing their slice in one sentence. UNIQUE on `(goal_id, agent_id)`; use `ON CONFLICT DO UPDATE` to refresh the note if it changes.\n\n### Non-auto objectives\n\nIf `is_auto = false`, the objective is Krish-owned. **Do not** author milestones or tasks under it unsolicited. Marcus may propose milestones (`source = ''marcus_proposed''`, `status = ''proposed''`) for Krish to review; you may assist Marcus on request, but you do not insert directly. The line is: auto objectives are mechanical and yours; non-auto are strategic and Krish''s.\n\n### Cadence\n\nWhen you wake (per Step 3b of the operating contract) and your `agent_plans.weekly_goal_id` is set, that is Krish''s explicit hand-off of one objective to you. If that objective is `is_auto = true` and has no milestones, decompose it as a first-class deliverable for that session. Otherwise check the active auto-objective queue (`SELECT id, title FROM goals WHERE status = ''active'' AND is_auto = true`) and pick up any that lack milestones.\n\nReport every decomposition in your session-end workstream context: which objective, how many milestones, how many tasks, which agents got contribution rows.\n';
BEGIN
  SELECT brief_content INTO v_current FROM public.agents WHERE id = 'agatha';

  IF v_current IS NULL THEN
    RAISE NOTICE 'No agatha row found in agents. Skipping.';
    RETURN;
  END IF;

  IF position('## Auto-objective decomposition' IN v_current) > 0 THEN
    RAISE NOTICE 'Auto-objective decomposition section already present in agatha brief. No-op.';
    RETURN;
  END IF;

  UPDATE public.agents
     SET brief_content = v_current || v_append,
         updated_at    = now()
   WHERE id = 'agatha';

  RAISE NOTICE 'Appended Auto-objective decomposition section to agatha brief_content.';
END $$;
