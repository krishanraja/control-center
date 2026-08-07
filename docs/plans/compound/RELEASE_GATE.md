# COMPOUND production release gate

- Prepared: 2026-08-06 EDT
- Status: production vertical slice deployed; magic-word sign-in and private dashboard verification passed
- Target repository: `krishanraja/control-center`, Vercel root directory `compound/`
- Target Supabase project: linked project recorded in `STATE.md`

## Supabase release result

The repository migration history remains divergent. Production was released from a temporary guarded ledger containing inert placeholders for the pre-existing remote versions and only the reviewed COMPOUND migrations as pending files.

Do not replace this with a normal repository `db push`, `--include-all`, migration repair or bulk history rewrite.

## Exact database release path

Completed:

1. Applied `20260806220210_compound_foundation.sql` only.
2. Applied additive schema exposure `20260806223500_compound_expose_schema.sql` only.
3. Applied schema-cache reload `20260806231230_compound_reload_schema.sql` only.
4. Applied login audit `20260807002034_compound_login_delivery.sql` only.
5. Applied protected access-attempt audit `20260807010239_compound_magic_word_access.sql` only.
6. Applied the qualified rate-limit function repair `20260807015930_compound_magic_word_rate_limit_fix.sql` only.
7. Read back service access to `compound.daily_snapshots`; anonymous access returns 401.
8. No unrelated migration-history row was repaired or changed.

## Authentication gate

Completed:

1. Created and confirmed the explicitly designated Auth user `hello@krishraja.com`.
2. Inserted only that user's id into `compound.members` and seeded the 3-month and 1-year private starter snapshots.
3. Removed email entry and delivery from the public sign-in journey while retaining the existing internal Auth identity.
4. Stored only the normalized word's one-way digest as a protected Supabase secret; no plaintext word is present in source or database rows.
5. Added an atomic five-failure, 15-minute limit using one-way client fingerprints with forced RLS and no public table access.
6. Verified wrong-word requests return 401 without creating a user, the approved word creates a one-time session, the member can read a private snapshot, and the Auth user count remains exactly one.
7. Verified a real 390-pixel browser reaches the private dashboard and Ask entry point without email.

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
3. Completed: production build `dpl_FaySdeVkLf2BVNxNv4zHMwRfDZyC` ready; `/`, `/api/compound-login` and `/api/compound-ask` verified; CSP/noindex/security headers pass.
4. Completed: `compound.krishraja.com` is verified and serves the latest production deployment over HTTPS.
5. Completed for the live sign-in shell at seven viewport configurations and the signed-in private data and Ask routes.

## Repository gate

Feature commits `12ee977d` and `4e3b047b` are pushed to `feat/compound-foundation`. Main remains untouched pending a separate merge decision.

Before any later commit or push:

1. Review the complete untracked/modified file set.
2. Keep `supabase/.temp/`, local environments, test output and screenshots uncommitted.
3. Confirm no credential pattern is present.
4. Commit on `feat/compound-foundation`; do not merge to the default branch without a separate decision.

## Credentials

Previously pasted GitHub, Supabase and Vercel tokens are treated as compromised and are not used. Rotate or revoke them outside this task before any production release.
