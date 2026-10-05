# Data flows: reference detail

> **Reference detail for section 8 of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- 8.4 describes Stripe revenue through the n8n `Stripe | Revenue Intake` workflow. Since 2026-10-05 revenue is read by `api/revenue/sync.ts` over the Stripe organisation key across five accounts, and the verified webhook is `POST /api/revenue/webhook`. The n8n intake's code nodes are disabled.
- 8.6 (content v1) and any flow ending in `Cleo | LinkedIn Distribution` or a Google Doc are retired.
- The guest briefing now lands in `guests.briefing_md` and opens in Control Center, not in a Doc (2026-10-05).
- Any reference to the "Mindmake Strategy Day", the offer ladder or advisory deposits is retired (2026-08-29 rebrand; Stripe catalogue archived 2026-10-05).

---

## 8. Data flows that matter

Each subsection traces one Krish-facing outcome end-to-end. Use these as the canonical truth when reasoning about how a click becomes a row becomes an action.

### 8.1 Lead flow - from capture to enriched lead to email draft

> **HISTORICAL for advisory (2026-07-10).** The `Nell | Lead Document Ingest` ingress below (`/webhook/lead-doc-ingest`) was unpublished 2026-07-10 with the advisory retirement, so the CSV-drop path is no longer live. The rest of the flow (deep enrich, draft email, promote, follow-up, close concept) remains live for product-lane leads (capture, audience, guest routing).

```
Krish uploads CSV via Control Center LeadImportDropzone  [HISTORICAL: ingress unpublished 2026-07-10]
    → POST /webhook/lead-doc-ingest  (Nell Lead Document Ingest)
        → Claude Extract Leads (gpt-4.1-nano, schema:
            fit_score, attainability_score, icp_scores (per-venture jsonb),
            tags (text[]), primary_venture, why_relevant, primary_tension,
            assignee_agent)
            → Shape rows → Supabase upsert leads
                → rows visible immediately in Leads tab, in the
                    primary_venture lane, routed to assignee_agent

Krish clicks "Deep enrich" on a LeadCard
    → POST /api/leads/:id/enrich
        → POST /webhook/lead-deep-enrich  (Agatha Lead Deep Enrich)
            → Fetch Lead → Brave Search → Sonnet Enrich → Parse →
                PATCH leads (fit_score, icp_scores, attainability_score,
                why_relevant, primary_tension, next_step,
                deep_enriched_at, enrichment_status='enriched')

Krish clicks "Draft email" on a LeadCard or in the lead DetailSheet
    → POST /api/leads/:id/draft-email
        → POST /webhook/cleo/email-draft  (Cleo | Email Draft)
            → Sonnet 4.6 drafts subject + body in Krish voice
            → Gmail OAuth: drafts.create
            → INSERT email_drafts row
            → mark_entity_emailed(lead, :id, draft_id, draft_url)
            → response: { ok, draft_id, draft_url, subject, body_preview }

Krish clicks "Promote"
    → POST /api/leads/promote
        → creates tasks row owned by lead.assignee_agent,
            sets leads.promoted_task_id (idempotent)

Krish clicks "Schedule follow-up (1d/3d/7d/14d)"
    → writes leads.follow_up_at
        → Marcus's next synthesis surfaces it in external_signals[]
            with urgency='high'

Krish clicks "Close concept"
    → POST /api/concepts/:concept_id/close
        → close_concept(concept_id, reason, 'krish-via-control-center')
        → cascade: lead → closed_lost; any tagged tasks → superseded
        → ledger + audit_log + status_change_log all populated
```

### 8.2 Guest flow - from sheet drop to confirmed guest to promo drafts

```
Two ingress paths:

  A. Sheet drop (curated bulk import)
     Krish uploads/pastes guest list via Control Center GuestImportDropzone
        → POST /webhook/guest-doc-ingest  (Nell Guest Sheet Bulk Import)
            → Anthropic Sonnet 4.6 extract → Parse + Validate
                → Fetch existing guests → dedupe by email/name
                    → Insert guests (status='enriched', target_type='podcast_guest')

  B. Outbound scout (Mon/Wed/Fri ET, Nell Guest Scout `8DlMfyTYsbnQGYR2`)
     Polls Product Hunt + HN Show HN + Digiday/Rebooting/NiemanLab RSS
        → Dedup against existing guests
            → Anthropic editorial-bar classifier emits target_type +
              fit/attainability scores + skip_reason
                → Insert router:
                    target_type='podcast_guest' AND bar passes → guests
                    target_type='press_target'                 → visibility_targets (type='press_relationship')
                    target_type='dual'                          → both
                    skip_reason set                             → nell_rejected (silent audit)

Hourly: Deep Enrich Retry Sweep finds guests with status='new'
    → POST /webhook/guest-deep-enrich  (Nell Guest Pitch Draft)
        → Sonnet 4.6 drafts pitch (no em dashes, Krish voice, ~110 words avg)
            → PATCH guests (pitch_draft, suggested_angles, status='enriched',
                deep_enriched_at)
                → guest surfaces in decisions_waiting with rich preview

Krish clicks "Confirm" on a GuestCard
    → POST /api/guests/confirm
        → sets guests.status='confirmed'
            → POST /webhook/guest-confirmed-cascade
                → creates 3 tasks (prep / recording / 72h follow-up)
                → drafts 3 promo posts (Sonnet 4.6) → content_ideas (pending)
                → drafts Gmail thank-you when email present
                → upserts contacted_persons row
                → stamps guests.cascade_fired_at

Krish clicks "Draft email" on a GuestCard
    → same email-draft path as §8.1, scoped to guests

Krish clicks "Skip" / "Close concept" on a GuestCard
    → close_concept('concept:guest:<slug>', '<reason>', 'krish-via-control-center')
    → cascade: guest → dropped; any tagged tasks → superseded
```

