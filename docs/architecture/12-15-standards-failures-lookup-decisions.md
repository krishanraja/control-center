# Standards, failure modes, lookup and architectural decisions: reference detail

> **Reference detail for sections 12 to 15 of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- Table 13 names Kai, an n8n Critical Infrastructure Monitor and the Deep Enrich Retry Sweep as healers; Kai is retired and the monitors now run as VPS or Vercel crons. Check the live schedule before trusting a healer named here.
- 15.3 and 15.13: the LinkedIn path is gone; Control Center drafts and never sends (CI guard `check-bridges-never-send`).
- "~170 standards": count `standards_registry` live.

---

## 12. Standards (the rulebook)

`standards_registry` holds ~170 rules rendered nightly to `hot/standards-digest.md`. Categories:

| Family | Examples |
|---|---|
| **Brand Voice** | V-001..V-007, CLEO-001, BRAND-001 - writing voice, banned phrases, AI smell test |
| **Git** | GIT-001, V-004 - author identity is `hello@krishraja.com` |
| **Google Docs/Sheets/Slides** | GDOC-001..003, SHEET-001..002, SLIDE-001..004 |
| **Google Drive** | DRIVE-001, VFY-002 - folder routing, no duplicates |
| **Email** | EMAIL-001..005 - professional HTML, no markdown artifacts (applies to email-draft surface too) |
| **Code** | CODE-001..005 - TypeScript, accessibility, Supabase RLS |
| **Process** | AUD-003, SCRIPT-001..003, RESEARCH-001 - verify before "done", no fake output |
| **Publishing** | PUB-001, PUB-005 - explicit Krish approval required (note: email-draft surface is drafts only, not publishing) |
| **Model tiering** | MT-003 - Opus is Agatha-only |
| **N8N** | N8N-002..006 - workflow JSON discipline, no `typeVersion: null`, no `$env` |
| **Closure** | CLO-001 - concept closures use `close_concept`, never row-level patches. CLO-002 - terminal status values are the constraint-permitted vocabulary (`closed_lost` for leads, `superseded` for tasks), not runbook tokens (`dead`, etc.). CLO-003 - every closure caller sets `app.changed_by` and `app.source` for attribution. CLO-004 - Marcus re-stamps `top_three.expires_at` to NOW+24h to defeat date hallucination. CLO-005, CLO-006 - content ideas are rejected if missing `source_url` |
| **Cost discipline** | CFG-COST-001..003, N8N-COST-004 - no premium models in background fallback ladders; a dead primary key is fixed, not absorbed; model-tiering by job nature; prompt-cache only for repeated calls |
| **Attribution** | ATTR-001 - every fleet app link carries UTM tags + `agent` + `campaign_id`. PRODTRUTH-001 - fetch product-truth at runtime; honor capability + voice guardrails |

**Enforcement chain.** `standards_registry` → `regenerate-standards-digest.py` (2:30 AM UTC) → `hot/standards-digest.md` → loaded on session wake → `deliver_gate.py` runs before output → violations logged to `audit_log` → Vera audits compliance → repeat offenders become hard standards.

---

## 13. Failure modes and how the OS heals

