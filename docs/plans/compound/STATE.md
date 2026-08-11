# COMPOUND delivery state

> Read this file first in every COMPOUND session. Update it in the same commit as each phase transition. It is the single source of truth for delivery status.

## Current status

- Phase: daily history implementation and calm-brief material mock
- State: the existing production vertical slice remains live on static 2026-08-06 starter data; the Deno daily pipeline, immutable archive migration, authenticated history APIs, and bounded historical Ask are implemented and verified locally but have not mutated production
- Base revision: `c13c08db5a069632924bb224e1af70491691cf3c`
- Working branch: `codex/compound-daily-history`
- Production release: unchanged; the current production deployment remains the rollback target
- Supabase production mutation: gated; the new archive migration may be authored and verified locally but not applied without exact action-time approval
- Vercel and provider mutation: gated; Resend installation, secret provisioning, deployment promotion, and merge remain separate approvals
- Next action: review draft pipeline PR #238 and the cold 390px representative, stale, and quiet Brief mocks, then obtain separate approval for the production migration, GitHub secret provisioning, Resend installation, and UI implementation

## Calm brief and history delivery preflight

```text
STATE_ROUTE: docs/plans/compound/STATE.md
SOURCE_LAYERS: krish-principles and the approved calm-brief plan are durable doctrine; current main, production latest.json, Supabase migrations, and live provider metadata are current truth; the earlier claim that a daily job already runs is obsolete
PRODUCT_TRUTH: COMPOUND is a private, global US-led cross-asset intelligence brief that selects exactly three market-significant positions without using holdings to rank them, preserves the evidence and verdict seen on every captured day, and exposes portfolio relevance only after selection
NON_GOALS: no trade execution; no holdings-led ranking; no new paid market-data provider without a separately approved coverage-gap case; no production migration, secret change, Resend installation, deployment promotion, or merge without its named gate
SURFACE_DEPENDENCIES: immutable daily capture -> authenticated latest/history reads -> one approved mobile Brief -> stack implementation -> split derivation -> Markets/Portfolio/Ask/history surfaces -> preview and production verification
VERTICAL_SLICE: one scheduled or manual idempotent run publishes one member-scoped immutable snapshot with coverage, exactly three deterministic positions, verdicts, falsifiers, citations, and version metadata; the authenticated client reads it as latest and can list prior dates
FIRST_SURFACE: one cold 390px Today in markets mock using the real 123-industry snapshot, with representative, stale, and quiet truth defined; implementation waits for explicit approval
```

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
AUTHORITY: autonomous production completion granted by Krish on 2026-08-06; `hello@krishraja.com` explicitly designated as the Git author and private Supabase member
PASS SIGNALS: dependency boundary check, migration security checks, deterministic pipeline tests, frontend type/lint/build, representative responsive renders, authenticated persistence readback when access exists
ROLLBACK: main remains untouched; production is isolated to the `compound` Vercel project, `compound` Supabase schema and `compound-ask` function
READBACK: GitHub branch, Supabase migration ledger, PostgREST schema/denial checks, Edge Function revision, Vercel project/domain/deployment and live HTTPS checks
STATUS: production vertical slice live and signed-in end-to-end proof passed
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
| P3 Supabase schema and RLS | Live pass | six COMPOUND-only migrations applied; schema exposed additively; service read succeeds and anonymous read returns 401 |
| P4 Feed adapters and engines 1 to 2 | Local pass | 15 Deno tests cover deterministic ranking, holdings invariance, provider contracts, weekend source dates, partial failures, DST scheduling, backfill resume, and alert deduplication |
| P5 Authenticated frontend vertical slice | Live pass | one server-held magic word exchanges for a one-time session without sending email; `hello@krishraja.com` remains the sole internal Auth identity and member; two private snapshots are RLS-readable only by that session |
| P6 Engines 3 to 4 and falsifier audit | Local pass | versioned story contract, stored verdict/falsifier/citations, compare-first API, and compact exact-date historical Ask grounding pass locally; production readback remains gated |
| P7 Release verification | Live pass | feature branch pushed; `compound-login` active with server-proxy authentication and rate limiting; Vercel deployment ready; custom domain verified; HTTPS/CSP/noindex, wrong-word denial, one-time session, signed-in streaming, persistence and idempotent retry pass |

## Current local verification