`guests.target_type` discriminates podcast guests from press relationships. `'podcast_guest'` is the default. `'press_target'` rows do not normally live in `guests` - Nell's scout router sends them into `visibility_targets` directly. The legacy `nell_candidates` table is gone; `guests` is the only insertion target now. `guests.status` allowed values are `'scouted','enriched','pitched','responded','scheduled','confirmed','recorded','published','dropped'`.

### 8.3 Visibility flow (speaking + PR)

```
Two ingress paths into visibility_targets:

  A. Nova Visibility Sweeper (Mon 11:00 UTC weekly, `SIDlCqURzTVsVt70`)
     Perplexity sonar-pro scrapes new conferences / podcasts / CFPs
        → Anthropic Sonnet 4.6 normalises into typed rows (event_url set)
            → Parse + Validate → dedupe → Insert visibility_targets
                (type='conference' typically, status='queued', source_url + event_url)

  B. Nell Guest Scout router (Mon/Wed/Fri ET, see §8.2)
     When the editorial-bar classifier emits target_type='press_target'
        → Insert into visibility_targets with type='press_relationship',
          source_url=LinkedIn/personal site, status='queued'

Every-12h retry sweep (inside Nova Visibility Sweeper) finds rows with
deep_enriched_at IS NULL (LIMIT 10)
    → POST /webhook/visibility-deep-enrich   (Nova Visibility Deep Enrich)
        → Brave research → Sonnet 4.6 generates fit_score + why_relevant +
          suggested_angle + organizer + audience + past_speakers + URLs
            → PATCH visibility_targets (URLs preserved + enrichment fields +
              deep_enriched_at)
                → surfaces in decisions_waiting + Visibility tab

VisibilityTargetCard:
  - Renders Open CFP / Open event / View source / Open profile link by type,
    falling back through cfp_url → event_url → source_url
  - For stub rows (no deep_enriched_at or migration-stub text), the
    Apply button is replaced with an inline Enrich button that fires
    POST /api/visibility-targets/:id/enrich-deep directly from the card
  - Apply / Pass pair otherwise

Krish approves / declines via VisibilityTargetCard
  Apply  → PATCH /api/visibility-targets/:id  status='applied'
  Pass   → PATCH /api/visibility-targets/:id  status='dropped'
  Enrich → POST  /api/visibility-targets/:id/enrich-deep  (fires webhook)
  Close concept → close_concept('concept:vis:<slug>', ...)
```

`visibility_targets.type` allowed values: `'cfp', 'conference', 'podcast', 'newsletter', 'guest_appearance', 'press_relationship', 'speaking', 'other'`. `status` allowed values: `'sourced','queued','applied','accepted','rejected','done','dropped'`. URL fields: `source_url` (canonical), `event_url`, `cfp_url`. Every live row should have at least one URL.

### 8.4 Customer flow - Stripe webhook to Customers tab to email draft

```
Stripe fires an event (checkout.session.completed, invoice.payment_succeeded, ...)
    → POST /webhook/{fractionl|mmctrl}-stripe-revenue
      (both paths served by ONE workflow, Stripe | Revenue Intake, since 2026-07-07;
       merciless/onalert/gutted webhooks deactivated 2026-07-06, product retirement,
       remove those endpoints in their Stripe dashboards during sunset)
        → verify stripe-signature (HMAC over the raw body; arms itself when
          system_config.stripe_webhook_signing_secrets carries the product's whsec;
          forged events are REJECTED with an audit_log stripe-signature-invalid entry;
          until secrets land, events process flagged unverified)
            ├─ record to agent-reports (Telegram removed 2026-09-06)
            ├─ Log to workflow_runs (outcome carries path:type:verified-state)
            ├─ Lookup Attribution (recent leads by email)
            └─ Supabase: Upsert Customer → customers table
                (idempotent via product+stripe_customer_id; populates
                attribution_lead_id, attribution_task_id,
                attribution_channel, attribution_confidence)

Nightly 05:00 UTC: System | Stripe Reconciliation | Nightly  ← ground truth
    → Stripe list subscriptions (mindmaker_llc account)
    → map price/product ids via system_config.stripe_price_product_map
    → upsert customers (attribution_confidence='reconciled'), mark lapsed paid rows churned
    → unmapped price ids surface in audit_log (never guessed)
    Webhooks are fast alerts; this job self-heals missed deliveries within 24h.
    (First real run found and restored a paying subscriber the webhooks had missed.)

Nightly 7AM UTC: Maya | Customer Acquisition Sweeper
    → GET each product Supabase profiles/subscriptions/waitlist
    → Normalise → Upsert customers

Krish clicks "Draft email" on a CustomerCard
    → POST /api/customers/:id/draft-email
        → same email-draft path; intent inferred from customer_kind
            (paid → check-in; trial → conversion; churned → win-back)

Stripe fires customer.subscription.deleted (churn)
    → existing Maya | Churn → Exit Interview Task workflow creates a task
    → planned: Stripe webhook also calls close_concept on the customer's
      concept_id as a lifecycle event (not a Krish action) - see §17.7
```