| Symptom | First place to look | Healer |
|---|---|---|
| Workflow silently stops firing | `workflow_runs` (per-workflow last entry) | Workflow Monitor (6h) + `/api/health/fleet-reconcile` (6h, Vercel) |
| Workflow runs but produces no output | `silent_failures` (tier 1 or 2) | Tier 1 completeness gate + Silent Success Detector (8h) |
| Credential expired / RLS denying writes | `silent_failures` (tier 3), `credential_health` | Critical Infrastructure Monitor (3h) → CriticalAlertBanner |
| Control Center build broken | Vercel project deployments | Arlo Vercel Build Health Check |
| Agent giving wrong-shape output | `feedback_queue` after rejection | Vera Feedback Aggregation Sun 06:00 → corrections → brief edit |
| Pattern of silent failures across workflows | `silent_failures` over last 7d | Vera Failure Pattern Sweep Sun 07:00 → corrections |
| Cron missed | `audit_log` actor=cron | `Silent Success Detector` backstop |
| Output didn't match what cron claimed | `audit_log` vs reality | `Truth Reconciler` |
| Workspace contradictions piling up | Nightly contradiction audits | `vera-contradiction-audit` (Mon); the Arlo daily audit was retired 2026-10-05 (broken script) |
| Standards drift | `standards_efficacy` | Vera Friday deep audit |
| Plan render stale | `agent_plans.last_rendered_at > 72h` | Agatha Weekly Plan Refresh (primary), READ-ONLY mode (safety net) |
| Agent run invisible in Control Center | `workflow_runs` with `workflow_id like 'openclaw:%'` | `openclaw-runs-to-cc.py` every 15 min (the Drive-mirror row this replaced was retired 2026-10-05) |
| Sync queue backing up | `sync_queue` row count | `poll_sync_queue.py` every 5 min |
| Leads/guests stuck unenriched | `enrichment_status='new'` / `guests.status='new'` | Deep Enrich Retry Sweep hourly |
| Email draft fails | `email_drafts` row missing for entity + Vercel function log | Re-click Draft email - idempotent on `(entity, intent, 24h)` |
| Workflow Rerun returns 422 | Schedule-only workflow (no webhook trigger) | Trigger via n8n UI's Execute Workflow button (documented in `/api/automations/:id/rerun`) |
| **Closed concept resurfaces in synthesis** | `concept_decisions` (row present?), then memory files + warm reports for stale references | The row-status cascade in `close_concept` removes the concept from the data path (e.g. Marcus's `marcus_daily_pull()` filters on `leads.status IN ('ready','contacted','conversation')`, so `closed_lost` drops out). The belt-and-braces synthesis-time JOIN `concept_decisions` is not yet wired (see §17.7) |
| **Closed concept gets re-inserted by a generator** | `audit_log` `concept_closed` event + new row with same `concept_id` | Generator guards (every generator queries `concept_decisions` before insert and skips if the concept has a live `closed` decision) are not yet built - see §17.7 |
| **Concept reopened unexpectedly** | `audit_log` `concept_reopened` events | The planned Vera Closure Audit would flag any concept reopened >2 times in 30 days as a closure-criteria misfire (see §17.7) |

**Generic debugging playbook.**

1. Check `workflow_runs` for the relevant `workflow_name` - recent failures?
2. Check `silent_failures` for the same workflow - any tier 1/2 hits in the last 24h?
3. Check `audit_log` filtered by `actor` - what did the agent think it did?
4. Check `credential_health` - was the upstream API reachable?
5. Pull the failing execution from N8N (`/api/v1/executions/{id}?includeData=true`) - what node errored?
6. Compare repo source-of-truth (`n8n/workflows/*.json`) against live workflow - has someone edited live without committing?
7. **For closure-related symptoms:** query `concept_decisions` for the concept_id, then `status_change_log` for the relevant table+row, then `audit_log` for the matching `concept_closed`/`concept_reopened` events. The three together tell the full closure history.

---

## 14. Operational lookup - where to find things

| You need… | Look at |
|---|---|
| The OS architecture (this doc) | ONE surface since 2026-09-07 (§0c): `github.com/krishanraja/control-center`, `docs/MINDMAKE_OS_ARCHITECTURE.md` on `main`. A checkout follows it; the VPS and Drive copies are deleted |
| An API key or credential | `TOOLS.md` (workspace root) - never paste in docs or briefs |
| What an agent does | `agents.brief_content` (DB) → `skills/agent-{id}/SKILL.md` (rendered) |
| What an agent should do this sprint | `agent_plans` row + `active/{id}-action.md` |
| Live agent run history | `audit_log`, `workflow_runs` |
| Why a workflow keeps failing | N8N executions API + `kai_workflow_snapshots` + `silent_failures` |
| Per-product customer counts | `customers` GROUP BY product (anon REST works) |
| Pipeline state | `tasks` (manual) + `leads` (sales, per-venture) + `opportunities` (early) + `guests` (podcast) + `visibility_targets` (PR/speaking) |
| Everything currently waiting on Krish | `decisions_waiting` view |
| This week's brief | `weekly_briefs` (status `ready`/`in_review`/`approved`/`pushed`) |
| Shifts register + dossiers | `shifts` + `shift_evidence` |
| Content decisions waiting | `content_decisions` (`status='pending'`) |
| Corroborated headlines pool | mm-ctrl `live_headlines_cache` (read-only, `CTRL_SUPABASE_URL`) |
| Every email draft created (and whether sent) | `email_drafts` table |
| **Every concept-level decision Krish has made** | `concept_decisions` table |
| **Every status transition (any row, any table with concept_id)** | `status_change_log` table |
| **Whether a given concept is currently closed** | `SELECT decision, superseded_at FROM concept_decisions WHERE concept_id = $1` (live closure = decision='closed' AND superseded_at IS NULL) |
| The N8N source-of-truth JSON for audited workflows | `n8n/workflows/*.json` in `control-center` repo |
| The current schema | Supabase Studio OR `information_schema.tables` |
| What changed last week | `git log` on `control-center` + `schema_migrations` table + recent PRs |
| The closure architecture audit reports | `docs/audits/2026-05-25-closure-day1-stream{1,2}-*.md` in `control-center` |

---

## 15. Architectural decisions worth knowing

### 15.1 Supabase is canonical, files are derived
Local JSON for state is banned. SKILL.md, standards-digest.md, action.md are **output-only** - rendered from Supabase on a schedule, never edited in place.

### 15.2 Identity vs Plan vs Objective vs Decision is a hard quadtomy
If you propose a new file or table, declare which of the four it falls on: static (Identity, lives in `agents.brief_content`, rare changes), dynamic (Plan, lives in `agent_plans` and Action Doc body, refreshed weekly), durable strategic record (Objective, lives in `goals` and `milestones`, multi-week unlocks Krish owns), or durable closure (Decision, lives in `concept_decisions`, captures choices that should never be reversed silently). Anything else becomes a maintenance liability.

### 15.3 Approval is a wall, not a step
No content publishes without Krish's explicit approval. The LinkedIn Distribution endpoint is guarded by `X-Agatha-Secret`; only the Krish Approval Callback workflow has the header. **The email-draft path is a deliberate exception because Gmail Drafts don't publish anything** - Krish still hits send.

### 15.4 N8N workflows worth versioning are checked into git
`n8n/workflows/*.json` holds canonical snapshots for the workflows most central to the audit (Agatha Lead Deep Enrich, Cleo Content Transform, Nova Visibility Deep Enrich, Cleo Email Draft, archived duplicates). Canonical state still lives in the N8N runtime; the files are for diff, recovery, and history.

### 15.5 Deterministic > LLM-emitted for numbers
When the LLM is asked to count things (revenue MTD, customer adds, lead follow-ups) and it has no DB tool, it will produce *plausible* zeros. Pattern: fetch the data with a small HTTP node before the LLM call, OR compute deterministically after parsing. Marcus's Write-to-Supabase node is the reference implementation.

### 15.6 RLS is on every table, always
Anon read for dashboard surfaces; service_role for agent writes. Adding a table without RLS will fail Vera's audit.

### 15.7 Credential rotation is a human-only operation
There's no programmatic revocation for Supabase personal access tokens or N8N API keys. They rotate through the respective dashboards. Annotate `TOOLS.md` with the rotation date when you do it. **Never paste credentials in briefs, architecture docs, or commit messages.**

### 15.8 Multi-tag leads, single primary_venture
A media exec who is both a Mindmake buyer AND a Signal & Noise podcast guest is one row in `leads` with `tags=['mindmake_buyer','signal_noise_guest']` and `primary_venture='mindmake'`. The per-venture lane partitions on `primary_venture`; FeedbackButton + outreach + ICP scoring consults `tags` and `icp_scores`.

### 15.9 The four-tier self-healing pattern
Tier 1 (real-time, completeness contracts) → Tier 2 (4h, silent success detector) → Tier 3 (5m, critical infra) → Tier 4 (weekly, pattern sweep). Don't add a 5th tier; if a failure class doesn't fit one of these, the right answer is usually a new `completeness_contracts` row.

### 15.10 Living agent_plans
`agent_plans` is refreshed weekly by Agatha (Mon 09:00 UTC) via the `refresh_agent_plans()` RPC + Sonnet 4.6. The 72h READ-ONLY mode in the wake protocol is the safety net, not the primary mechanism.

### 15.11 Unified decisions_waiting
Every "thing waiting on Krish" goes through the `decisions_waiting` view, not its own bespoke surface. New surfaces add a `UNION ALL` branch to the view; they do not add a sibling panel to Home.

### 15.12 Retry sweeps over re-fires
When enrichment fails (SSL timeout, model overload, transient), the right pattern is a sweeper workflow that hourly re-tries any `status='new'` row, not a re-fire of the failed batch. Deep Enrich Retry Sweep is the reference implementation.

### 15.13 Email drafts, never sends
The OS can draft any outbound email Krish can imagine. It never sends one. The Gmail Drafts API path means every outbound has a human gate, and the `email_drafts` ledger is a permanent audit trail of every draft ever created (including subject, body, recipient, and intent).

### 15.14 Vercel `/api/*` is the only service-role surface in the browser path
Direct anon writes are fine when RLS permits. When service role is required, the path is always `/api/<route>` - never `import { createClient } from 'supabase-js' with service-role key` in browser code.

### 15.15 The viewport-fit invariant
Every primary tab must fit at 1280×800 without page scroll; sub-panels scroll internally. Mobile viewport must not zoom on input focus (Toast positioning respects safe-area).

### 15.16 Closure is concept-level, not row-level
Rows record the *current* state of an entity. Concepts record the durable identity that survives across rows. Closing a row sets a terminal status; closing a concept records a decision in `concept_decisions` AND cascades terminal status across every row tagged with that concept_id, in every table that participates. Before this, the OS only had row-level closure - that's how Disney existed twice (closed task, open lead) and resurfaced repeatedly. "We're done with X" is always `close_concept('concept:<type>:<slug>', ...)`. Row-level status PATCHes are reserved for genuine row-level lifecycle (lead becomes contacted; task becomes in_progress); for "this conceptual work is done" the ledger entry is mandatory.

**Sub-rules:**

- A `concept_id` is a stable, human-readable slug, prefixed by type (`concept:org:disney`, `concept:guest:firstname-lastname`, `concept:vis:event-2026-q3`). Slug derivation is deterministic via `compute_concept_slug(name)`.
- Terminal status values are the **existing constraint-permitted vocabulary** (`closed_lost` for leads, `superseded` for tasks). Inventing new tokens (`dead`, `archived`, etc.) is what the runbook attempted and what the constraint correctly rejected.
- `reopen_concept` preserves history (`superseded_at`), never deletes. To re-engage a concept that was previously closed, write a new row with the same `concept_id`; the ledger records the concept is once again open.
- All callers (RPCs, edge functions, agent code, future workflows) set `app.changed_by` and `app.source` before any status UPDATE so the AFTER UPDATE trigger writes a properly-attributed `status_change_log` row.
- The `concept_decisions` table is append-only-by-convention (UPSERT updates `decided_at` / `reason` but never DELETEs); `audit_log` entries are immutable.

### 15.17 Harness learning uses one remote inbox, not machine collectors

Control Center owns the operational intake for redacted harness observations;
`krishanraja/ai-harness` owns accepted doctrine and releases. Capable clients
submit one strict event envelope to a machine-authenticated Vercel route. A
separate read-only route lets the GitHub observer import unseen events using a
monotonic cursor. The importer appends evidence only and has no write path to a
skill, contract, registry or rule.

There is no local daemon, scheduled local collector or n8n workflow in this
path. n8n can emit evidence about its own work like any other surface, but it
does not schedule, classify, propose or promote harness learning. The staged
implementation and its release gate are recorded in ADR-020 and
`docs/plans/harness-learning-inbox/STATE.md`; it is not live until the migration,
deployment, secrets and end-to-end canary are separately applied and verified.

---
