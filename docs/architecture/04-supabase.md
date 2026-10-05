# Supabase: reference detail

> **Reference detail for section 4 (subsections 4.1 to 4.11 keep their numbers) of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- "~68 tables/views": the live schema held 241 tables and 38 views on 2026-10-05. Count from `information_schema.tables`, never from this file.
- `venture_registry` is not 3 rows. Read it live; the slug spellings a product carries are mapped in `src/lib/portfolio.ts`.
- Buyer titles live in `product_icp` only (core section 4 and 0a.6). Nothing here supersedes that.
- The `decisions_waiting` branch list in 4.7 is dated; the latest view definition in `supabase/migrations/` is the truth.

---

## 4. Supabase - single source of truth (~68 tables/views)

Every piece of OS state lives in one of these tables. Categorised by change rate and role. Full schema in `docs/DATABASE.md`. RLS is enabled on every table.

### 4.1 Identity & rules (rare changes)

| Table | Purpose | Notes |
|---|---|---|
| `agents` (14 rows, 12 active) | Per-agent identity + brief_content + KPIs | `brief_content` is the canonical operating manual - rendered to `skills/agent-{id}/SKILL.md` every 15 min |
| `agent_capabilities`, `api_registry`, `api_endpoints`, `apify_actor_registry` | What agents can do, what APIs exist, registered scrapers | |
| `standards_registry` (~170 rows) | Behavioural rules enforced fleet-wide (V-001, GIT-001, MT-003, PUB-001, …) | Rendered nightly to `hot/standards-digest.md` |
| `ventures` (8 active) | Portfolio metadata | See §11 |
| `venture_registry` (3 rows) | Active venture surfaces for multi-tag leads/guests (`mindmake`, `signal_noise`, `builder_economy`) | Drives per-venture lanes in the Leads tab and the venture chip on LeadCard |
| `completeness_contracts` (6 seeds) | Per-workflow output contracts - Tier 1 of the self-healing system | Shape: `{workflow_id, expected_min_rows, expected_columns, freshness_window_hours}` |

### 4.2 Plans & work in flight (weekly to daily changes)

