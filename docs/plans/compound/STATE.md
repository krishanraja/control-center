# COMPOUND delivery state

> Read this file first in every COMPOUND session. Update it in the same commit as each phase transition. It is the single source of truth for delivery status.

## Current status

- Phase: production approval gate
- State: local dashboard, additive Ask route, isolated schema migration and streaming function implemented and verified; production gate pending
- Base revision: `09c0f88750774f014a91d493e86d9acc50065a7c`
- Production release: not authorised
- Supabase production mutation: not authorised
- Vercel project or domain mutation: not authorised
- Next action: Krish chooses whether to commit/push the local branch and separately authorise the exact production gates in `RELEASE_GATE.md`

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
AUTHORITY: local documentation, design mocks, implementation and tests; no external mutation or credential use without a separate gate
PASS SIGNALS: dependency boundary check, migration security checks, deterministic pipeline tests, frontend type/lint/build, representative responsive renders, authenticated persistence readback when access exists
ROLLBACK: main at 09c0f88750774f014a91d493e86d9acc50065a7c remains known-good; feature work remains isolated until publication approval
READBACK: local git diff and test artifacts; provider catalog, deployment revision and persisted data after any approved external action
STATUS: local build confirmed; production operations deferred
```

## LLM access preflight

```text
SERVICE: Supabase
RESOURCE: gojpffsrxybbpbdzzrvs
OPERATION: read-only secret-name discovery
ACCESS PATH: existing authenticated Supabase CLI session
READBACK: Edge Function secrets and Vault contain no LLM provider key name; public.app_secrets exists but its rows were not read because that would cross the Control Center data boundary
DECISION: design remains provider-neutral; implementation requires an LLM key to be copied through a secure provider surface into a dedicated Supabase Edge Function secret
AUTHORITY: no secret value read, copied or changed; no production mutation authorised
```

## Isolation contract

1. Application code lives under `compound/` and has its own package manifest and lockfile.
2. No import may resolve to root `src/`, root `api/`, root `public/` or another Control Center application path.
3. Runtime database access targets only the `compound` schema.
4. The only allowed cross-schema relationship is `compound.members.user_id -> auth.users.id`.
5. Daily-pipeline provider credentials live only in the GitHub `compound-production` environment. Chat LLM credentials live only in Supabase server-side function secrets. Neither reaches the browser.
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
| P3 Supabase schema and RLS | Local pass; production pending | local migration includes isolated grants, forced RLS and idempotent chat storage; target execution/readback awaits approval |
| P4 Feed adapters and engines 1 to 2 | Pending | deterministic fixtures, score and failure tests |
| P5 Authenticated frontend vertical slice | Local pass; live proof pending | isolated React build, magic-link shell, snapshot validation, horizon toggle and additive Ask route pass local tests; live persistence awaits approval |
| P6 Engines 3 to 4 and falsifier audit | Pending | model contract, suppression and historical check tests |
| P7 Release verification | Local pass; deployed proof pending | code review, boundary checks, unit/component tests, Deno checks, dependency audit and seven rendered browser cases pass; exact production readback awaits approval |

## Current local verification

- COMPOUND source and Supabase boundary checks: pass.
- Frontend unit and component tests: 7 pass, 0 fail.
- Edge Function protocol tests: 4 pass, 0 fail.
- Frontend TypeScript and production build: pass.
- Edge Function Deno type-check: pass.
- Dependency advisory audit: 0 known vulnerabilities.
- Browser UX: 7 mobile/desktop route and data-state cases pass with zero horizontal overflow, visible keyboard focus, practical control heights, reduced motion and no console errors.
- Credential-pattern scan and JSON configuration parse: pass.
- Live auth, database execution, provider response and deployment: intentionally not run.

## Confirmed decisions

- Same GitHub repository and default branch as Control Center.
- Same Supabase project, isolated through a dedicated `compound` schema and RLS.
- Separate Vercel project at `compound.krishraja.com`.
- Supabase Auth magic link plus a `compound.members` allowlist.
- GitHub Actions runs the daily Python pipeline and writes Supabase without committing generated data.
- One material dashboard render must be approved before frontend implementation.
- Questions stream from a Supabase server-side function and use only authenticated COMPOUND evidence.
- The dashboard is the home screen. Ask is additive and may not replace, hide or collapse the approved dashboard.

## Risks and gates

- Shared Supabase means shared operational and service-role blast radius. Schema and RLS isolation do not create physical isolation.
- Shared GitHub means repository permissions are shared. GitHub Environment secrets narrow runtime access but do not create repository security isolation.
- Every credential exposed in chat or the supplied API file remains in remediation. None may be used.
- The FMP rate ceiling and batch quote behavior must be verified with rotated credentials before the full daily call budget is enabled.
- The private data path can be implemented locally, but authenticated runtime proof requires an approved test account and current provider access.
- The LLM provider, key name and model remain unconfirmed. A dedicated Supabase Edge Function secret must be added through a secure provider surface before runtime proof.
- The local and linked Supabase migration histories diverge. Normal `db push` is blocked and must not be forced; the exact COMPOUND SQL needs a selected-file execution path plus catalog/RLS readback before only its migration version is recorded.
