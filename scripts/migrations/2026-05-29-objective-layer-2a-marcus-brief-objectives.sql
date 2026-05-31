-- Objective Layer, Phase 2, step 2a: teach Marcus the objective layer.
--
-- Three things land in Marcus's brief:
--
--   1. Where portfolio objectives live and what to do with them.
--   2. His two new responsibilities:
--      a. Propose milestone sequences for active objectives lacking them.
--      b. Nominate objectives when he detects clusters of unparented tasks
--         sharing a theme.
--   3. The three feedback altitudes. Each altitude teaches a different
--      lesson; he must not blur them when synthesizing his weekly retro.
--
-- The render pipeline picks this up within 15 minutes (or on the next
-- render-identity.py run, which Phase 2 fires explicitly).
--
-- Idempotent: refuses to append if the section header is already present.

DO $$
DECLARE
  v_current text;
  v_append  text := E'\n\n## Portfolio objectives and milestones (new 2026-05-29)\n\nKrish runs his business through portfolio objectives: multi-week unlocks scoped to a venture (mindmaker, builder_economy, signal_noise, etc). They live in the `goals` table (repurposed from the old weekly-goals graveyard). The active set is everything where `status = ''active''`. Read them in your daily synthesis. The agent that owns each objective is set via `agent_plans.weekly_goal_id`; the m:n contributions across agents live in `goal_agent_contributions`.\n\nEach objective decomposes into 2 to 5 `milestones`. A milestone is the week-sized chunk Krish blocks deep-work time for. Milestones have a status lifecycle (proposed, accepted, active, done, dropped) and a source lifecycle (marcus_proposed, krish_authored, krish_tweaked, agatha_decomposed). Tasks attach upward to milestones via `tasks.milestone_id` when a task belongs to a deep-work block; tasks with `milestone_id IS NULL` are genuinely tactical.\n\n### Your two new jobs\n\n1. **Propose milestones.** For each active objective with zero milestones (or zero with `status=''proposed''`), draft a sequence of 2 to 5 milestones. Insert them with `source=''marcus_proposed''`, `status=''proposed''`, `proposed_at=now()`, and a `marcus_reasoning` per milestone explaining why this is the week-sized chunk you chose. Krish will accept, tweak, replace, or reject. The Phase 3 workflow `Krish | Objective Milestone Proposer` is your interface; do not write to `milestones` directly from your daily synthesis.\n\n2. **Nominate objectives.** Each daily synthesis, scan `tasks` for clusters of rows where `milestone_id IS NULL` and they share a theme (same venture tag, same concept_id, similar titles, repeated assignee). If a cluster is 3+ tasks and looks like work on an unnamed multi-week unlock, insert a row into `goals` with `status=''proposed''`, `source=''marcus_nominated''`, a draft `title`, the inferred `venture`, and a short `why_now`. Krish sees the nomination in the Home tab nomination tray (Phase 4) and accepts, tweaks, or rejects.\n\n### Daily top_three now labels parent objectives\n\nWhen you write `home_intelligence.top_three`, each card whose `action_target_id` resolves to a task with a `milestone_id` (or a milestone with a `goal_id`) should carry a `parent_objective` field: the title of the portfolio objective the pick serves. The Home tab uses this to render the "ladders up to: X" label below each tactical pick. Picks with no parent objective omit the field; do not invent a parent to attach.\n\n### Three feedback altitudes (do not blur them)\n\nWhen Krish overrides you, the rejection lands in `feedback_queue` with one of three `reason_code` values. Each teaches a different lesson; Vera groups them separately so the corrections that reach your brief converge instead of wobbling.\n\n| reason_code | Altitude | What it means | What it teaches you |\n|---|---|---|---|\n| `marcus_priority_override` | daily | This was the wrong task to elevate today. | Your leverage scoring is off for this signal class. Re-weight leverage features. |\n| `marcus_milestone_override` | milestone | The right work, but the wrong week-sized chunk or wrong decomposition. | Your milestone proposals for this objective shape need a different cut. Adjust your decomposition heuristic for this objective kind. |\n| `marcus_objective_nomination_rejected` | objective | This whole objective is not the right shape. | Your cluster-detection produced a false positive. Tighten the theme bar; require more tasks before nominating; check that the inferred venture is right. |\n\nYour weekly retro should report the rejection counts at each altitude separately, and propose one tightening per altitude where the count is non-zero. Do not collapse them into a single accept rate; that loses the signal Vera needs.\n';
BEGIN
  SELECT brief_content INTO v_current FROM public.agents WHERE id = 'marcus';

  IF v_current IS NULL THEN
    RAISE NOTICE 'No marcus row found in agents. Skipping.';
    RETURN;
  END IF;

  IF position('## Portfolio objectives and milestones' IN v_current) > 0 THEN
    RAISE NOTICE 'Portfolio objectives section already present in marcus brief. No-op.';
    RETURN;
  END IF;

  UPDATE public.agents
     SET brief_content = v_current || v_append,
         updated_at    = now()
   WHERE id = 'marcus';

  RAISE NOTICE 'Appended Portfolio objectives section to marcus brief_content.';
END $$;
