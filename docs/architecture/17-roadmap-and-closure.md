# Aspirational targets and the closure roadmap: reference detail

> **Reference detail for section 17 of [`MINDMAKE_OS_ARCHITECTURE.md`](../MINDMAKE_OS_ARCHITECTURE.md).**
> This is the deep text that used to sit inside the architecture doc, moved here on 2026-10-05 so the core
> stays small enough for an agent to load. It was written between May and October 2026 and was not
> re-verified line by line on the move. **The core, its section 0a (the canon) and the live source named in
> the core win over anything below.** Dated notes inside the text are history, not current state.
> Redacted on the move: Supabase project refs, Google Drive ids, the n8n instance host and private individuals' names and addresses (Krish's publication ruling of 2026-10-05 keeps infrastructure identifiers and other people's personal details out of this public repo). Everything else is verbatim.

## Known stale in this file (checked 2026-10-05)

- Any line describing a Telegram message, push or "ping" to Krish. The OS has been pull-only since 2026-09-06 (core 0a.4).
- Any line describing an agent writing a Google Doc into Drive, or `sync-to-drive.py`, `cc-doc-creator.sh` or `google_drive_sync` as live. All retired 2026-10-05 (core 0a.5).
- 17.1 (Phase 3 gate) and 17.2 (email-send) are not live plans. Control Center never sends; any change to that is a new ruling by Krish.
- 17.6 mentions a "Mindmake Strategy Day", a retired offer.

---

## 17. Aspirational targets - where this is going

The current state runs. The aspirational state is what closes the gap to Outcome O-1 ("Krish under 2 hrs/day on ops"), O-2 (builder-product MRR + content audience growing, rewritten 2026-07-10), and the OS's North Star (one person running what 15-30 traditionally does).

### 17.1 Phase 3 gate (CFO + CAIO)

Unlocks when:
- 4 consecutive clean Vera audits land (currently tracked; counter exposed in Vera's brief)
- ≥1 Mindmake lead attributable to content/visibility lands and closes
- DecisionsWaitingPanel p50 age_hours under 24

Adds two roles: Chief Financial Officer (autonomous revenue + spend visibility) and Chief AI Officer (cross-portfolio AI strategy synthesis).

### 17.2 Email-draft → email-send (gated)

Today: the system drafts; Krish sends. Aspirationally: per-intent, per-entity, per-recipient send rules with a 60-second undo window. Reached only when:
- email_drafts ledger shows ≥100 drafts created with <5% Krish-edits-before-send
- A formal `send_policies` table defines per-channel rules (cold vs warm; first vs follow-up; with/without prior reply)
- Vera ships a `mail-send-audit` workflow that pattern-checks every queued send before release

Until those conditions are met, drafts only.

### 17.3 Multi-channel `decisions_waiting`

Current `decisions_waiting` unifies ten kinds today (see §4.7). The aspirational expansion adds:
- `customer_check_in_due` (paid customers Krish hasn't talked to in N days)
- `bet_resolution_due` (live bets past their time_box_days)
- `kill_list_candidate` (tasks ≥21 days untouched - currently a separate modal, should be unified)

And, with the closure architecture, every branch additionally filters via `LEFT JOIN concept_decisions ... WHERE cd IS NULL OR cd.superseded_at IS NOT NULL` so closed concepts never reappear regardless of generator behaviour.

### 17.4 Truth-Reconciler-driven self-pruning

Current Truth Reconciler reports drift weekly. Aspirational: it proposes corrections automatically (e.g. "Cleo brief references a workflow_id that no longer exists; PR-edit the brief"). Krish approves in Org tab; render-identity picks up the patch within 15 min.

### 17.5 Mobile-first action surface

Lead/Customer/Guest cards expose Draft email + Deep enrich on mobile DetailSheets. Aspirational: every Decision-Waiting row offers its primary action with a single tap, including from a 320px viewport, with haptic-style toast confirmations. Polish iterations track in `docs/AUDIT_STATUS.md`.

### 17.6 Outbound conversion attribution

Today: customers have `attribution_channel`, `attribution_lead_id`, `attribution_task_id`. Aspirational: every `email_drafts.id` is joinable to the eventual `customers` row that closed, so Krish can see "this Mindmake Strategy Day closed because of this draft Cleo wrote on this date." Closing this loop turns the email-draft surface into measurable revenue, not just convenience.

### 17.7 Closure architecture - what's live and what's not yet built

This is the single consolidated home for the closure-architecture roadmap. The body above describes the **live** foundation; this section is the authoritative list of what is built versus planned.

**Live (current state).**
- `concept_id text` on `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas` (all indexed, backfilled).
- Tables `concept_decisions` and `status_change_log`.
- RPCs `compute_concept_slug`, `close_concept`, `reopen_concept`; trigger fn `log_status_change` + AFTER UPDATE triggers on `tasks` and `leads`.
- Standards CLO-001 / CLO-002 / CLO-003.
- `audit_log` event types `concept_closed` / `concept_reopened`.
- Control Center route `/api/concepts/[id]/close` (→ `close_concept`) and the "Close concept" action on Cards.
- Constraint vocabulary canonicalized on `closed_lost` (leads) / `superseded` (tasks).

**Not yet built (planned).**
- The conversational **Closure Intent Receiver** n8n workflow (Agatha chat → `close_concept`), Schedule-Trigger-based, not legacy `cron`.
- The `/api/concepts/[id]/reopen` route and wiring of "Close concept" buttons across all remaining card UIs.
- **Generator guards** - every generator that inserts into `tasks`/`leads`/`guests`/`visibility_targets`/`content_ideas` queries `concept_decisions` first and skips (or flags) if the concept has a live `closed` decision.
- **Synthesis-time `LEFT JOIN concept_decisions`** in the Marcus / Vera / Agatha paths and the `decisions_waiting` view (the `decisions_waiting` branch JOIN, and the per-fetch JOINs in synthesis).
- `concept_id` extension to `customers` and `opportunities`.
- **Real-event auto-closure** - Stripe `customer.subscription.created` → `close_concept` on the lead concept; Gmail draft sent → `close_concept` on the email_drafts concept; Instantly campaign start → `close_concept` on the outbound-task concept.
- The weekly **Vera Closure Audit** workflow (flags any concept reopened > 2 times in 30 days as a closure-criteria misfire) and the reopen-sweeper that feeds `feedback_queue` (§8.13).

### 17.8 Closure-driven brief evolution (aspirational)

If a particular concept class gets reopened > 30% of the time, that's a signal that closures are being made too aggressively (or the closure criteria are wrong for that class). The planned Vera Closure Audit would flag this and propose `corrections` rows targeted at the relevant agent brief, closing the self-improvement loop around closure quality itself.

---
