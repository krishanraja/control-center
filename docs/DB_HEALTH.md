# Database Health & Security Remediation

> Snapshot of the Supabase project `gojpffsrxybbpbdzzrvs` (mind/make OS) taken
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