### 8.5 Email-draft flow (canonical, all entities)

The audit added a single canonical path for "draft an email to this entity." Lead, customer, and guest all funnel through it:

```
Krish clicks "Draft email" on any entity card or in any DetailSheet
    → POST /api/{leads|customers|guests}/:id/draft-email
        → Fetch entity row + relevant context (history, recent activity)
        → POST /webhook/cleo/email-draft  (Cleo | Email Draft)
            → Load brief_content for cleo + krish-voice rules
            → Sonnet 4.6 drafts {subject, body_html}
                - Krish voice; no em dashes; HTML body (no markdown);
                ≤180 words for cold; ≤120 words for warm;
                explicit CTA in last sentence
            → Gmail OAuth: gmail.users.drafts.create
            → INSERT email_drafts (idempotent on entity+intent within 24h)
            → mark_entity_emailed(entity_type, entity_id, draft_id, draft_url)
            → response: {ok, draft_id, draft_url, subject, body_preview}

Krish opens the draft in Gmail, edits if needed, hits send.
Gmail does NOT auto-send. Standards PUB-001 / PUB-005 still hold.
```

### 8.6 Content flow (v1, superseded for news 2026-07-10)

```
Zara | Signal Sweep  →  zara_signals + warm/zara-signals/latest.json
    → Zara | Content Pipeline picks top signal
        → Cleo | Omnichannel Content Factory produces drafts
            OR Cleo | Content Idea Capture (Cmd+I from Control Center)
            → Agatha | Content Angle Approval → decisions_waiting (no push)
                → Krish approves
                    → Krish Approval Callback
                        → Cleo | LinkedIn Distribution
                          (guarded by X-Agatha-Secret header)
                            → Cleo | Log Content Performance

Cleo | Content Transform
    → idea_id + target format (linkedin/newsletter/x/podcast)
        → Sonnet 4.6 produces channel-specific variant
            → PATCH content_ideas.transformed_outputs (jsonb)

Content Composer (Content tab - full-screen, one piece; §5.7)
    → review · refine · Cleo chat · attach materials (meta.materials)
        → Save Draft  →  /api/content-ideas/:id/save-draft
            → Omnichannel Content Factory (krish_approved gate)
                → Google Doc in channel Drive folder (Telegram removed 2026-09-06)
                    → content_ideas.state = review   (Krish stays the publish gate)
```

**Content flow v2 (live 2026-07-10, §5.8): the news path now runs here.**

```
CTRL pool (live_headlines_cache) + newsletters + Zara
    → /api/feed/ingest (Vercel cron, daily 11:30 UTC)
        → content_ideas Feed (horizon='news', expires_at)
            → /api/shifts/detect (Fri 17:30 UTC; recurrence gate:
              >=3 distinct days AND >=3 distinct sources AND >=3 real citations)
                → shifts register + shift_evidence + content_decisions
            → /api/briefs/assemble (Fri 18:00 UTC)
                → weekly_briefs status='ready' + brief_review decision
                    → Composer / BriefEditor (versions, magic edits, Tell Cleo)
                        → Krish approves
                            → /api/briefs/:week/push
                                → factory multi-format fan-out → Google Docs
                                  (PUB-001 intact: drafts only, Krish publishes)
    → /api/purge/run (Mon 14:00 UTC)
        → each expiring Feed row: expire | feed a shift dossier | graduate to Library
```

**Hard rule (PUB-001 / PUB-005).** No content leaves the system without explicit Krish approval. **The email-draft path is exempt because nothing is sent** - Gmail Drafts only.

**Channel discipline.** Before Cleo (or any content agent) drafts for a named channel, it loads `skills/content-corpus/SKILL.md` alongside `krish-voice`. The corpus routes the signal to the right instrument (a single Zara signal becomes a *different angle* per channel, never the same words reposted) and gates every draft on the Five Standards: undeniably unique, well-researched, thoughtful, kind, helpful. `krish-voice` governs mechanics; `content-corpus` governs channel mandate.

### 8.7 Self-improvement loop - Krish corrects, OS adapts

```
Krish rejects output in Control Center (via FeedbackButton with reason_code)
    → feedback_queue row
        → Vera Feedback Aggregation (Sun 06:00 UTC weekly)
            → Groups unconsumed rejections by (agent_id, source_table, reason_code)
                → If count ≥ 3 and vote = -1 and confidence > 0.85:
                    → corrections row with proposed_brief_edit
                        → Agatha surfaces in Org tab amber panel
                            → Krish approves
                                → Append proposed_brief_edit to agents.brief_content
                                → Mark feedback rows status=consumed
                                → render-identity.py picks up within 15 min
                                → Next session wake loads the new rule
```

**The promise: same mistake doesn't survive four occurrences.** FeedbackButton surfaces: `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas`, **`goals`**, **`milestones`**, plus `customers`, `bets`, `opportunities`, `corrections`, and `contacts` (the `/api/feedback` ALLOWED_TABLES set covers 10+ surfaces).

