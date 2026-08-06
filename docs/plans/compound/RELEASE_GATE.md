# COMPOUND production release gate

- Prepared: 2026-08-06 EDT
- Status: no production operation authorised or performed
- Target repository: `krishanraja/control-center`, Vercel root directory `compound/`
- Target Supabase project: linked project recorded in `STATE.md`

## Hard stop: do not use normal Supabase migration push

The read-only migration comparison shows a materially divergent history: many remote versions are absent locally, while three unrelated Control Center migrations and the new COMPOUND migration are local-only. `supabase db push --linked --dry-run` correctly refuses to proceed.

Do not run `supabase db push --linked`, `--include-all`, `migration repair` for the remote-only list or a bulk history rewrite. Those operations could apply unrelated Control Center changes or falsify migration history.

## Exact database release path

After separate approval:

1. Apply only `supabase/migrations/20260806220210_compound_foundation.sql` through an authenticated Supabase SQL surface that executes the selected file exactly.
2. Read back only the new `compound` schema: tables, columns, constraints, grants, policies, forced-RLS flags, indexes and triggers.
3. Test two designated users or JWTs: the allowlisted user can read their row; an unlisted or anonymous caller cannot read or write COMPOUND data.
4. Add `compound` to the project's Data API exposed schemas without removing or changing existing schemas.
5. Only after successful catalog and RLS readback, record migration version `20260806220210` as applied. Do not alter any other migration-history row.

## Authentication gate

1. Confirm the exact existing Supabase Auth user who should receive COMPOUND access.
2. Insert only that user's id into `compound.members`.
3. Add the COMPOUND Vercel URL and final domain to Auth's additional redirect URLs. Do not replace the existing shared project's Site URL or Control Center redirects.
4. Verify magic-link sign-in, member access and non-member rejection with designated accounts.

## Live-answer gate

The function expects a dedicated OpenAI-compatible server configuration. The values must be supplied through a secure provider surface, never chat, Git, Vercel browser variables or a public database table.

- `COMPOUND_LLM_BASE_URL`
- `COMPOUND_LLM_API_KEY`
- `COMPOUND_LLM_MODEL`

After the provider and model are named and the secret is set:

1. Deploy only `compound-ask` with JWT verification enabled.
2. Read back the deployed function revision and secret names, never the secret value.
3. Test one normal question, one stale-data question, one boundary request and one provider failure.
4. Confirm the question and one assistant answer persist once per request id, evidence comes from the selected snapshot and no Control Center schema is queried.

## Vercel gate

1. Create a separate Vercel project connected to the same GitHub repository with root directory `compound/`.
2. Set only the public frontend values `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; ensure `VITE_COMPOUND_DEMO_MODE` is absent or false.
3. Deploy a preview, read back its Git revision, test `/` and the `/ask` deep link, Auth redirects, CSP, no-index headers and browser console/network state.
4. Attach `compound.krishraja.com` only after the matching preview passes.
5. Run the same mobile/desktop QA cases against the final domain.

## Repository gate

Commit and push remain separate external actions. Before either:

1. Review the complete untracked/modified file set.
2. Keep `supabase/.temp/`, local environments, test output and screenshots uncommitted.
3. Confirm no credential pattern is present.
4. Commit on `feat/compound-foundation`; do not merge to the default branch without a separate decision.

## Credentials

Previously pasted GitHub, Supabase and Vercel tokens are treated as compromised and are not used. Rotate or revoke them outside this task before any production release.
