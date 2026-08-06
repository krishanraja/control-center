# COMPOUND production release gate

- Prepared: 2026-08-06 EDT
- Status: production infrastructure deployed; private account activation blocked on exact approved email
- Target repository: `krishanraja/control-center`, Vercel root directory `compound/`
- Target Supabase project: linked project recorded in `STATE.md`

## Supabase release result

The repository migration history remains divergent. Production was released from a temporary guarded ledger containing inert placeholders for all 111 remote versions and only the three reviewed COMPOUND migrations as pending files.

Do not replace this with a normal repository `db push`, `--include-all`, migration repair or bulk history rewrite.

## Exact database release path

Completed:

1. Applied `20260806220210_compound_foundation.sql` only.
2. Applied additive schema exposure `20260806223500_compound_expose_schema.sql` only.
3. Applied schema-cache reload `20260806231230_compound_reload_schema.sql` only.
4. Read back service access to `compound.daily_snapshots`; anonymous access returns 401.
5. No unrelated migration-history row was repaired or changed.

## Authentication gate

1. Confirm the exact Supabase Auth email that should receive COMPOUND access. The project currently has zero Auth users.
2. Insert only that user's id into `compound.members`.
3. Add the COMPOUND Vercel URL and final domain to Auth's additional redirect URLs. Do not replace the existing shared project's Site URL or Control Center redirects.
4. Verify magic-link sign-in, member access and non-member rejection with designated accounts.

## Live-answer gate

The live route uses Vercel AI Gateway with a short-lived project OIDC token. No static provider key is stored or copied.

Completed:

1. Deployed only `compound-ask`; it is active with JWT verification enabled.
2. Set `openai/gpt-5.4-mini` as the current Gateway model based on the live Vercel model catalog.
3. Verified the same-origin proxy denies unauthenticated calls with 401.
4. Normal signed-in streaming and persistence remain blocked until the member account exists.

## Vercel gate

1. Completed: separate project `compound`, same GitHub repository, root `compound/`.
2. Completed: only the two public Supabase values were added to development, preview and production; demo mode is absent.
3. Completed: production build ready; `/` and `/api/compound-ask` verified; CSP/noindex/security headers pass.
4. Completed: `compound.krishraja.com` is verified and serves the latest production deployment over HTTPS.
5. Completed for the live sign-in shell; signed-in routes await the account gate.

## Repository gate

Commit and push remain separate external actions. Before either:

1. Review the complete untracked/modified file set.
2. Keep `supabase/.temp/`, local environments, test output and screenshots uncommitted.
3. Confirm no credential pattern is present.
4. Commit on `feat/compound-foundation`; do not merge to the default branch without a separate decision.

## Credentials

Previously pasted GitHub, Supabase and Vercel tokens are treated as compromised and are not used. Rotate or revoke them outside this task before any production release.