| Table | Purpose |
|---|---|
| `agent_plans` (14 rows) | One sprint plan per agent - `current_phase`, `objective`, `blockers`, `next_milestone`, `progress_pct`, `doc_link`, `last_rendered_at`. Refreshed weekly by `Agatha Weekly Plan Refresh` (Mon 09:00 UTC) via `refresh_agent_plans()` RPC + Sonnet 4.6 |
| `tasks` | The unit of action - `id`, `title`, `agent`, `status` (`waiting`/`active`/`in_progress`/`blocked`/`done`/`pending-agatha-review`/`pending-review`/`paused`/`superseded`), `workstream`, `created`, plus `lever_score` + `est_hours_to_revenue`, plus **`concept_id text`** (backfilled for `Outreach:%` titles, indexed). CHECK constraint `tasks_status_check` enumerates the status values |
| `goals` | **The one goal table, four horizons** (`os` / `mid_term` / `weekly` / `venture_objective`), laddered by `parent_id`, one version of each enforced by unique index, staleness per horizon via `goals_health`. See §0a.2. Historically this held only flat venture objectives. Multi-week unlocks scoped to a venture (`venture` column), with status (`proposed`/`active`/`paused`/`done`/`dropped`), priority, definition_of_done, why_now, target_horizon, primary/secondary KPI, `is_auto` (Agatha auto-decomposes), `source` (`krish_declared`/`marcus_nominated`/`agatha_decomposed`). The 8 April chore rows live in `goals_archive_2026_04`. FK from `agent_plans.weekly_goal_id` makes this the parent objective every agent loads on wake (CLAUDE.md Step 3b) |
| `milestones` | Week-sized chunks of an objective. FK to `goals(id)` ON DELETE CASCADE. Status (`proposed`/`accepted`/`active`/`done`/`dropped`), source (`marcus_proposed`/`krish_authored`/`krish_tweaked`/`agatha_decomposed`), `sequence` (order within objective), `est_deep_work_hours`, `marcus_reasoning`. Marcus proposes for non-auto objectives; Krish accepts/tweaks/replaces/rejects; Agatha auto-creates for `is_auto=true` objectives. Tasks attach upward via `tasks.milestone_id` (nullable; null is legitimate for tactical work) |
| `goal_agent_contributions` | M:n bridge: an objective lists which agents contribute and what each contributes (`contribution_note`). Complements the 1:1 `agent_plans.weekly_goal_id` pointer with the many side |
| `workstreams`, `workstream_contexts` | Workstream definitions + rolling context |
| `opportunities`, `sequences`, `contacted_persons` | Deal pipeline + outbound sequences + CRM log |
| `leads` | Sales pipeline unit. CHECK constraint `leads_status_check` permits exactly: `new`, `enriching`, `ready`, `contacted`, `conversation`, `closed_won`, `closed_lost`, `superseded`, plus `churned`. Columns include `assignee_agent`, `fit_score`, `attainability_score`, `icp_score` (legacy), `icp_scores` (jsonb, per-venture), `tags` (text[]), `primary_venture` (FK → venture_registry), `tier`, `why_relevant`, `primary_tension`, `next_step`, `follow_up_at`, `promoted_task_id`, `deep_enriched_at`, **`enrichment_status`**, **`last_emailed_at`**, **`last_email_draft_id`**, **`last_email_draft_url`**, **`concept_id text`** (indexed), plus the audience-pipeline columns `audience_sources` (text[]), `churned_at`, `audience_synced_at`, and `source_type` (which now also permits `audience`) - see §4.11 |
| `guests` | Podcast guests for Built conversations, carried on the Signal & Noise feed. Columns: `podcast_target` (`builder_economy`/`signal_noise` - underscore form, not hyphen), `status` (allowed: `scouted`/`enriched`/`pitched`/`responded`/`scheduled`/`confirmed`/`recorded`/`published`/`dropped`), `target_type` (`podcast_guest`/`press_target`/`dual`), `pitch_draft`, `suggested_angles` (jsonb), `scheduled_task_id`, `deep_enriched_at`, `cascade_fired_at`, **`last_outreach_at`**, **`concept_id text`** (indexed). `source` constrained to `'manual'/'sheet_import'/'nell_outbound'/'referral'/'migration'`. |
| `visibility_targets` | Speaking, CFP, press, and PR opportunities. Columns: `title` (not `name`), `type` (allowed: `cfp`/`conference`/`podcast`/`newsletter`/`guest_appearance`/`press_relationship`/`speaking`/`other`), `status` (allowed: `sourced`/`queued`/`applied`/`accepted`/`rejected`/`done`/`dropped`), URL fields `source_url` + `event_url` + `cfp_url`, deep enrichment fields (`organizer`, `audience_*`, `past_speakers`, `cfp_requirements`, `proposed_talk`, `strategic_value`, `angle`, `effort_estimate`, `risk_notes`, `next_actions`), `applied_at`, `rejected_at`, **`concept_id text`** (indexed, non-partial unique). Written by Nova Visibility Sweeper (Mon 11:00 UTC) for events, by Nell Guest Scout router for press_relationship rows, and by Nova Visibility Deep Enrich for URL+enrichment on retry sweep. |
| `nell_rejected` | Silent-skip audit log for Nell's editorial-bar quality gate. Columns: `name`, `source_url`, `source`, `reason`, `raw_data`, `created_at`. RLS on (anon read, service write). Records every candidate Nell rejects - HN-username pattern, no-contact, below-bar - so the bar is observable without surfacing junk to Triage |
| `content_ideas` | Cleo's idea backlog - written by Capture Idea + Layer 1 Signal Inbox + Guest Confirmed Cascade + the Inspiration/Synthesis pipelines + lane sourcing. Carries `concept_id text`, `pillar_id`, `lane`/`lane_slot`/`cadence_due_at`, `parent_idea_id`, `source_url`, `body`, `brand_fit_score`, `quality_score` (green/amber/red, auto-populated by the auto-score trigger), `transformed_outputs` (jsonb), and `meta` (jsonb - Content Engine state: `revisions`/`challenges`/`standards`/`cleo_pushes`, see §5.7). The `trg_autoscore_content_idea` trigger scores the first draft via pg_net → `/score`. Content Engine v2 makes this table the ambient Feed: + `horizon` (news/evergreen), `expires_at` (Monday purge deadline), `shift_id` (evidence link, purge-immune), `library_at` (graduated), `source_type` widened with `pool_headline`. See §5.8. |
| `shifts` | Content Engine v2 persistent register of macro movements: `slug` identity (stable across weeks), `momentum` + `momentum_history` (per-week `{week, momentum, day_span, source_count, recent_count}`), `provenance` (`reconstructed`/`lived`/`mixed`), `status` (`proposed`/`active`/`fading`/`retired`/`library`), embedding for register-matching, last Krish `decision`. See §5.8 |
| `shift_evidence` | Dated receipts backing each shift: `occurred_on`, `headline`, `source`, `url`, `provenance`, `week_label`. Append-only, unique on shift + day + headline; quiet weeks are simply absent, never faked |
| `weekly_briefs` | Week-keyed brief object (`week` like `2026-W28`, unique): `sections` jsonb, `body_md` (canonical markdown master), `versions` (append-only), `formats` (per-channel fan-out ledger: doc URLs + timestamps), `stats`, lifecycle timestamps per step (`assembling`→`ready`→`in_review`→`approved`→`pushed`→`sent`→`archived`) |
| `content_decisions` | The finite typed weekly content queue: `week`, `kind` (`brief_review`/`shift_proposal`/`shift_fading`/`graduation`/`purge_preview`), `ref`, `payload`, `status` (`pending`/`done`/`dismissed`), `resolution`; unique on (week, kind, ref). Feeds the Content tab queue + the `decisions_waiting` view (§4.7) |
| `growth_touchpoints` | The ICP touchpoint map, the spine of the Growth tab's Map section (30 seeded rows across 5 products): `product_slug`, `icp_trigger`, `channel` (seo/geo/social_organic/social_paid/substack/partner/community/product/podcast/maven), `watering_hole`, `cost_efficiency_score` (1-10, rescored by the council), `coverage_status` (unaddressed/in_progress/covered/retired), `owner_agent`, `rationale`, `evidence` jsonb (answered assumptions land in `evidence.resolved_assumptions`), `assumption_flag` (the open question the row is still guessing at). `content_ideas.touchpoint_id` FKs here |
| `growth_creative_queue` | The Higgsfield creative board: `product_slug`, `touchpoint_id`, `title`, `stage` (brief/script/producing/produced/posted/dropped), `brief`, `script`, `shot_notes`, `magic_sentence`, `target_account`, `asset_url`, `posted_url`, `batch_week` (the Monday that owns the 3 to 5 weekly cap), `created_by` |
| `growth_council_reviews` | Weekly growth council output, one row per product per week (unique on week_start + product_slug): `findings` jsonb, `kill_list`, `double_down`, plus Krish's `krish_decision` and `decided_at` written from the Growth tab's Council section |
| `growth_geo_probes` | Every answer-engine probe, for every subject (extended in place 2026-09-09, never a sibling table): `product_slug` (a Growth slug for a venture, the subject slug otherwise), `subject_id` FK, `subject_kind` (venture/prospect/aspiration), `run_id`, `query_id`, `question`, `engine` (chatgpt/perplexity/claude/google_aio/grok), `answer_snapshot`, `we_cited`, `competitors_cited` jsonb, `touchpoint_id`, `run_at`. Written by the AEO engine through `api/aeo/ingest.ts` and, until retired, by the Monday `api/growth/geo-probe` cron. The citation rate is derived from these rows, never stored |
| `growth_aeo_subjects` | The registry of what the AEO research machine studies (2026-09-09): `kind` (venture/prospect/aspiration), `slug`, `name`, `domains[]`, `competitor_domains[]`, `icp_line`, `seed_topics[]`, `never_say[]`, `product_slug` (ventures only, unique), `room_target_id` (prospects only, FK `pilot_deals`), `active`, `notes`. Five ventures seeded from the old `OUR_DOMAINS`; prospects and aspirations are Krish's to add. Edited through `api/aeo/subjects.ts`; the engine reads it through `api/aeo/context.ts` and holds no list of its own |
| `growth_aeo_queries` | The scored query corpus, one row per query per subject per week (unique on subject_id + week_start + query_id): `query`, `source` (transcript/gap/seed/striking_distance/watch_carry/room_signal), `demand_score` 0 to 100 with `demand_basis` jsonb (llm_demand, transcript_evidence, rising_volume, and labels saying they are proxies), `call_evidence` jsonb (paraphrases and an opaque `call_ref`, never a name or a quote), `gap` jsonb (engines where we are cited, competitor domains cited instead), `trend` (new/up/flat/down), `status` (watch/recommend/drop), `touchpoint_id`, `run_id` |
| `growth_aeo_digests` | The weekly read, one per subject per week (unique on subject_id + week_start): `themes` jsonb and `themes_status` (ok/no_calls/no_attributed_calls/fireflies_unavailable/not_applicable, said in words on the tab), `strongest_signal`, `recommendations` jsonb (title, target_query, query_id, angle, evidence, engines, demand, plus `content_idea_id` and `dismissed_at` written by Control Center), `watch_list`, `competitor_gap`, `playbook` (aspirations: which of their pages get cited), `approach_hook` (prospects: one cited opening line), `stats` (queries, probes, cost_usd, engines, transcripts, digest_writer), `run_id` |
| `aeo_commands` | The Run-now ledger, the twin of `hunter_commands`: `subject_id` (null means every subject), `state` (queued/running/done/failed/superseded), `requested_at`, `started_at`, `finished_at`, `run_id`, `result`, `error`. One queued row per key (partial unique index); service-role only, read through `api/aeo/run.ts` |
| `growth_social_accounts` | The account inventory behind each channel (unique on product_slug + platform): `platform`, `handle`, `profile_url`, `status` (planned/live/retired), `notes`. A planned account cannot carry a covered touchpoint |

