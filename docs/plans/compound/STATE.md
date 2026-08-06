# COMPOUND delivery state

> Read this file first in every COMPOUND session. Update it in the same commit as each phase transition. It is the single source of truth for delivery status.

## Current status

- Phase: production release; account activation blocked
- State: repository, Supabase migrations, Edge Function, standalone Vercel project and custom domain are live; no Supabase Auth user exists yet, so private member binding and signed-in end-to-end proof require the exact approved email address
- Base revision: `09c0f88750774f014a91d493e86d9acc50065a7c`
- Production release: authorised and deployed
- Supabase production mutation: completed through a guarded migration ledger; only COMPOUND migrations ran
- Vercel project or domain mutation: completed in standalone project `compound`
- Next action: Krish supplies the exact email address that may be created and allowlisted; then create that Auth user, insert its id into `compound.members`, seed the two private snapshots, add the final Auth redirect and run the signed-in live-answer test

## Preflight record

```text
STATE_ROUTE: docs/plans/compound/STATE.md
SOURCE_LAYERS: krish-principles and repository architecture are durable doctrine; COMPOUND-brief_1.md is the approved project requirement; current GitHub main and live provider metadata are current truth; Cloudflare Pages and KV are obsolete for this route
PRODUCT_TRUTH: COMPOUND is a private daily decision surface for one investor, computed under 3 month and 1 year horizons, with questions answered from the same authorised COMPOUND evidence
NON_GOALS: no Control Center navigation, imports, APIs, tables, UI components, data or trading execution; no eToro integration; no Cloudflare runtime
SURFACE_DEPENDENCIES: authenticated shell -> latest successful snapshot -> daily dashboard -> grounded live questions -> holdings editor -> history and threshold audit
VERTICAL_SLICE: one authenticated user sees the latest successful position-health snapshot, changes horizon, asks a question grounded in that snapshot, and can edit an investment without touching Control Center data
FIRST_SURFACE: the approved mobile-first daily dashboard, followed by its live-question interaction
```

## Build contract

```text
TARGET: krishanraja/control-center, feature branch from 09c0f88750774f014a91d493e86d9acc50065a7c
CURRENT RUNTIME: Windows PowerShell, Node 25.5.0, Python 3.14.2, Supabase CLI 2.98.2, GitHub connector authenticated as krishanraja
SOURCE OF TRUTH: this state file for delivery state; Supabase compound schema for runtime state after an approved migration
AUTHORITY: autonomous production completion granted by Krish on 2026-08-06; account identity is still not inferred
PASS SIGNALS: dependency boundary check, migration security checks, deterministic pipeline tests, frontend type/lint/build, representative responsive renders, authenticated persistence readback when access exists
ROLLBACK: main remains untouched; production is isolated to the `compound` Vercel project, `compound` Supabase schema and `compound-ask` function
READBACK: GitHub branch, Supabase migration ledger, PostgREST schema/denial checks, Edge Function revision, Vercel project/domain/deployment and live HTTPS checks
STATUS: production infrastructure live; private account activation awaiting explicit identity
```

## LLM access preflight

```text
SERVICE: Supabase
RESOURCE: gojpffsrxybbpbdzzrvs
OPERATION: read-only secret-name discovery
ACCESS PATH: existing authenticated Supabase CLI session
READBACK: no LLM key was read or copied; Vercel project OIDC is enabled and the live same-origin proxy passes a short-lived project token to the Supabase function
DECISION: AI Gateway uses `openai/gpt-5.4-mini` through Vercel OIDC; static provider credentials are unnecessary
AUTHORITY: the rejected cross-boundary key-copy path was abandoned; Control Center's secret table remains unread by COMPOUND at runtime
```

## Isolation contract

1. Application code lives under `compound/` and has its own package manifest and lockfile.
2. No import may resolve to root `src/`, root `api/`, root `public/` or another Control Center application path.
3. Runtime database access targets only the `compound` schema.
4. The only allowed cross-schema relationship is `compound.members.user_id -> auth.users.id`.
5. Daily-pipeline provider credentials live only in the GitHub `compound-production` environment. Chat uses Vercel's short-lived OIDC identity; no static LLM credential reaches the browser or COMPOUND database.
6. COMPOUND has its own Vercel project, root directory, environment variables and domain.
7. Daily runs publish atomically to Supabase and never commit generated market data into Git.
8. COMPOUND does not appear in Control Center navigation and Control Center does not appear in COMPOUND.
9. The chat function may read only authorised rows in the `compound` schema and may send only the minimum evidence needed to answer the current question.

