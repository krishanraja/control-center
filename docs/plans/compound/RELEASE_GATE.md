# COMPOUND production release gate

- Last updated: 2026-08-11 EDT
- Target repository: `krishanraja/control-center`
- Vercel project: `compound`, root `compound/`
- Supabase project: `gojpffsrxybbpbdzzrvs`
- Product scope: one internal user; no signup, pricing, billing, or external access

## Rollback ready

- Known-good production revision: `270c0089ce31301b93cf0b51ffa6409b5ea66165`.
- Known-good Vercel deployment: `dpl_C8FBD2bzg6yUwN4LGRmgCAv8mhqW`.
- Recovery: restore that deployment through Vercel, then verify `compound.krishraja.com`, the sign-in shell, and unauthenticated API denial.
- Database changes roll forward. The archive migration is additive and has already been read back successfully.

## Completed production gates

1. The original COMPOUND foundation, schema exposure, login audit, magic-word access, and rate-limit migrations are live.
2. Archive migration `20260811120000_compound_snapshot_archive` is live.
3. Existing snapshots are labelled `starter`; there are no captured or reconstructed rows yet.
4. New archive tables have forced RLS, member-scoped read policies, and service-role write access.
5. The one approved internal member can enter through the server-held magic-word flow. Public signup and email login are absent.
6. The GitHub `Production – compound` environment has the six required database, market-data, and context secrets.
7. PRs #238 and #239 are green in CI and their Vercel previews are ready.

## Intentionally dormant

- Resend is not installed or billed.
- No sending domain, `RESEND_API_KEY`, or `COMPOUND_ALERT_FROM` is configured.
- The scheduled workflow cannot inject Resend variables. Attempt three records failure and lets GitHub mark the workflow failed.
- GitHub workflow failure notifications are the only alert until Krish explicitly decides to externalize COMPOUND or approve a paid alert channel.

## Remaining merge gate

1. Review the exact pipeline diff and confirm the worktree is clean except for intended COMPOUND files.
2. Run `cd compound && npm run verify`.
3. Run pipeline `deno check` and `deno test`.
4. Run `deno check` and `deno test` in `supabase/functions/compound-ask`.
5. Mark PR #238 ready and merge it with a merge commit so the dependent UI branch retains ancestry.
6. Wait for the Vercel production deployment and GitHub Actions workflow registration.
7. Dispatch one current daily run and verify the actual Supabase rows, not only the workflow status.
8. Retarget PR #239 to main, rerun required checks, and merge it.
9. Verify the authenticated production UI in stack and split layouts and prove `/latest.json` is no longer public.

## Release blockers

- A failed or unsupported first capture.
- Fewer or more than three Brief positions when the state is not quiet.
- Holdings affecting ranking.
- Anonymous access to snapshot or history data.
- Production serving the committed private fixture.
- Source and deployment revisions not matching.
- Any new paid service, customer access, additional member, or credential expansion without a separate explicit decision.

The five-year historical reconstruction is not part of the merge gate. It begins only after reliable live capture and runs as separately monitored, resumable 30-day batches.