**Generative arm (success induction).** The same loop runs forward. A thumbs-up on a completed task (the Recently Done section on the Today tab) writes a positive `feedback_queue` row (vote=1): the explicit win signal. Evidence-backed completions count too. Vera then crystallizes repeated wins into reusable skills, the mirror image of turning repeated rejections into corrections.

```
Krish thumbs-up a done task, or a task completes with substantive evidence
    -> feedback_queue row (vote=1) / evidence-backed completion
        -> Vera Success Induction Sweep (Sun 08:00 UTC weekly)
            -> induct_skill_candidates() clusters wins by (agent, task_type)
                -> If a cluster is at/above the volume threshold (default 3):
                    -> Sonnet drafts a reusable play in Krish voice (no em dashes)
                        -> skill_proposals row (status='proposed')
                            -> Surfaces in the Org tab + decisions_waiting Home pane
                                -> Krish approves
                                    -> Append the "Learned play" block to agents.brief_content
                                    -> learning_events row (event_type='win', classification='win_pattern')
                                    -> render-identity.py picks up within 15 min
                                    -> Next session wake loads the new skill
```

**The promise: a repeated win gets crystallized, not only a mistake corrected.** `skill_proposals` mirrors `workflow_proposals` (same state machine, same approval gate); the RPCs are `induct_skill_candidates` / `bump_skill_usage` / `flag_decayed_skills` (§4.8) and the surfacing branch is `decisions_waiting.skill_proposal` (§4.7). Decay is built in: `flag_decayed_skills()` flags an induced skill that goes unused for N days or is followed by a same-pattern rejection, for approval-gated pruning. Phase 1 is **agent-scope only** (the play lands in one agent's brief via the same render path corrections use); shared cross-fleet skills are a later phase. The whole arm **self-gates**: with no win density, `induct_skill_candidates()` returns nothing and the sweep writes only an audit heartbeat. Nothing an agent loads is written without Krish's approval.

### 8.7.0 Three altitudes

The Objective Layer introduces three feedback altitudes, each with a canonical `reason_code` and a distinct lesson Vera teaches Marcus. The whole point of splitting them is that a single rejection at the wrong altitude was previously mud: Marcus could not tell whether Krish meant "wrong task today," "right task wrong week," or "this whole objective is dead." Three completely different lessons.

| Altitude | `reason_code` | Posted from | What it teaches Marcus |
|---|---|---|---|
| Daily | `marcus_priority_override` | Home swap affordance on a top_three card; FocusCalibrator pre-lock swap; `/api/daily-focus/calibrate` double-write | This was the wrong task to elevate today. Re-weight leverage features for this signal class. |
| Milestone | `marcus_milestone_override` | MilestoneCalibrator reject button (DELETE `/api/milestones/:id`) | Right work, wrong week-sized chunk or wrong decomposition. Adjust the decomposition heuristic for this objective shape. |
| Objective | `marcus_objective_nomination_rejected` | NominationTray reject button (POST `/api/objectives/:id/nominate-reject`) | This whole objective is the wrong shape. Tighten cluster detection; raise the theme bar before nominating. |

Vera's `Cluster` node groups by `[agent_id, source_table, reason_code]`, so each altitude rolls up into its own bucket in `corrections` and Marcus's brief evolves on the right axis instead of wobbling.

### 8.7.1 Marcus top_three override capture

The `FeedbackButton` thumbs-down is the lightweight rejection signal. For Marcus's daily `top_three` picks on the Home tab, there is also a higher-effort signal: the swap affordance.

```
Krish hits the Replace icon on a top_three card
    → optional textarea: "What would you have picked instead?"
        → POST /api/feedback with shape:
            { source_table: 'home_intelligence',
              source_id: '<slot index, 0/1/2>',
              agent_id: 'marcus',
              vote: -1,
              reason_code: 'marcus_priority_override',
              reason_text: '<Krish replacement, or null>',
              meta: { original_pick_title, original_pick_meta,
                      replaced_with_text, captured_at } }
            → feedback_queue row

Marcus | Daily Brief 06:30 (next tick)
    → Pull live data node fetches feedback_queue rows where
      reason_code='marcus_priority_override' AND created_at >= now() - 14d
    → Sonnet 4.6 prompt receives the RECENT OVERRIDES block plus the
      Krish-overrides interpretation rules (system prompt)
    → top_three is reranked using the override pattern, if any

In parallel, the standard §8.7 self-improvement loop still applies:
    → Vera Feedback Aggregation (Sun 06:00 UTC) groups
      marcus_priority_override rows with ≥3 matches
        → corrections row with proposed_brief_edit
            → Agatha surfaces, Krish approves
                → Persistent edit to agents.brief_content for marcus
```

The swap is intentionally higher-friction than the thumbs-down: it asks Krish to articulate what he would have picked, which is the signal Marcus needs to learn the pattern. The thumbs-down is "this was bad"; the swap is "this was wrong AND here is what was right."

Carrier file: `scripts/n8n/marcus-daily-brief.workflow.json` (live workflow id `d2sHSeyXMmu8Xe0C`). The Pull live data node grows a 12th parallel fetch from `feedback_queue` (idempotent: `.catch(() => [])` on transport failure). The Sonnet brief system prompt grows a Krish-overrides paragraph; the user content appends the RECENT OVERRIDES JSON.


### 8.7.2 Daily Focus Picker

Krish locks 3 daily focus targets on Home. Marcus nominates 3 via `home_intelligence.top_three`; Krish accepts, swaps, or adds his own; Lock posts to `/api/daily-focus/calibrate`. The whole Home re-ranks into 3 lanes plus a Muted lane.

```
Lock today's 3 → POST /api/daily-focus/calibrate { date, targets[3] }
    → upsert daily_focus row (status='pending')
    → double-write feedback_queue rows for any krish_swapped/krish_added target
      (reason_code='marcus_priority_override', meta.source_phase='phase1_calibrate')
    → await POST https://<the n8n Cloud instance>/webhook/focus-calibrate
        → Krish | mind/make OS | Focus Calibrator (workflow id zEA4wGECQdqBpDmO)
            → fetch candidate pool from 6 tables in parallel
              (decisions_waiting + tasks + bets + leads + visibility_targets + customers)
            → Sonnet 5 (thinking disabled) via the bearer-authenticated
              /api/internal/sonnet-proxy assigns
              <table:id> → { target: 1|2|3|null, score: 0.0-1.0 }
            → PATCH daily_focus.relevance_index, status='calibrated', calibrated_at
            → workflow_runs heartbeat + lane sizes (no push)
    → client gets { ok, row_id, webhook_ok }

useFocusFiltered(rows, table) → lane-tags any list
DecisionsWaitingPanel renders Lane 1 / 2 / 3 + Muted when status='calibrated'
StreakPills gains "3-for-3" pill (consecutive days with status='complete')
```

Carrier files: `supabase/migrations/20260527190000_daily_focus_phase1.sql`, `api/daily-focus/*` (5 routes), `api/_whisper.ts` (shared Whisper helper), `api/internal/sonnet-proxy.ts` (internal Anthropic proxy used by workflows that cannot inherit credential scope), `scripts/n8n/krish-focus-calibrator.workflow.json`, `src/components/focus/{FocusCalibrator,FocusBar,CarryOverPrompt}.tsx`, `src/hooks/{useDailyFocus,useFocusFiltered}.ts`.

Critical alerts (silent_failures severity='critical') are never muted by lanes.

Feature flag: `VITE_DAILY_FOCUS_ENABLED`. Default false; flip in Vercel to roll out.

### 8.7.3 Tasks Inbox

Cmd+J (desktop) or floating Inbox button (mobile) opens `IdeaCaptureModal`. Krish types or speaks any raw task. The OS classifies, routes, runs it as far as it can, returns it to Krish only when he is needed again.

```
Drop a task → POST /api/tasks-inbox { raw_text, source }
    → INSERT tasks_inbox row (status='raw')
    → await POST /webhook/idea-classify
        → Krish | mind/make OS | Inbox Classifier (K8GJw4T2NFjXFXXC)
            → Haiku 4.5 via the bearer-authenticated internal sonnet-proxy decides
              { task_type, primary_agent, target_table, first_action,
                expected_completion_state, needs_clarification[],
                suggested_concept_id, confidence }
            → status='needs_clarification' → decisions_waiting (no push)
            → status='routing' → fire /webhook/idea-route
                → Krish | mind/make OS | Inbox Router (GVnJkvJm9vmLG4Jp)
                    → INSERT into one of tasks / leads /
                      visibility_targets / guests / content_ideas /
                      bets (customers route insert a linked task)
                    → compute_concept_slug(first_action) → concept_id
                    → status='in_flight', target_table, target_id

Krish | mind/make OS | Inbox Return Detector (2d4iKtsM28IrtvNW)
    every 15 min → scan in_flight rows
        → for each, peek at target row
            → if target reached a needs-Krish state, flip
              tasks_inbox.status='needs_krish'
        → decisions_waiting view exposes it as kind='inbox_returned'
        → 7-day stale → status='failed', archive_reason='classifier_failed'

VPS crontab 08:00 UTC daily → /root/.openclaw/cron/inbox-decay.sh
    → POST rpc/archive_stale_inbox_ideas
        → archives any row still in raw/classifying/needs_clarification
          captured > 14d ago, archive_reason='auto_decay_14d'

Krish | mind/make OS | Inbox Digest (tDkmZl2oLU43BHkm)
    Sun 17:00 UTC → GET /api/tasks-inbox/digest → read in Control Center (no push)
```

Carrier files: `supabase/migrations/20260527200000_tasks_inbox_phase2.sql` (table + decay RPC + decisions_waiting 7-branch extension), `api/tasks-inbox/*` (5 routes), `scripts/n8n/krish-inbox-{classifier,router,return-detector,digest}.workflow.json`, `src/components/inbox/{IdeaCaptureModal,IdeaCaptureFAB}.tsx`, `/root/.openclaw/cron/inbox-decay.sh`.

Feature flag: `VITE_TASKS_INBOX_ENABLED`. Default false.

`decisions_waiting` view is now 9-branch: task, guest, idea, lead, visibility, correction, inbox_returned, skill_proposal, vera_gap (see §4.7).


### 8.8 Self-healing - four-tier silent-failure system

The OS's hardest class of failure is a workflow that "succeeds" (writes `workflow_runs` ok=true) but produces no actual value. Four tiers catch it:

```
TIER 1 (real-time, per-workflow):
    completeness_contracts row per workflow_id
    → Workflow's terminal node runs the gate:
       if rows_written < expected_min_rows
       OR missing expected_columns
       OR freshness_window violated
       → insert silent_failures row with tier=1, severity, evidence
       → decisions_waiting + CriticalAlertBanner if severity='critical' (no push)

TIER 2 (4-hour cadence):
    Silent Success Detector (system workflow)
    → Scans workflow_runs over last 4h
    → For each (workflow_id, ok=true), checks downstream effects
       (rows inserted in the target table during the window)
    → Zero effects → insert silent_failures row with tier=2

TIER 3 (5-minute cadence):
    Critical Infrastructure Monitor (system workflow)
    → Watches credential_health (expired/expiring),
       system_health (component down),
       RLS denials in audit_log
    → Inserts silent_failures rows with tier=3, severity='critical'
    → CriticalAlertBanner subscribes via useCriticalAlerts and renders on Home

TIER 4 (weekly):
    Vera Failure Pattern Sweep (Sun 07:00 UTC)
    → Groups silent_failures over last 7 days by pattern
    → ≥3 matching failures in same workflow class → corrections row
    → Agatha turns corrections into structural fixes
       (brief edits, standards changes, workflow patches)
```

**The promise: same silent failure doesn't survive a week.**

### 8.8.5 Objective layer flow

Krish's daily work now has a visible spine: every tactical task ladders up through a weekly milestone to a multi-week portfolio objective he owns.

```
KRISH DECLARES OBJECTIVE (top-down strategic call, source=krish_declared)
    POST /api/objectives  ->  insert into goals (status=active)
        |
        +-- agent_plans.weekly_goal_id set per agent  (the rail Step 3b reads on wake)
        +-- goal_agent_contributions row per contributing agent
        |
PROPOSE MILESTONES
    Krish clicks "Have Marcus propose milestones" in MilestoneCalibrator
        -> POST /api/objectives/propose-milestones { goal_id }
            -> proxy to n8n webhook (uL8DLpHbT11eqBAW)
                -> Sonnet 4.6 with Marcus's live brief embedded
                    -> insert 2 to 5 milestones (source=marcus_proposed, status=proposed,
                       marcus_reasoning per row)
                    -> idempotent: skipped if any proposed exists for goal_id
                    -> audit_log: objective_milestone_proposer
        ALTERNATE: Krish hand-writes via POST /api/objectives/:id/milestones
                   (source=krish_authored, status=accepted)
        |
ACCEPT / TWEAK / REJECT / COMPLETE (per milestone)
    PATCH /api/milestones/:id { action: accept | tweak | complete | reorder }
        -> status transitions, source=krish_tweaked on tweak
    DELETE /api/milestones/:id
        -> status=dropped
        -> feedback_queue row: reason_code=marcus_milestone_override (milestone altitude)
        |
MARCUS NOMINATES OBJECTIVES (cluster detection on unparented tasks)
    Daily synthesis detects 3+ tasks with milestone_id IS NULL sharing a theme
        -> insert into goals (status=proposed, source=marcus_nominated)
            -> NominationTray on Home
                -> Krish Accept: POST /api/objectives/:id/nominate-accept
                    -> status=active, activated_at=now()
                -> Krish Reject: POST /api/objectives/:id/nominate-reject
                    -> status=dropped
                    -> feedback_queue: reason_code=marcus_objective_nomination_rejected
                       (objective altitude)
        |
AUTO OBJECTIVES (is_auto=true, Agatha's domain)
    Agatha wake-time check: any active is_auto=true objective with zero milestones
        -> generate milestone sequence (source=agatha_decomposed, status=accepted)
        -> generate tasks under each milestone, assigned to the right agent
        -> upsert goal_agent_contributions per assigned agent
        |
HOME RENDERING
    GoalLadder  (DesktopHome + MobileHome, above the PulseGroup fold)
        -> NominationTray   (only renders when source=marcus_nominated rows exist)
        -> Soft-cap warning (venture-objective count, filtered by horizon;
           NOT the count_active_objectives() RPC, which predates `horizon`
           and counted every active goal)
        -> DeepWorkBlock    (highest-priority objective's active/accepted milestone)
        -> Active strip     (click row -> inline MilestoneCalibrator)
    TopThreeCards
        -> each task card with non-null tasks.milestone_id renders
           "Ladders up to: {parent objective title}" via client-side join
```

**Realtime.** A single channel `objectives-rt-shared` covers both `goals` and `milestones` (ADR-002 single-channel-per-table-set pattern, ref-counted attach/detach in `useObjectives.ts`).

**The promise: tactical work always shows its strategic parent, and deep-work commitments survive the daily leverage contest because they sit structurally above the tactical picks.**

### 8.8.6 Autonomous OS diagnostics (Arlo's mechanical-liveness sentinel)

The four-tier system above watches *workflow outputs*. A complementary deterministic, non-destructive pass watches the *OS machinery itself* - paths, crons, processes, git, and cross-system reachability. It never repairs production; it writes evidence and escalates heavyweight cross-system problems instead of self-healing.

- **Script.** `scripts/os-autonomous-diagnostics.py` (`--mode quick|full`). Checks: critical workspace/script paths exist; active templates carry no *live* `tasks.json` / flat Control-Center-state instructions - with a benign-marker allowlist (`deprecated`, `must not`, `do not`, `never`, `no step`, ``not `tasks.json` ``) so correct *prohibitions* are never flagged; root crontab has no missing paths and exactly one Vera N8N audit entry; active OpenClaw cron payloads carry no architecture drift; no orphaned dashboard process / stray `localhost:8080` listener; git-tree deletion risk; (full mode) Supabase stalled-active-task scan, N8N executions reachability, Control Center homepage reachability.
- **Evidence.** Writes `audits/os-diagnostics/latest.{md,json}` every run; `status` ∈ `OK` / `ATTENTION` / `URGENT`.
- **Escalation, not silent repair.** A heavyweight cross-system `CRITICAL` writes an **Urgent Claude Code CLI Repair Alert** to `hot/urgent-claude-code-repair-alerts/` carrying a full Claude-CLI prompt, evidence, constraints, and validation gates. Resolved alerts move to that folder's `resolved/` subdir with a resolution banner. A *stale* diagnostic snapshot is not truth - every finding must be re-verified against live state before any action.
- **Sentinels.** Root crontab runs `--mode quick` every 30 min (`>> /var/log/os-autonomous-diagnostics.log`, suffixed `|| true` so a diagnostic fault can never wedge cron). OpenClaw job **Arlo Autonomous OS Diagnostics Sentinel** (`3cd5afa9-13cd-4a59-8383-cff50195cc0a`) runs every 6h, silent unless an urgent alert is generated.
- **Ownership.** Arlo owns mechanical liveness (paths/crons/process/git/sync evidence); **integration viability is no longer an agent** - `/api/health/connections-sweep` live-probes every keyed vendor and `/api/health/fleet-reconcile` asks n8n what actually happened, both Vercel crons every 6h (Kai retired 2026-09-07); Vera owns semantic correctness and silent-success detection.

### 8.8.7 Vera gap closure loop (detection → owned task → escalation)

The four-tier system (§8.8) and the autonomous diagnostics (§8.8.6) *detect*. Vera's behavioural auditor writes findings to `vera_audit.findings` (a jsonb array of `{band, severity, subject, reason}`), but those findings had no closure path - they accumulated in weekly reports and stopped there (empirically: 1,139 findings over 9 weeks against 2 stale `corrections` and 1 Vera-owned task). This loop is the routing path from "detected" to "owned and tracked": Vera detects, the router assigns an owner, the owning agent closes, the next audit re-checks, and chronic gaps escalate to Krish.

```
Friday 11:00 UTC  Vera weekly behavioural audit -> vera_audit.findings[]
Friday 11:30 UTC  vera-gap-cycle.sh  (VPS crontab, zero-AI-cost)
    -> route_vera_gaps()
        - latest weekly audit; SKIP band='errors' (already healed by the four-tier system, §8.8)
        - dedupe by fingerprint  gap:<slug(subject)>:<band>
        - owner via vera_gap_owner(subject, band): cadence/liveness -> arlo;
          future quality/standards bands -> name-prefix agent (default agatha)
        - upsert vera_gaps ledger; create tasks row (origin='vera_gap_router',
          workstream='os_quality_closure', krish_reviewed=true so it stays OUT of
          the generic decisions_waiting task branch); cycles_open=1
        - gap present in a NEW weekly audit -> cycles_open += 1
        - resolved gap that recurs -> reopen
    -> reconcile_vera_gaps()
        - any open gap absent from the newest weekly audit -> status='resolved',
          task -> done  (absorbs Vera false-positives, e.g. monthly workflows)

decisions_waiting 9th branch 'vera_gap':  vera_gaps WHERE status='open' AND cycles_open >= 2
    -> only gaps flagged across >=2 weekly audits without closure reach Krish's Home panel
```

**Owner model.** A `cadence`/`errors` finding is a *liveness* problem, and the architecture assigns mechanical liveness to Arlo (§8.8.6). So a workflow-not-firing gap routes to Arlo, not to the content agent whose name prefixes the workflow (Cleo cannot fix a cron). `vera_gap_owner` is band-aware, so genuine content/standards gaps route to the name-prefix agent when Vera starts emitting them.

**Current reality.** Vera's auditor today emits only `cadence` and `errors` bands - no content/standards bands yet - so the routed set is workflow-liveness gaps owned by Arlo. The owner-map already handles quality bands for when they appear.

**The promise: a detected gap does not die in a report. It becomes an owned task, auto-closes when fixed, and escalates to Krish if it survives two weeks.** Ledger: `vera_gaps` (§4.6). RPCs: `route_vera_gaps` / `reconcile_vera_gaps` / `vera_gap_owner` (§4.8). Surfacing branch: `decisions_waiting.vera_gap` (§4.7). Migrations: `vera_gap_closure_loop_core`, `decisions_waiting_vera_gap_branch`.

### 8.9 Marcus synthesis - Home Intelligence feed

```
Cron (Mon 11:55 ET / Wed+Fri 07:00 ET / Sun 11:55 ET deep)
    → Marcus | Synthesis + Home Intelligence
        ├─ Load Agent Brief / Voice Rules / Agent Plan
        ├─ Load OS State (workflow_runs, tasks, system_health)
        ├─ Build Prompt with schema for
            home_summary, home_metrics, home_external_signals,
            home_customer_signals, customer_voice
        ├─ Call Anthropic Sonnet → Parse LLM Response
        └─ Write to Supabase:
           - Deterministic fetch of customers (7d) → customer_signals
           - Deterministic fetch of overdue leads (limit 3) →
             prepended to external_signals
           - Deterministic fetch of customer_contacts (7d) → customer_voice
           - Upsert home_intelligence (id='current')
           - If deep mode: also write marcus_synthesis row
           - Always: Log Run to Supabase (Telegram Notify removed 2026-09-06)

Marcus | Daily Brief 06:30 (weekdays)
    → home_intelligence.daily_brief + daily_brief_at

Marcus | Friday Retro 17:00 (Fridays)
    → home_intelligence.weekly_retro + weekly_retro_at
    → Acked by Krish via UI → weekly_retro_ack_at set

Marcus | Monday Pre-mortem 08:00 (Mondays)
    → home_intelligence.monday_premortem + monday_premortem_at
```

**Closure interaction.** After `close_concept('concept:org:disney', ...)` runs, `marcus_daily_pull()` returns zero Disney mentions across all arrays (leads, hot_leads, stale_tasks, open_visibility, bets, customers, council). The deterministic data path is therefore Disney-free; only the cached `home_intelligence.top_three` from the morning's run still shows Disney, and it refreshes on the next cron tick. The `marcus_daily_pull()` RPC filters leads on `status IN ('ready','contacted','conversation')`, so any lead-side closure (closed_lost/closed_won/superseded) drops out automatically. The `hot_leads` filter additionally requires `quality_score='green'` - leads without that score never appear there. Not yet wired (see §17.7): a `LEFT JOIN concept_decisions` on each deterministic fetch to also exclude closed-concept rows that somehow remain in a non-terminal status.

**Manual-trigger limitation.** The Marcus | Daily Brief workflow uses the legacy `n8n-nodes-base.cron` trigger node, which is **not** executable via the n8n public REST API or the MCP `execute_workflow` tool. If a manual trigger is needed (e.g. force-refresh after a closure), the only paths are: wait for the next scheduled tick, swap the cron node for a Schedule Trigger (modern equivalent), or add an auxiliary webhook trigger.

### 8.10 Living `agent_plans` (weekly refresh)

```
Agatha Weekly Plan Refresh (Mon 09:00 UTC)
    → Calls refresh_agent_plans() RPC
        → For each agent: build context (last week's tasks, blockers, completed work)
            → Sonnet 4.6 proposes refreshed
                current_phase/objective/blockers/next_milestone
            → Updates agent_plans, bumps last_rendered_at
    → Side effect: no agent goes READ-ONLY from staleness in normal operation
```

### 8.11 Identity rendering pipeline

```
Krish (or Agatha, or Vera) edits agents.brief_content in Supabase
    → render-identity.py  (VPS crontab, every 15 min)
        → /root/.openclaw/skills/agent-{id}/SKILL.md   (output-only file)
            → Claude Code agents load on next session wake
            → N8N agents fetch brief_content directly at workflow runtime
                via the "Load Agent Brief" HTTP node + voice rules from
                system_config.krish_voice_rules
```

### 8.12 Concept closure - Krish says done, OS records and cascades

The two live paths today are the direct RPC (Path A) and the Control Center "Close concept" button (which proxies to the same RPC). The conversational and real-event paths are planned, not built - see §17.7.

```
Path A (manual): direct RPC call
    → SELECT close_concept('concept:<type>:<slug>',
                           '<one-sentence reason>',
                           '<actor>')
    → INSERT concept_decisions (ON CONFLICT updates)
    → UPDATE tasks  SET status='superseded'   WHERE concept_id = $1
                                              AND status NOT IN ('done','superseded',...)
    → UPDATE leads  SET status='closed_lost'  WHERE concept_id = $1
                                              AND status NOT IN ('closed_won','closed_lost','superseded')
    → AFTER UPDATE triggers fire log_status_change()
       → INSERT status_change_log (table_name, row_id, concept_id,
                                   old_status, new_status,
                                   changed_by=app.changed_by,
                                   source=app.source)
    → INSERT audit_log (event_type='concept_closed', actor, target=concept_id, changes jsonb, display_message)
    → returns {ok, concept_id, tasks_closed, leads_closed, decided_at}

UI path (live): Control Center "Close concept" button
    → POST /api/concepts/:concept_id/close → close_concept(...) → Realtime echo updates affected cards
```

Planned (see §17.7): a conversational receiver (Agatha chat → `close_concept`) and real-event auto-closure (Stripe / Gmail / Instantly lifecycle events → `close_concept`). All paths funnel through the same RPC, so the ledger has a single shape and the audit_log has a single event type per closure regardless of trigger.

### 8.13 Self-improvement, extended (planned, see §17.7)

Once a reopen-sweeper exists, the loop closes further: when Krish reopens a concept, `reopen_concept` supersedes the decision and writes a `concept_reopened` audit event; a sweeper would then write a `feedback_queue` row pointing at the original closure, and Vera Feedback Aggregation could extract a pattern ("this concept class gets reopened often - closure criteria too aggressive") → corrections → standards update. This sweeper is not yet built.

---