## Phase ledger

| Phase | Status | Exit evidence |
|---|---|---|
| P0 Repository, runtime and access truth | Done | clean checkout; exact base revision; GitHub connector identity; Supabase project `gojpffsrxybbpbdzzrvs` read back as `ACTIVE_HEALTHY` through the existing CLI session |
| P1 Product and architecture boundary | Locked | approved plan and ADR-009 |
| P2 Daily dashboard concept and rendered mock | Locked | COMPOUND-DASHBOARD-MOCK-V2 approved by Krish after responsive, state and copy checks |
| P2B Live-question interaction and rendered mock | Locked | COMPOUND-ASK-MOCK-V1 approved as a separate `/ask` route; the dashboard remains `/` |
| P3 Supabase schema and RLS | Live pass | three COMPOUND-only migrations applied; schema exposed additively; service read succeeds and anonymous read returns 401 |
| P4 Feed adapters and engines 1 to 2 | Pending | deterministic fixtures, score and failure tests |
| P5 Authenticated frontend vertical slice | Live shell; account blocked | custom domain serves the sign-in shell with no console errors; Supabase Auth currently has zero users, so signed-in proof awaits the explicitly designated email |
| P6 Engines 3 to 4 and falsifier audit | Pending | model contract, suppression and historical check tests |
| P7 Release verification | Infrastructure live; account proof pending | branch pushed; Edge Function active with JWT verification; Vercel deployment ready; custom domain verified; HTTPS/CSP/noindex and unauthenticated API denial pass |

## Current local verification

- COMPOUND source and Supabase boundary checks: pass.
- Frontend unit and component tests: 7 pass, 0 fail.
- Edge Function protocol tests: 4 pass, 0 fail.
- Frontend TypeScript and production build: pass.
- Edge Function Deno type-check: pass.
- Dependency advisory audit: 0 known vulnerabilities.
- Browser UX: 7 mobile/desktop route and data-state cases pass with zero horizontal overflow, visible keyboard focus, practical control heights, reduced motion and no console errors.
- Credential-pattern scan and JSON configuration parse: pass.
- Supabase production migrations: pass; exactly `20260806220210`, `20260806223500` and `20260806231230` applied through the guarded ledger.
- Edge Function: active, version 1, JWT verification enabled.
- Vercel: project `compound`, root `compound/`, GitHub connected, production deployment ready, OIDC enabled.
- Live domain: `https://compound.krishraja.com` verified; HTTPS 200, title `COMPOUND`, CSP present, `noindex, nofollow`, API returns 401 without a user session.
- Live browser: sign-in shell renders with zero console warnings/errors.

## Confirmed decisions

- Same GitHub repository and default branch as Control Center.
- Same Supabase project, isolated through a dedicated `compound` schema and RLS.
- Separate Vercel project at `compound.krishraja.com`.
- Supabase Auth magic link plus a `compound.members` allowlist.
- GitHub Actions runs the daily Python pipeline and writes Supabase without committing generated data.
- One material dashboard render must be approved before frontend implementation.
- Questions stream through a same-origin Vercel OIDC proxy to a Supabase server-side function and use only authenticated COMPOUND evidence.
- The dashboard is the home screen. Ask is additive and may not replace, hide or collapse the approved dashboard.

## Risks and gates

- Shared Supabase means shared operational and service-role blast radius. Schema and RLS isolation do not create physical isolation.
- Shared GitHub means repository permissions are shared. GitHub Environment secrets narrow runtime access but do not create repository security isolation.
- Every credential exposed in chat or the supplied API file remains in remediation. None may be used.
- The FMP rate ceiling and batch quote behavior must be verified with rotated credentials before the full daily call budget is enabled.
- Supabase Auth has zero existing users. Creating or choosing an account from local Git metadata was rejected as an unsafe inference; the exact approved email is the sole account-activation blocker.
- The project redirect URL still needs to be added after the account identity is confirmed; the CLI session cannot safely update the shared Auth redirect list without risking unrelated settings.
- Full daily feed adapters and engines remain outside this vertical-slice release; the initial private snapshot cannot be inserted until its member exists.
