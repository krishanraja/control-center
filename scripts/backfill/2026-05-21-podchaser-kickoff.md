# Kick-off — first batch of Podchaser podcasts (2026-05-21)

**One-time job.** Forces a P1 (Monday) run of `Nova | Mindmaker OS |
Closed-Loop PR Engine` so the first wave of podcasts lands in
`podchaser_podcasts` within minutes of merge, instead of waiting until
next Monday's natural cron.

## Pre-requisites

In order:

1. `scripts/migrations/2026-05-21-podchaser-podcasts.sql` applied.
2. `scripts/n8n/podchaser-oauth-patch.md` applied (auth fix).
3. `scripts/n8n/podchaser-surface-patch.md` applied (upsert taps).

If any of those is missing, abort — the run will succeed silently but
write nothing.

## Pre-check

```sql
SELECT count(*) FROM podchaser_podcasts;
```

Should be `0`.

## Run

The PR Engine's `Day Router` dispatches on weekday. To force a P1 run on
a non-Monday, edit the router parameter or just call the workflow with a
synthetic input. Simplest:

1. Open `Nova | Mindmaker OS | Closed-Loop PR Engine` in N8N.
2. Open the `Day Router` (n8n-nodes-base.code) node.
3. Temporarily replace the body with `return [{ json: { pipeline: 'P1' } }];`
4. Save. Click `Execute Workflow`.
5. Wait for completion (~2-5 minutes — the Podchaser search returns 10
   shows, each one runs through Apollo + Sonnet).
6. **Revert the Day Router** back to its original weekday-switch body.
   Save again.

(Don't skip step 6 — leaving the router pinned to P1 disables the speaker
and bump pipelines.)

## Verify

```sql
SELECT
  count(*)                                          AS total,
  count(*) FILTER (WHERE fit_score IS NOT NULL)     AS scored,
  count(*) FILTER (WHERE host_email IS NOT NULL)    AS with_email,
  count(*) FILTER (WHERE latest_episode_date IS NOT NULL) AS with_episode
FROM podchaser_podcasts;
```

Acceptance: `total ≥ 8`, `scored ≥ 6`, `with_episode ≥ 6`.
`with_email` may be `0` if Apollo doesn't match the hosts — that's fine,
the cards still render with the Listen + Host LinkedIn fallbacks.

Refresh Control Center → desktop Home → Visibility lane. Rose-bordered
"podcast target" cards now appear at the top of the lane (highest
fit_score first), with the Listen + Pitch host CTAs.

## If the workflow errored

Open the failed execution. The most likely cause is the OAuth patch
isn't actually wired — the `Podchaser: Search Podcasts` node will fail
with `Invalid authorization request`. Re-check
`scripts/n8n/podchaser-oauth-patch.md` step by step. Specifically:

- The `Get Podchaser Token` node is **before** the Search node.
- The Search node's auth is set to `None` (not the old `Podchaser` cred).
- The Search node sends header `Authorization: Bearer
  {{ $('Get Podchaser Token').item.json.access_token }}`.

## Going forward

The natural P1 schedule (Mondays) takes over after this kick-off. No
manual triggering needed unless you want to refresh sooner.