- COMPOUND source and Supabase boundary checks: pass.
- Frontend and server helper tests: 96 pass, 0 fail across 12 files.
- Daily pipeline tests: 15 pass, 0 fail; Deno type-check passes.
- Edge Function protocol tests: 10 pass, 0 fail; Deno type-check passes.
- Frontend TypeScript and production build: pass.
- Edge Function Deno type-check: pass.
- Dependency advisory audit: 0 known vulnerabilities.
- Device systems: `stack` (phone) and `split` (desktop) render different component trees over one data layer; see docs/plans/compound/DEVICE_SYSTEMS.md.
- Browser UX: 14 route, device and data-state cases pass, covering 320 to 1920 and both systems; reading level passes at grade 9 ceiling with screens between 2.2 and 4.8; the live public sign-in separately passes at 320, 360, 390, 412, 430, 768 and Android-scaled widths with no overflow or console errors.
- Credential-pattern scan and JSON configuration parse: pass.
- Supabase production migrations: pass; exactly `20260806220210`, `20260806223500`, `20260806231230`, `20260807002034`, `20260807010239` and `20260807015930` applied through the guarded ledger.
- Edge Functions: `compound-ask` remains JWT-protected; `compound-login` is active at version 7, rejects direct calls without the private server-proxy token and stores only one-way client fingerprints for throttling.
- Vercel: project `compound`, root `compound/`, GitHub connected, production deployment `dpl_13WDSnx7djCoAZKcbe24QzTTjysK` ready, Node 24.x, OIDC enabled.
- Vercel CLI: 58.9.2 installed; `compound/.vercel/project.json` resolves to project `compound` (`prj_RQ4jFPW4LmBukLPNyhzz71kFkJpp`) in the intended team. No deployment or environment mutation has been made.
- Calm Brief artifacts: `representative-390.png`, `stale-390.png`, and `quiet-390.png` in `C:\Users\krish\.scratch\compound-calm-brief\` render at 390 by 844 with no overflow using the real 6 August snapshot; explicit visual approval is pending.
- Live domain: `https://compound.krishraja.com` verified; HTTPS 200, title `COMPOUND`, CSP present, `noindex, nofollow`, API returns 401 without a user session.
- Live browser: sign-in shell renders with zero console warnings/errors.
- Auth: the public app no longer requests an email or sends a link. The approved word is normalized and compared to a protected one-way digest, then exchanged for a one-time Supabase session. Project-wide public signup remains disabled.
- Private account: one approved member (`hello@krishraja.com`) and two starter snapshots exist; anonymous snapshot access remains denied.
- Magic-word access: wrong-word production requests return 401 and leave the Auth user count at one; the approved word opens a one-time session, reads a private snapshot and reaches the dashboard and Ask entry point on a 390-pixel live browser.
- Live answer: a temporary synthetic, non-personal snapshot produced `meta`, streamed `delta`, `evidence` and `done` events through Vercel OIDC and Supabase; exactly one user/assistant pair was saved and a repeated request returned the same pair without duplication.
- Production cleanup: the temporary synthetic snapshot and chat rows were deleted; readback shows two starter snapshots, zero synthetic test messages and one member.

## Confirmed decisions

- Same GitHub repository and default branch as Control Center.
- Same Supabase project, isolated through a dedicated `compound` schema and RLS.
- Separate Vercel project at `compound.krishraja.com`.
- A server-held shared magic word plus a `compound.members` allowlist; email delivery is not part of the user journey.
- GitHub Actions runs the daily Deno/TypeScript pipeline and writes Supabase without committing generated data.
- The cold editorial Brief render must be explicitly approved before the four-destination frontend redesign begins.
- Questions stream through a same-origin Vercel OIDC proxy to a Supabase server-side function and use only authenticated COMPOUND evidence.
- The dashboard is the home screen. Ask is additive and may not replace, hide or collapse the approved dashboard.

## Risks and gates

- Shared Supabase means shared operational and service-role blast radius. Schema and RLS isolation do not create physical isolation.
- Shared GitHub means repository permissions are shared. GitHub Environment secrets narrow runtime access but do not create repository security isolation.
- Every credential exposed in chat or the supplied API file remains in remediation. None may be used.
- The FMP rate ceiling and batch quote behavior must be verified with rotated credentials before the full daily call budget is enabled.
- Supabase Auth now has one explicitly approved COMPOUND member. Public signup is disabled; additional members require a deliberate admin action and allowlist row.
- The shared word is convenience access, not high-assurance authentication. Five failed attempts per client fingerprint trigger a 15-minute pause, but anyone who learns the word can enter.
- The shared Auth configuration was diffed before release and read back afterward. COMPOUND's redirect was added while hosted email and TOTP protections were preserved.
- Production still lacks the new GitHub Environment credentials, archive migration, Resend installation, and scheduled-run readback. The two existing private starter snapshots remain examples and are excluded from historical truth by the new schema.
