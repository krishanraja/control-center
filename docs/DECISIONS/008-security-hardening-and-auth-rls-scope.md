# ADR-008: Database security hardening now; auth + RLS deferred, scoped

- Status: Accepted
- Date: 2026-07-01
- Deciders: Krish

## Context

A Supabase security-advisor audit of the production project
(`gojpffsrxybbpbdzzrvs`) returned 142 findings (4 ERROR / 122 WARN / 16 INFO).
The app is a **single-operator, anon-key** dashboard: the browser reads and does
low-stakes writes with the public anon key; sensitive writes go through `/api`
with the service role. That model means several advisor findings are *load-
bearing by design* — most notably the `SECURITY DEFINER` view `decisions_waiting`
that the entire Home page reads, and the `USING(true)` write policies the
one-click actions depend on. "Fixing" those naively would break the live app.

## Decision

**Apply the two hardening categories that are safe under the current model; defer
the rest, which require an authentication layer.**

Applied (see [`DB_HEALTH.md`](../DB_HEALTH.md), migrations
`20260701091101_cc_harden_function_search_path` and
`20260701091135_cc_lockdown_security_definer_function_execute`):

1. **Pinned `search_path`** on all 39 user-defined functions missing one
   (advisor 0011). Extension functions excluded; all reference only `public`, so
   behaviour is preserved.
2. **Locked down `SECURITY DEFINER` functions** (advisors 0028/0029): revoked
   `EXECUTE` from `public`/`anon`/`authenticated`, re-granted to `service_role`.
   Closes the hole where the *public* anon key could invoke privileged admin RPCs
   (`refresh_agent_plans`, `marcus_daily_pull`, `sync_audience_contact`, …).
   Caller-audited safe: the frontend makes zero `.rpc()` calls, `/api` + cron use
   the service role, and triggers fire independent of caller grants.

Both are reversible and follow existing precedent in the repo
(`autoscore_revoke_anon_execute`, `skill_induction_pin_search_path`).

## Alternatives considered

- **Convert the 4 ERROR `SECURITY DEFINER` views to `SECURITY INVOKER`.**
  Rejected now — `decisions_waiting`/`triage_queue` are read by anon *because*
  they are definer; converting blanks the dashboard until proper RLS exists.
- **Tighten the 37 `USING(true)` write policies.** Rejected now — they are what
  lets the anon client perform one-click Approve/Reject/Done writes.
- **Move `vector`/`http` out of `public`.** Rejected now — breaks unqualified
  references across many functions; schedule with a references sweep.
- **Do nothing.** Rejected — the anon-callable privileged RPCs were a real,
  cheap-to-close escalation vector.

## Consequences

- **Positive:** ~83 advisories cleared (39 + 44) with zero app impact, verified
  by anon-read smoke tests before/after. Privilege-escalation surface removed.
- **Negative:** ~59 advisories remain, all gated behind the auth decision below.
  Residual (low, reversible): an out-of-band caller using the *anon* key to call
  a definer RPC now fails — switch it to the service-role key.
- **Neutral:** the anon-key model is unchanged and remains documented in
  [`SECURITY.md`](../SECURITY.md).

## Follow-ups — the deferred auth + RLS scope

The remaining ERROR views + write policies are blocked on introducing real auth.
Recommended path when prioritised (supersedes the stale "ADR-006 (planned)"
reference in `SECURITY.md`):

1. **Add Supabase Auth** (magic-link for the single operator) so requests carry a
   real `authenticated` JWT instead of the shared anon key. Retire the anon
   client for reads/writes, or keep anon strictly for the health endpoint.
2. **Author RLS policies** on the source tables (`tasks`, `leads`, `guests`,
   `content_ideas`, `visibility_targets`, `customers`, …): `SELECT`/write for
   `authenticated`; deny `anon`. Replace the `USING(true)` write policies.
3. **Convert the 4 `SECURITY DEFINER` views to `SECURITY INVOKER`** once the
   underlying tables enforce RLS for `authenticated` — verify `decisions_waiting`
   still returns rows for the signed-in operator before shipping.
4. **Relocate `vector`/`http`** out of `public` with a references sweep.
5. Land each step behind a feature flag with an anon→auth cutover, and update
   `SECURITY.md` + this ADR's status in the same PR.
