# Security

> **Scope.** This document inventories the secrets the platform depends on,
> describes the auth model today and tomorrow, and defines the rotation
> procedure when a secret is suspected to be compromised.
>
> **Not in this document.** Deployment configuration steps for setting these
> values live in [`DEPLOYMENT.md`](./DEPLOYMENT.md). Database-level access
> control (RLS) is sketched in
> [`DATABASE.md`](./DATABASE.md#row-level-security-rls).

---

## Threat Model

| Threat | In scope today | Notes |
|---|---|---|
| Credential leakage via repo | Yes | `.env*` is gitignored; hard-coded secrets are blocked at PR review. |
| Compromised Vercel project | Yes | Vercel project isolation + per-environment env vars. |
| Compromised Supabase service-role key | Yes | Most damaging single secret; full DB access. |
| Hostile collaborator | Out of scope | Single-operator product. Audit log gives forensic recovery if this changes. |
| Multi-tenant data leakage | Out of scope today | Will require RLS — ADR-006 (planned). |
| End-user XSS | Low | UI never renders user-supplied HTML; markdown is plaintext-rendered today. |

---

## Secrets Inventory

Every secret used by the system, where it lives, and what it grants.

| Secret | Owner | Storage | Grants |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Platform | Vercel env (Production/Preview/Development); `.env` locally | Public Supabase project URL. Not sensitive on its own but pairs with the anon key. |
| `VITE_SUPABASE_ANON_KEY` | Platform | Vercel env; `.env` locally | Anonymous client access subject to RLS. Embeddable in the browser bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | Platform | Vercel env (server-only); never in client bundle | Bypasses RLS. Used by `api/_supabase.ts`. **Most sensitive secret in the system.** |
| `ACCESS_CODE` | Platform | Vercel env (server-only); never in client bundle | Shared access code for the edge gate (`middleware.ts`). Submitted on a single-field unlock page; the gate stores its SHA-256 in a cookie. Keeps the web UI from being publicly browsable. Low-sensitivity: it is a curtain, not real auth — the data layer still relies on the anon key + RLS. |
| `SYNC_SECRET` | Platform | Vercel env; VPS sync pipeline env | Authenticates `POST /api/sync` requests. If absent, sync auth is disabled (acceptable in dev). |
| `N8N_API_KEY` | Platform | Vercel env (server-only) | Auth for `/api/status` calls against the N8N API |
| `N8N_FEEDBACK_URL` | Platform | Vercel env | Server-side mirror of the feedback webhook URL |
| `OPENAI_API_KEY` | Platform | Vercel env (server-only) | Skill Forge endpoints (`/api/skills/*`) |
| `SKILL_DELIVERY_WEBHOOK_URL` | Platform | Vercel env (server-only) | Where Skill Forge ships generated skills |
| N8N webhook tokens (X-Agatha-Secret, etc.) | Each workflow | N8N credential vault | Authenticate Supabase → N8N webhook delivery. Rotated per agent. |
| Google Drive OAuth refresh token | Drive sync worker on VPS | Worker host secret store | Read-only access to brief Docs. |
| Vercel deploy hooks | Platform | Vercel UI | Trigger redeploys. Treat as low-sensitivity but still scoped. |

**Rule.** Any new secret must land in this table in the same PR that
introduces it. A secret missing from this table is treated as a security
incident.

---

## Storage Rules

1. **Never commit a secret.** `.env`, `.env.local`, `.env.*.local`,
   `credentials.json`, and `*.pem` are gitignored. CI runs secret-scanning
   on every PR.
2. **Server-only secrets stay server-only.** `SUPABASE_SERVICE_ROLE_KEY`,
   `SYNC_SECRET`, and N8N tokens must never appear under `src/` or in any
   value prefixed with `VITE_` (Vite inlines `VITE_*` into the client
   bundle).
3. **Local dev uses anon key only.** Local development should never need
   the service-role key. If a feature requires it, it belongs behind an
   `/api` endpoint, not in the browser.
4. **Preview environments isolate.** Vercel Preview env vars must point at
   a separate Supabase project (or a clearly labelled staging schema), not
   production.

---

## Authentication and Authorisation

### Today

| Surface | Auth |
|---|---|
| Web UI | Edge gate (`middleware.ts`): a single-field access-code page that, on the right `ACCESS_CODE`, sets a SHA-256 cookie and lets the request through. A curtain against casual/public access, **not** real authentication — a technical visitor can still reach the Supabase data layer directly (anon key + RLS). Fails open if `ACCESS_CODE` is unset. |
| `/api/*` | Not gated by the edge middleware (see `matcher` in `middleware.ts`); each endpoint keeps its own model below. |
| `/api/sync` | Shared-secret header `x-sync-secret` (optional in dev when `SYNC_SECRET` is unset). |
| `/api/trigger-agent` | None today. |
| `/api/health` | None today (intentionally — used by external monitors). |
| Other `/api/*` | None today. |

### Tomorrow (planned, not implemented)

| Surface | Planned auth |
|---|---|
| Web UI | Supabase Auth + magic-link or SSO. |
| All `/api/*` mutations | Supabase JWT or shared secret per-endpoint. |
| Multi-tenant access | RLS on every table keyed by `org_id`. See [`DATABASE.md`](./DATABASE.md#row-level-security-rls). |

When any of these land, file an ADR in [`docs/DECISIONS/`](./DECISIONS/)
covering the trade-off and update the table above in the same PR.

---

## Rotation Procedure

If a secret is leaked, suspected leaked, or rotates on schedule:

1. **Contain.** Identify the secret in the [Secrets Inventory](#secrets-inventory). Note every place it lives.
2. **Mint a replacement** in the originating service (Supabase, Vercel, N8N, Google).
3. **Update every storage location** — Vercel env (Production, Preview, Development), VPS pipeline, N8N credentials, local `.env` for active developers.
4. **Trigger a fresh deploy** so Vercel functions pick up the new value (env-var changes do not auto-redeploy).
5. **Revoke the old secret** in the originating service.
6. **Verify**: hit `/api/health` and the affected endpoints; tail `audit_log` for unauthorised attempts.
7. **Log the rotation** with an `audit_log` row: `actor = 'krish'`, `event_type = 'secret_rotated'`, `target = '<secret name>'`, `details = { reason }`.

If the leaked secret is `SUPABASE_SERVICE_ROLE_KEY`, also:

- Treat the database as potentially compromised. Inspect `audit_log` for
  unfamiliar `actor` values or unexpected `event_type` patterns.
- Consider whether to dump and restore from a known-good snapshot.

---

## Reporting a Vulnerability

If you find a vulnerability:

1. **Do not file a public GitHub issue.** Email the operator privately.
2. Include reproduction steps, affected endpoints/tables, and impact.
3. Expect acknowledgement within one working day.

This product is single-operator — there is no security team. The operator
is the security team. Treat report quality accordingly.

---

## CI Safeguards

| Check | Where | What it does |
|---|---|---|
| Secret scanning | `mcp__github__run_secret_scanning` (on demand) | Surfaces detected secrets in pushed commits. |
| ESLint | CI `verify` job | Catches unused-disable directives that often indicate a hasty silenced warning. |
| Type check | CI `verify` job (`npx tsc --noEmit`) | Catches accidental misuse of typed wrappers around env vars. |

CI does not yet run a secrets diff on every PR. When it does, document it
here and link the workflow.
