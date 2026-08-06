# COMPOUND production release gate

- Prepared: 2026-08-06 EDT
- Status: production vertical slice deployed and signed-in verification passed
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

Completed:

1. Created and confirmed the explicitly designated Auth user `hello@krishraja.com`.
2. Inserted only that user's id into `compound.members` and seeded the 3-month and 1-year private starter snapshots.
3. Set the production Site URL and redirect allowlist to `https://compound.krishraja.com`, retained localhost development redirects, and disabled public signup.
4. Preserved and read back the hosted email-confirmation, rate-limit, OTP-length and TOTP settings.
5. Verified a generated magic link resolves to the production domain, the member can read both private snapshots, and anonymous access is denied.

## Live-answer gate

The live route uses Vercel AI Gateway with a short-lived project OIDC token. No static provider key is stored or copied.

Completed:

1. Deployed only `compound-ask`; it is active with JWT verification enabled.
2. Set `openai/gpt-5.4-mini` as the current Gateway model based on the live Vercel model catalog.
3. Verified the same-origin proxy denies unauthenticated calls with 401.
4. Verified signed-in streaming through the live custom domain using a temporary synthetic snapshot with no personal or portfolio content.
5. Verified `meta`, `delta`, `evidence` and `done` events, one persisted user/assistant pair and idempotent retry behavior.
6. Deleted the synthetic snapshot and its chat rows; production readback returned two starter snapshots and zero synthetic test messages.

## Vercel gate

1. Completed: separate project `compound`, same GitHub repository, root `compound/`.
2. Completed: only the two public Supabase values were added to development, preview and production; demo mode is absent.
3. Completed: production build ready; `/` and `/api/compound-ask` verified; CSP/noindex/security headers pass.
4. Completed: `compound.krishraja.com` is verified and serves the latest production deployment over HTTPS.
5. Completed for the live sign-in shell and the signed-in private data and Ask routes.

## Repository gate

Commit and push remain separate external actions. Before either:

1. Review the complete untracked/modified file set.
2. Keep `supabase/.temp/`, local environments, test output and screenshots uncommitted.
3. Confirm no credential pattern is present.
4. Commit on `feat/compound-foundation`; do not merge to the default branch without a separate decision.

## Credentials

Previously pasted GitHub, Supabase and Vercel tokens are treated as compromised and are not used. Rotate or revoke them outside this task before any production release.
