# Database Health & Security Remediation

> Snapshot of the Supabase project `gojpffsrxybbpbdzzrvs` (Mindmaker OS) taken
> 2026-07-01, plus the security remediation applied that day. Read alongside
> [`DATABASE.md`](./DATABASE.md).

## Snapshot

- **Status:** ACTIVE_HEALTHY, Postgres 17.6. Populated and live
  (287 `decisions_waiting`, 274 leads, 400 content ideas, 133 tasks, 17
  customers, 14 agents at time of audit).
- **Read path:** the browser anon key can read the app tables/views (verified
  HTTP 200 across leads / decisions_waiting / content_ideas / guests / tasks /
  customers / visibility_targets / agents). No RLS change was made, so this is
  unchanged by the remediation below.
- **MRR = $0 is correct, not a bug.** `customers.kind` is `paid`(1) /
  `free_signup`(6) / `waitlist`(3) / `churned`(7); the one paid row has no
  active `mrr_usd`, so the ticker's $0 is truthful.

## Security remediation applied (2026-07-01)

Supabase security advisors reported **142** items (4 ERROR / 122 WARN / 16 INFO).
Two migrations closed the two categories that could be fixed **without changing
the app's behavior**, verified before and after:

| Migration | Advisor | Effect |
|---|---|---|
| `20260701091101_cc_harden_function_search_path` | 0011 `function_search_path_mutable` (39) | Pinned `search_path = public, pg_temp` on all 39 user-defined functions that lacked one. Extension functions (pgvector/http) excluded; every target references only `public` (audited), so behavior is preserved. **39 → 0.** |
| `20260701091135_cc_lockdown_security_definer_function_execute` | 0028/0029 definer-executable (44) | Revoked `EXECUTE` from `public`/`anon`/`authenticated` on all user-defined `SECURITY DEFINER` functions and re-granted to `service_role`. Closes the hole where the public anon key could invoke privileged admin RPCs (`refresh_agent_plans`, `marcus_daily_pull`, `sync_audience_contact`, `mark_entity_emailed`, `audit_*`, …). **anon-executable 22 → 0, authenticated 22 → 0**; `service_role` retains all 24. |

**Why these are safe (caller audit):** the Control Center frontend makes **zero
`.rpc()` calls** (anon never invokes these functions); the `/api` layer and cron
use the **service role** (preserved by the re-grant, verified on
`mark_target_complete`); and triggers execute independently of caller `EXECUTE`
grants, so the n8n webhook trigger (`notify_n8n_orchestrator`) and every other
trigger keep firing. Both migrations are **fully reversible**. This follows the
codebase's own precedents (`autoscore_revoke_anon_execute`,
`skill_induction_pin_search_path`).

**Residual risk (low, reversible):** if an out-of-band caller (e.g. an n8n
workflow or agent) calls one of these SECURITY DEFINER RPCs using the *anon* key
rather than the service-role key, it will now get a permission error. That would
itself have been the vulnerability we closed; switch that caller to the
service-role key, or `grant execute on function <sig> to anon;` to revert a
specific one.

## Deliberately NOT changed (would break the live app — needs a product decision)

| Advisor | Count | Why left as-is |
|---|---|---|
| 0010 `security_definer_view` (ERROR) | 4 | `decisions_waiting`, `triage_queue`, `standards_efficacy`, `attribution_app_health`. **`decisions_waiting` is the view the entire dashboard reads via the anon key** — it is SECURITY DEFINER *on purpose* so anon can read it without per-table RLS. Converting to SECURITY INVOKER would blank the app. Proper fix = design explicit RLS on the underlying tables first, then convert. Product decision. |
| 0024 `rls_policy_always_true` (WARN) | 37 | `USING(true)` write policies on `tasks`, `approvals`, `feedback_queue`, `content_ideas`, etc. These are **load-bearing**: the app's one-click actions write with the anon key and rely on them. Tightening requires introducing auth/ownership semantics first. Product decision. |
| 0008 `rls_enabled_no_policy` (INFO) | 16 | RLS is on with no policy → already deny-all to anon/authenticated (secure). Benign; touched by service-role paths only. |
| 0014 `extension_in_public` (WARN) | 2 | `vector` and `http` live in `public`. Moving them can break unqualified references across many functions. Low priority; schedule with a references sweep. |

Net: **142 → ~59** advisories remaining, all of which are the "needs a design
decision" class above rather than quick fixes.

## Drift restoration (2026-08-21)

The two categories ADR-008 *applied* on 2026-07-01 had partially drifted back:
functions and RPCs added after that date did not follow the precedent, so the
advisor was reporting the same class of finding again.

Migration `20260821200000_restore_adr008_hardening_drift.sql`:

| Advisor | Was | Now |
|---|---|---|
| 0011 `function_search_path_mutable` | 6 functions unpinned (`events_for`, `fix_lane_sourcing_type`, `maya_striking_distance_shift_position`, `operator_tz`, `scrub_dead_events`, `touch_updated_at`) | all pinned to `public` |
| 0028/0029 anon/authenticated can execute SECURITY DEFINER | 2 (`audience_import_proxy`, `reject_reason_neighbors`) | revoked from `PUBLIC`/`anon`/`authenticated`, granted to `service_role` |

`audience_import_proxy` was the one worth closing quickly: SECURITY DEFINER,
takes a CSV, writes contacts, and was reachable by anyone holding the anon key
that ships in the browser bundle. `scripts/migrations/2026-07-29-audience-import-source.sql`
had already run `revoke all ... from public`, but that does **not** remove the
grants Supabase issues directly to the `anon` and `authenticated` roles — the
roles have to be named. That is the same correction ADR-008 made, and the same
trap will catch the next function added this way.

Caller-audited before the change, and still true: `src/` makes **zero** `.rpc()`
calls, and both functions are called only from `api/` routes on the service-role
key. Verified after with `has_function_privilege`.

Nothing ADR-008 deferred was touched: the SECURITY DEFINER views, the
`USING(true)` write policies, and `vector`/`http` in `public` are all unchanged
and still blocked on the auth decision.

## Broken selects and the dedup columns that never landed (2026-08-21)

A sweep of all 187 `.from().select()` sites in `api/` against the live schema
found four routes naming columns that do not exist. PostgREST rejects the whole
query when one column is unknown, so each failed differently and none loudly:

| Route | Selected | Actual | Symptom |
|---|---|---|---|
| `api/automations/index.ts` | `workflow_runs.agent` | `agent_id` only | 400 on every request |
| `api/visibility-targets/[id]/apply.ts` | `visibility_targets.name` | `title` | **every apply returned 404** |
| `api/_outreachCandidates.ts` | `email_drafts.recipient_email`, `.sent_at` | neither exists | wrapped in try/catch → ready drafts silently always empty |
| `api/briefs/assemble.ts` | `bets.title` | `hypothesis` | bets silently dropped from the weekly brief |
| `api/_dedup-backfill.ts` | `visibility_targets.event_url_norm`, `.title_norm` | did not exist | visibility dedup backfill could not run |

That last one was the tip of a larger problem. `20260617120000_dedup_keys_and_synthesis`
is **in the applied ledger but its column additions were never in the database**
for `leads`, `guests` and `visibility_targets` — 10 columns, all absent.
`content_ideas` and `contacts` have theirs only because later migrations
(`content_ideas_embedding_and_synthesis`, `contacts_guest_promotion_keys`,
`network_intelligence`) happened to add them. So `_dedup.ts` `checkDuplicate()`,
described in its own header as "called from every ingest path", had been
erroring for three of its five tables.

`20260821210000_dedup_keys_backfill_missing_tables.sql` adds and backfills all
ten (leads 261/261, guests 41/41, visibility_targets 62/62) and creates the
unique indexes on `leads` and `guests`, both verified duplicate-free first.

**Two duplicate visibility targets need a human merge.** They exist because the
dedup gap above let them in, and they are why `visibility_targets.event_url_norm`
is indexed non-uniquely for now. Merge these, then make the index unique:

- `https://www.cxgoalkeeper.com/podcast`
  — `fd3ea942…` "Business Transformation Pitch with The CX Goalkeeper" [applied]
  — `e7338b0f…` same pitch, longer title [queued]
- `https://www.sectionai.com/events/apply-to-speak`
  — `421e8ea9…` "Section Monthly Executive AI Fireside Chats with Greg Shove" [applied]
  — `4cddb507…` "Section AI:ROI Conference (Virtual)" [applied]

`scripts/check-select-columns.mts` re-runs the sweep. It is not a CI gate — it
needs live credentials and CI has no database — so run it after changing a
select or applying a migration.

## Migration ledger divergence (informational — not reconciled)

The applied-migration ledger (`supabase_migrations`) and the repo's
`supabase/migrations/` diverge in versioning: several logical migrations were
applied out-of-band (via `scripts/migrations/` or the dashboard) under different
timestamps than the repo files (e.g. `backburner` applied as `20260612154350`
vs repo `20260612090000_backburner.sql`), and some repo files
(`daily_focus`, `tasks_inbox`, `visibility_classification`,
`content_inspiration_pipeline`) are not in the ledger though their objects exist.
**Do not `supabase db push` blindly** — it would try to replay already-applied
DDL and fail. Reconciling the ledger (marking applied files as applied, no DDL
re-run) is a separate, deliberate task.
