# PR 7: living agent_plans + unified Decisions Waiting view

Part of the mind/make OS rebuild (see `OS-PROGRESS.md` in workspace memory).

## What ships

### Schema
- **`decisions_waiting` Postgres view**: union of waiting work across `tasks`, `guests`, `content_ideas`, `leads`, `visibility_targets`. Each row has `kind`, `id`, `title`, `description`, `agent`, `status`, `priority`, `sort_at`, `url`, `source_table`, `meta` (jsonb). The view is the canonical source for "things waiting on Krish" so Agatha's Telegrams and the Control Center Home tab agree on the same number.
- **`refresh_agent_plans()` RPC**: for each agent_plans row, computes 7-day activity (successful_runs, failed_runs, tasks_completed, tasks_open, silent_failures) from `workflow_runs`, `tasks`, `silent_failures`, and appends a "Snapshot YYYY-MM-DD: ..." line into `next_milestone`. Sets `updated_at` + `last_rendered_at`. Automatically fills `blockers` when silent failures or all-failed runs are detected.

### n8n
- **Agatha | Weekly Plan Refresh** (`qVPnkKsDRCiTvtu5`, active). Schedule: Monday 09:00 UTC. Calls `refresh_agent_plans` RPC, parses results, Telegrams Krish with on-track / blocked counts and blocker details.

### Frontend
- **`useRealtimeDecisionsWaiting`**: lib-singleton hook that fetches `decisions_waiting` and subscribes to realtime channels on all 5 source tables. Re-fetches on any change. Sorts client-side by priority then sort_at.
- **`DecisionsWaitingPanel`**: renders on Home (desktop + mobile). Shows top 8 items with kind badges, agent, priority pill (high / urgent / overdue), title, description excerpt, and an Open link (when url present) or View button.

## Why this matters

Before PR 7 the OS had two truths: Agatha aggregated waiting work for Telegram one way, the Control Center rendered another way. Counts diverged. After PR 7 there is one query that produces one number, so the two surfaces stay in sync.

Before PR 7 `agent_plans` was frozen at 2026-04-22 (most agents) / 2026-04-14 (Felix, Vera, Nova, Nell). `refresh_agent_plans` runs every Monday and stamps a real activity snapshot per agent, with auto-blocker detection from `silent_failures` and `workflow_runs`.

## Note on LLM-driven reflection

The brief calls for Sonnet 4.6 per-agent reflection over last week's snapshot. The deterministic RPC ships first as the reliable baseline (cites real numbers, fills blockers from telemetry). LLM-driven refinement of `objective` text is a follow-up for the Agatha workflow.

## Acceptance tests (run post-merge against preview)

1. Open Home: `DecisionsWaitingPanel` renders with at least 60 items (mix of tasks, ideas, leads, guests, visibility).
2. Click an item with a url: opens in new tab. Click an item without a url: navigates to the appropriate tab.
3. Resolve a task in the Control Center; within 5 seconds the panel re-fetches and the item disappears.
4. Manually call `SELECT public.refresh_agent_plans();`: all 14 `agent_plans` rows have `updated_at` within the last minute, each `next_milestone` ends with a "Snapshot YYYY-MM-DD: ..." line.
5. The next Monday 09:00 UTC tick: the Agatha workflow fires and Krish receives a Telegram summary.
