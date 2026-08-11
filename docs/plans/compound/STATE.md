# COMPOUND delivery state

> Current source of truth for COMPOUND delivery and production state. Update this file in the same commit as every phase transition. Historical briefs and QA records under this directory are explicitly labelled and must not be used as current status.

- Last updated: 2026-08-11 EDT
- Product: private, single-user market intelligence for Krish
- Commercial state: internal only; no pricing, paid tier, signup, customer access, or external launch
- Production URL: `https://compound.krishraja.com`

## Current release state

- Pipeline release: PR #238 merged to main as `716f275fa5fe61dd87ed767cd1ad0bedaf7705e9`.
- Pipeline production: Vercel deployment `dpl_8QPpmoUnEbaKkKnVooDRbbjT5Wp5` is ready.
- First live capture: GitHub Actions run `31531226393` is in its bounded retry window for 2026-08-11. No captured row has been published yet, so the last successful data remains untouched.
- Calm Brief release: PR #239, branch `codex/compound-calm-brief`, is implemented and awaiting the successful capture readback before merge.
- Production data: two private starter snapshots dated 2026-08-06. They are labelled `origin = starter` and excluded from historical truth.
- Historical reconstruction: not started. The five-year backfill remains a later, resumable operation after reliable live capture.
- UI preview: `https://compound-git-codex-compound-calm-brief-krish-rajas-projects.vercel.app` contains the approved four-destination Calm Brief and restrained custom iconography.

## Production infrastructure

- Vercel project: `compound`, root directory `compound/`, project id `prj_RQ4jFPW4LmBukLPNyhzz71kFkJpp`, Node 24.x.
- Supabase project: `gojpffsrxybbpbdzzrvs`, dedicated `compound` schema.
- Archive migration: `20260811120000_compound_snapshot_archive` is applied in production and present in the migration ledger.
- Archive readback: seven archive columns, `snapshot_runs`, `snapshot_backfill_checkpoints`, and `snapshot_context_cache` exist; RLS is enabled and forced; three member-read policies, the immutable-snapshot trigger, and the unique member/date/horizon index are present.
- GitHub Actions environment: `Production – compound` contains `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`, `FRED_API_KEY`, `PERPLEXITY_API_KEY`, and `EXA_API_KEY`.
- Optional CoinGecko keys are absent; the pipeline uses CoinGecko's public endpoint.
- Resend is intentionally dormant. Marketplace terms were accepted, but no resource, domain, paid plan, API key, or GitHub secret was provisioned. The workflow does not receive Resend variables. GitHub's native workflow failure notification remains the operational alert.

## Access model

- COMPOUND has exactly one approved Supabase Auth identity and one `compound.members` row.
- Public signup is disabled. There is no email field, email delivery, social login, pricing, or account-creation route.
- Entry requires the server-held magic word. The browser sends it only to the same-origin login function; source, documentation, database rows, and logs do not contain the plaintext word.
- The normalized word is checked against a protected one-way digest. A successful match creates a one-time Supabase session for the approved internal identity.
- Five failed attempts per one-way client fingerprint cause a 15-minute pause. Client IP addresses and the word are not stored.
- The shared word is convenience access for an internal tool, not high-assurance authentication. Externalization requires replacing or strengthening this model before any customer access.

## Product contract

- COMPOUND is market-wide and global with a US-led cross-asset universe. Holdings never influence story selection or ranking.
- Today in markets shows exactly three positions: one lead story and two compact briefs. Quiet days show `Nothing needs action` plus two stable checkpoints.
- The product has four destinations: Today in markets, Markets, Portfolio, and Ask. Old tab URLs retain compatibility redirects.
- `stack` and `split` are separate component systems over one data layer.
- The 123-industry explorer uses the exhaustive 11-sector taxonomy. Industry hiding declutters exploration but cannot suppress a materially significant Brief story.
- Every captured or reconstructed snapshot stores the wording, evidence, citations, falsifier, coverage, schema version, engine version, and publication time that COMPOUND used that day.
- Production runtime reads are authenticated and private. The committed demo fixture is for local demo mode only and the Calm Brief release removes it from the production public path.
- COMPOUND never executes a trade and never imports Control Center application code or data.

## Daily pipeline contract

- Schedule: 6:30 a.m. `America/New_York`, seven days a week, using dual UTC cron entries plus an Eastern-time guard.
- Retry policy: at most three attempts within 45 minutes. The last successful snapshot remains untouched after failure.
- Publication states: `complete`, `partial`, or `quiet`; staleness is derived at read time after 30 hours.
- Partial publication is allowed only when every visible claim remains supported. Failed-feed stories are suppressed and exact limitations are stored.
- Providers in the implemented collector: FMP, FRED, CoinGecko, and DefiLlama. Perplexity with Exa fallback adds cached current-world context only after deterministic story selection.
- Live capture must be verified before any backfill. Backfill runs in resumable 30-day batches and must not use look-ahead evidence.

## Verification evidence

- Pipeline release: `compound/npm run verify` passes 96 tests, both boundary checks, TypeScript, and the production build under Node 24 with experimental global Web Storage disabled for Vitest's DOM implementation.
- Pipeline: Deno type-check and 15 tests pass.
- `compound-ask`: Deno type-check and 10 tests pass.
- `compound-login`: Deno type-check passes.
- Calm Brief browser acceptance: 24 combinations across 320, 390, 430, 1024, 1440, and 1920 pixels, covering representative, stale, quiet, and partial states with no horizontal overflow.
- Calm Brief artifacts: approved cold mocks and actual React evidence for representative, stale, quiet, partial, story detail, Markets, Portfolio, and collapsed Settings exist under `C:\Users\krish\.scratch\compound-calm-brief\`.
- Production schema readback passed after the archive migration.
- Production authentication previously passed wrong-word denial, one-time session exchange, private snapshot read, and signed-in Ask streaming without storing the word.

## Remaining release order

1. Complete GitHub Actions run `31531226393` and inspect the failure or success record.
2. If successful, read back two horizon snapshots, provider coverage, exactly three positions, citations, and source dates. If failed, fix the smallest demonstrated cause and repeat the bounded capture.
3. Retarget PR #239 to main, rerun checks, and merge it.
4. Verify production authentication, private snapshot APIs, stack and split rendering, history, Settings, Ask, removal of public `/latest.json`, and runtime errors.
5. Observe at least two scheduled daily runs before calling the pipeline reliable.
6. Begin the five-year backfill only after reliable live capture; keep reconstructed days visibly distinct from captured days.

Any external product, billing, paid email alert, additional member, or stronger customer authentication remains a separate future decision.