### 4.3 Customers, revenue, bets

| Table | Purpose |
|---|---|
| `customers` | Cross-product customer ledger. `customer_kind` enum (`paid`/`free_signup`/`trial`/`waitlist`/`churned`), `customer_product` enum (now includes `mindmake` + `publication` alongside the builder products - see §4.11), `mrr_usd`, `stripe_customer_id`, dedupe indexes. Plus 4 attribution columns (`attribution_lead_id`, `attribution_task_id`, `attribution_channel`, `attribution_confidence`). Plus **`needs_outreach_at`**, **`last_emailed_at`**, **`last_email_draft_id`**, **`last_email_draft_url`**. The `trg_enforce_audience_invariant` trigger fires on insert/update of `kind` (see §4.11). |
| `customer_contacts` | One row per customer conversation. Mined by Marcus for `customer_voice` themes from the last 7 days. Drives the Customer Council card on the Customers tab |
| `bets` | Falsifiable business hypotheses - `title`, `hypothesis`, `time_box_days`, `est_mrr_impact_usd`, `status` (`live`/`won`/`lost`/`partial`), `learning`, `actual_mrr_impact_usd`. 90-day hit-rate computed in the Bets tab |
| `business_metrics` | Revenue MTD, pipeline value, content metrics |
| `acquisition_sends` | L1 send ledger for the Acquisition OS (§11.5). One row per outbound nurture message: `lead_id` FK, `lane`, `frame_version`, `touch_number`, rendered subject/body, `status` (`queued`/`approved`/`sent`/`rejected`/`suppressed`/`failed`), `approval_task_id` (the `send-<id>` tasks row Krish marks done to approve), `resend_id`. Unique on (lead, frame, touch) = idempotency. Read by the `acquisition_capture_to_paid` view (weekly captures vs paid per lane; Leo's Friday Pulse renders it) and by Vera's weekly autonomy-demotion check |

### 4.4 Operational firehose (high write)

| Table | Purpose |
|---|---|
| `workflow_runs` | Every N8N workflow writes a heartbeat per execution - primary fleet-health signal |
| `audit_log` | Append-only audit trail of agent runs + Krish actions. Event types include `concept_closed` and `concept_reopened`. The `status_change_log` table (§4.10) is the dedicated channel for row-level status transitions |
| `feedback_queue` | Krish's rejections + comments - fuel for the learning loop (consumed by Vera Feedback Aggregation Sun 06:00 UTC) |
| `corrections` | Patterns Vera extracts from `feedback_queue` (≥3 matches, confidence > 0.85) AND from `silent_failures` via Failure Pattern Sweep |
| `silent_failures` | Tier 1–4 of the self-healing system. Rows written by completeness gates + Silent Success Detector + Critical Infrastructure Monitor; resolved by humans or grouped into `corrections` by Vera |
| `learning_events` | Self-improvement loop events, both directions: corrective (`violation`) and generative (`win` / `win_pattern`, written when Krish approves an induced skill) |
| `standards_efficacy` | How well each standard is being followed |
| `system_health` | Per-component infra signals |
| `home_intelligence` | The Control Center home feed - `summary`, `metrics`, `external_signals`, `customer_signals`, `customer_voice`, plus Marcus-COO surfaces (`daily_brief`, `weekly_retro`, `monday_premortem` + their `*_at` and `*_ack_at` timestamps). All structured fields are JSONB |
| **`email_drafts`** | One row per Gmail draft created via the Cleo Email Draft workflow. Columns: `id`, `entity_type` (`lead`/`customer`/`guest`), `entity_id`, `gmail_draft_id`, `gmail_draft_url`, `subject`, `body_html`, `recipient_email`, `intent`, `created_at`, `sent_at` (null until manually sent). Idempotency on `(entity_type, entity_id, intent)` within 24h. |

### 4.5 Agent-specific scratchpads

`marcus_synthesis`, `maya_budget_state`, `maya_competitive_changes`, `maya_reddit_accounts`, `maya_striking_distance`, `hunter_search_urls`, `hunter_seen_roles`, `kai_workflow_snapshots`, `vera_audit`, `zara_signals`, `product_health`, `competitor_health`.

(`nova_target_conferences` and `nell_candidates` were dropped after their data migrated to `visibility_targets` and `guests`. References in any doc, brief, or workflow are stale.)

### 4.6 System & sync plumbing

`approvals`, `pending_flags`, `sync_queue`, `google_drive_sync`, `schema_migrations`, `system_improvements`, `system_config`, `crons`, `memory`, `plan_execution`, `skill_deliveries`, `workflow_proposals`, `skill_proposals` (the success-induction approval queue, see §8.7), `credential_health`, `credential_expiry`, `fleet_drift_report`, `vera_gaps` (the Vera gap-closure ledger - weekly audit findings → owned tasks, see §8.8.7).

### 4.7 The `decisions_waiting` view

Postgres view. Unions ten source tables (content_decisions joined 2026-07-10) into a single uniform shape (`{kind, id, title, description, agent, status, priority, sort_at, url, source_table, meta, route_target}`) so the Control Center Home tab can render one panel covering every kind of thing waiting on Krish:

| `kind` | Source | What it surfaces |
|---|---|---|
| `task` | `tasks` not yet krish-reviewed (`status ∈ waiting/in_progress/blocked/new`, not buried), and hides tasks whose `due_date` is in the future (defer is honest: off the plate until the date, then back) | Decisions on individual tasks |
| `lead` | `leads` (`status ∈ new/ready`, green/amber, not buried) | Enriched leads awaiting promote/reassign/draft-email |
| `guest` | `guests` (`status ∈ scouted/researched/pitched/enriched`, not buried) | Guests with pitch_draft + suggested_angles ready for review |
| `visibility` | `visibility_targets` (live, green/amber, not buried) | Speaking/PR targets ready for review |
| `idea` | `content_ideas` (narrowed 2026-07-10 to review-state, non-pool ideas only; not buried) | Captured ideas awaiting greenlight |
| `correction` | `corrections` where `status='analyzed' AND approval_state='pending'` | Vera's proposed brief edits (corrective loop) awaiting approve/reject |
| `inbox_returned` | `tasks_inbox` where `status='needs_krish'` | Krish-captured inbox items routed back for a decision |
| `skill_proposal` | `skill_proposals` where `status='proposed'` | Induced skills Vera drafted from clustered wins (generative loop) awaiting approve/reject |
| `vera_gap` | `vera_gaps` where `status='open' AND cycles_open >= 2` | Workflow/quality gaps Vera flagged across ≥2 weekly audits without closure, escalated to Krish (see §8.8.7) |
| `content_decision` | `content_decisions` where `status='pending'` | Typed weekly content rulings (brief review, shift proposals, fading shifts, graduations, purge preview); routes to Content (see §5.8) |

The `meta` JSONB carries the per-kind enrichment (pitch_draft preview, suggested_angles, tier, fit_score, confidence, skill body preview, etc.) so the panel renders rich previews without a join. The `correction` and `skill_proposal` branches are the two arms of the learning loop (corrective and generative), both surfaced for one-tap approval in the same Home pane (see §8.7).

A synthesis-time `LEFT JOIN concept_decisions` on each UNION branch (to hide rows whose concepts Krish has already closed) is not yet wired - see §17.7. Today `close_concept` works at the row-status level (tasks → `superseded`, leads → `closed_lost`), which removes them from the underlying source filters indirectly.

### 4.8 RPCs worth knowing

| RPC | Purpose |
|---|---|
| `refresh_agent_plans()` | Refreshes all 14 `agent_plans` rows. Called weekly by Agatha Weekly Plan Refresh |
| `audit_silent_failures()` | Used by Silent Success Detector (8h cron) to detect ok-but-empty runs |
| `audit_critical_infra()` | Used by Critical Infrastructure Monitor (3h cron) to detect credential/RLS failures |
| `audit_failure_patterns()` | Used by Vera Failure Pattern Sweep (Sun 07:00 UTC) to cluster silent_failures into corrections |
| **`induct_skill_candidates()`** | Used by Vera Success Induction Sweep (Sun 08:00 UTC) to cluster evidence-backed task wins by [agent, task_type] and return clusters at/above the volume threshold (`system_config.skill_induction_min_cluster_size`, default 3) that do not already have a live or completed skill. Self-gating: returns zero rows until a real win corpus exists |
| **`bump_skill_usage()`** | Marks a completed induced skill as used when its pattern produces a fresh win after go-live (the usage proxy for decay). Run weekly by the Success Induction Sweep |
| **`flag_decayed_skills()`** | Flags completed skills unused for N days (`skill_induction_decay_days`, default 45) or followed by a same-pattern rejection, for pruning. Flags only: actual retirement stays approval-gated |
| **`mark_entity_emailed(entity_type, entity_id, draft_id, draft_url)`** | Idempotent helper called by the Cleo Email Draft workflow to stamp `last_emailed_at`, `last_email_draft_id`, `last_email_draft_url` on the relevant entity (lead/customer/guest) atomically |
| **`compute_concept_slug(p_name text) → text`** | Deterministic slugifier (lowercase, btrim, collapse non-alphanumeric to `-`). Used by the leads/tasks backfill and by any generator that needs to assign `concept_id`. IMMUTABLE so the planner can use it in expression indexes if needed |
| **`close_concept(p_concept_id text, p_reason text, p_decided_by text DEFAULT 'krish') → jsonb`** | Upserts a `concept_decisions` row with `decision='closed'`, cascades status updates across tagged rows (tasks → `superseded`, leads → `closed_lost`), records an `audit_log` event of type `concept_closed`, and propagates `app.changed_by` + `app.source='rpc:close_concept'` into the trigger-emitted `status_change_log` rows so every cascading status change is attributed. Returns `{ok, concept_id, tasks_closed, leads_closed, decided_at}`. Re-runnable: ON CONFLICT (concept_id) updates the decision and clears `superseded_at`; already-terminal rows are not re-stamped |
| **`route_vera_gaps() → jsonb`** | Routes the latest weekly `vera_audit` findings (non-`errors` bands) into owned, tracked tasks. Dedupes by fingerprint `gap:<slug(subject)>:<band>`, derives owner via `vera_gap_owner` (cadence/liveness → arlo), upserts `vera_gaps`, creates `tasks` rows with `krish_reviewed=true` (kept out of the generic `decisions_waiting` task branch until escalated), increments `cycles_open` once per new weekly audit, reopens recurred gaps. See §8.8.7 |
| **`reconcile_vera_gaps() → jsonb`** | Auto-closes `vera_gaps` the newest weekly audit no longer flags (task → `done`). Absorbs Vera false-positives (e.g. long-cadence workflows flagged as stalled). Runs right after `route_vera_gaps` each cycle |
| **`vera_gap_owner(p_subject text, p_band text) → text`** | Band-aware owner derivation for gap routing. `cadence`/`errors` (liveness) bands → `arlo` (mechanical-liveness owner, §8.8.6); future quality/standards bands → the workflow's name-prefix agent, default `agatha` |
| **`reopen_concept(p_concept_id text, p_reason text, p_decided_by text DEFAULT 'krish') → jsonb`** | Marks the live `concept_decisions` row as `superseded_at = now()`, writes an `audit_log` event of type `concept_reopened`. Does NOT flip terminal rows back to non-terminal - history is preserved; to re-engage, write a NEW row with the same `concept_id` and the ledger records the concept is once again open |
| **`log_status_change()` (trigger function)** | Internal - fires AFTER UPDATE OF status on tasks and leads. Reads `current_setting('app.changed_by', true)` and `current_setting('app.source', true)` so any caller (RPC, edge function, agent code) that sets those before its UPDATE gets proper attribution. Falls back to `'system' / 'direct_update'` |

### 4.9 RLS posture

Every table has RLS enabled. Pattern: `anon` reads (for Control Center dashboards) + `service_role` writes (for agents). N8N agents authenticate as `service_role` through the `Supabase account 2` credential. Adding a table without RLS will fail Vera's audit. The `concept_decisions` and `status_change_log` tables follow the same posture.

### 4.10 Closure architecture

**Motivation.** Before this, closing a row killed the row but not the concept. Disney existed as both a `tasks` row (`superseded`) and a `leads` row (`ready`); closing the task did nothing to the lead, and Marcus's daily brief kept surfacing Disney as the top revenue card from the lead. Same conceptual work, two surfaces, no shared identity, no durable "Krish decided this is done" record. (For what is live versus not-yet-built across this architecture, see §17.7.)

The architecture has four parts:

| Part | Where | What it does |
|---|---|---|
| 1. **Concept identity** | `concept_id text` on `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas` (all indexed; backfilled) | A stable, human-readable slug like `concept:org:disney` that ties rows representing the same conceptual work across tables. Extension to `customers` and `opportunities` is not yet done (see §17.7) |
| 2. **Decision ledger** | `concept_decisions` table (PK = concept_id) | Durable record of every concept-level decision Krish has made. Columns: `concept_id`, `decision` (`closed`/`killed`/`paused`/`reopened`/`completed`), `decided_at`, `decided_by`, `reason`, `superseded_at`, `superseded_by_decision_id`. ON CONFLICT (concept_id) DO UPDATE: re-running `close_concept` for the same concept replaces the prior decision (with reason and timestamp), and clears `superseded_at` if previously reopened. Reopens preserve history via `superseded_at` |
| 3. **Status-change audit trail** | `status_change_log` table (bigserial PK) + AFTER UPDATE triggers on tasks and leads | Every status transition is logged with `(table_name, row_id, concept_id, old_status, new_status, changed_at, changed_by, source)`. Attribution comes from `current_setting('app.changed_by')` and `current_setting('app.source')` - RPCs set these before their UPDATE; direct UPDATEs fall back to `'system' / 'direct_update'` |
| 4. **Cascading-closure RPC** | `close_concept(concept_id, reason, decided_by)` | Single entry point for "this concept is done." Upserts the ledger row, cascades terminal status to every tagged row, writes the audit_log event, and (via triggers) emits the status_change_log entries. `reopen_concept` is the inverse for the "we changed our mind" case |

**Terminal status convention.** Concept closure cascades to **terminal status values that are already in the live CHECK constraints**, not to runbook-imagined values:

- `tasks` → `'superseded'` (skipping rows already in `{'done','superseded','killed','archived','completed'}`)
- `leads` → `'closed_lost'` (skipping rows already in `{'closed_won','closed_lost','superseded'}`)

The original closure-architecture runbook used `'dead'` for leads and skipped `('dead','customer','unsubscribed','archived')`. None of those tokens exist in `leads_status_check`, so the architecture canonicalizes on `'closed_lost'` instead - it is already in the constraint's permitted set (lower blast radius, vocabulary already established).

**Attribution convention.** Any caller that wants its identity recorded on the status_change_log entry must:

```sql
SELECT set_config('app.changed_by', '<actor>', true);   -- e.g. 'krish', 'agatha-closure-receiver', 'felix'
SELECT set_config('app.source',     '<source>',  true); -- e.g. 'telegram', 'control-center', 'rpc:close_concept'
-- ...then UPDATE...
```

`close_concept` does this internally with `('krish' or whoever, 'rpc:close_concept')`. The planned Closure Intent Receiver workflow (see §17.7) will do the same with `('agatha-closure-receiver', 'telegram-intent')` or similar.

**Idempotency.** Calling `close_concept` twice for the same concept is safe. First call inserts the decision row and cascades. Second call updates `decided_at`/`reason`, finds the rows already terminal (per the skip-list), and returns `{tasks_closed: 0, leads_closed: 0}` with `ok: true`. The audit_log entry is emitted each time, so re-runs are detectable.

**Canary illustration.** Disney: `concept_id = 'concept:org:disney'` on both rows; `close_concept('concept:org:disney', '...', 'krish')` returned `{tasks_closed: 0, leads_closed: 1}` (task was already `superseded`). The lead transitioned `ready → closed_lost`; `concept_decisions` and `status_change_log` rows both materialised; an `audit_log` event of type `concept_closed` was emitted. `marcus_daily_pull()` then returns zero Disney mentions across all arrays (leads, hot_leads, stale_tasks), so the next Marcus run produces a Disney-free `top_three` by construction.

---

### 4.11 Unified audience pipeline

Every Mindmake property feeds one audience list, and that list flows into the Control Center with a hard paid-vs-free rule. Two databases are involved: the **Mindmake AI app DB** (`<project ref removed>`) where capture happens, and this **OS DB** (`<project ref removed>`) where the Control Center reads. They are different projects, so a bridge carries capture into the OS.

**Capture (app DB `audience_contacts`, enum `lead_source`).** CTRL signups (`track-event` edge fn → `source='ctrl'`), the marketing site (all five capture edge functions via a shared `recordSiteAudienceContact` helper → `source='mindmake_site'`), the Built (`NotifyForm` → `source='builder_economy'`), and Mindmake's publication (Substack CSV import → `source='publication'`). Each row carries `metadata` (capture type, attribution, and `paid` for Substack). A `synced_to_os_at` watermark marks rows the bridge has processed.

**The bridge (OS pulls from the app DB).** The app DB has no outbound HTTP (`pg_net`/`http` absent), so the OS pulls. `pull_audience_contacts(limit)` uses the `http` extension (app DB service key in **Vault**, not `system_config`) to fetch unsynced rows, routes each through `sync_audience_contact(email, name, source, metadata)`, then stamps `synced_to_os_at` back. Scheduling is the **`audience-tick`** OS edge function (verify_jwt=false, `AUDIENCE_TICK_SECRET`-gated) hit by n8n workflow **`System | mind/make OS | Audience Pipeline`** (`7sYzU1FidUo2w1Lh`): `action=sync` every 3h, `action=reconcile` daily 07:30. n8n holds no DB credential; the edge function uses the platform-injected service role.

**Routing rule - payment is the only switch, never both.** `sync_audience_contact`:
- `metadata.paid=true` → upsert a paid `customers` row (product `mm_ctrl` / `publication` / `mindmake`) → **Subscriptions**.
- already a paid customer (guard) → no lead.
- otherwise → upsert a `leads` row with `source_type='audience'`, collapsed by `lower(email)` (the existing `leads_email_dedupe` index), accumulating `audience_sources[]`; `mindmake_site` high-intent captures are `warm`, the rest `watch`.

**Mover (DB trigger).** `trg_enforce_audience_invariant` on `customers` (after insert/update of `kind`): on `paid`, supersede any audience lead for that email; on `churned`, mark a clearly-tagged `status='churned'` lead (`churned_at` set) for re-engagement. This makes never-both self-enforcing regardless of who writes `customers` (Stripe, n8n, manual).

**Reconciler.** `reconcile_audience_invariant()` finds any email that is both a paying customer and an active lead, supersedes the lead, returns counts. Runs daily via the reconcile tick.

**Schema additions.** `leads`: `audience_sources text[]`, `churned_at`, `audience_synced_at`; `leads_status_check` gains `churned`; `leads_source_type_check` gains `audience`. `customer_product` gains `mindmake` + `publication`. RPCs: `sync_audience_contact`, `pull_audience_contacts`, `reconcile_audience_invariant`, `audience_import_proxy` (Substack CSV → app DB importer via http + Vault secret, then sync). Control Center renders audience leads with an 'Audience' source pill, capture-source chips, a Churned badge, and a Substack CSV dropzone (`/api/audience/import-substack` → `audience_import_proxy`).

---
