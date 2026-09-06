# COMPOUND delivery state

> Current source of truth for COMPOUND delivery and production state. Update this file with every phase transition. Historical briefs and QA records under this directory are explicitly labelled and are not current status.

- Last updated: 2026-09-04 AEST
- Product: private, single-user market intelligence for Krish
- Commercial state: internal only; no pricing, paid tier, signup, customer access, or external launch
- Production URL: `https://compound.krishraja.com`

## Current release state

- Daily archive release: PR #238 merged as `716f275fa5fe61dd87ed767cd1ad0bedaf7705e9`.
- Capture hotfix: PR #240 merged as `310b77a4f2e3017ef4f58d61c27f5bc93918d6bd`.
- First capture: workflow run `31533242283` published 2026-08-11 on attempt one after the JSON content-type repair.
- Captured archive: one 3-month and one 1-year row, both `origin = captured`, `schema_version = 2`, `engine_version = compound-brief/1.0.0`, and `status = partial`.
- Partial limitation: the public CoinGecko endpoint returned HTTP 429 for Solana. The unsupported crypto claim was suppressed; FMP, FRED, and DefiLlama evidence remained available.
- Brief proof: each horizon contains exactly three stories and all three have citations. FRED source dates are 2026-08-10 for rates and credit and 2026-08-07 for currencies; FMP and DefiLlama source dates are 2026-08-11.
- Industry proof: the first captured row contains zero industry moves because the collector did not parse FMP's current `averageChange` field. The production collector now parses that field and aggregates duplicate exchange rows. Until the next capture, the live explorer uses the exhaustive static 123-name taxonomy and shows no unsupported move.
- Calm Brief release: PR #239 merged as `7a93172ee4c2ccd8785512a88bb2cf748565db2c`.
- Production-readback correction: PR #241 merged as `8a71bfa925e6b084598cd5019248967507580dc6`. Its certified application deployment is `dpl_BfJe3aMhW9sd2Vz1wtnPuHGJageV`.
- Historical reconstruction: not started. The five-year backfill remains gated on reliable live capture and historical-vintage proof.

## Production infrastructure

- Vercel project: `compound`, root `compound/`, project id `prj_RQ4jFPW4LmBukLPNyhzz71kFkJpp`, Node 24.x.
- Supabase project: `gojpffsrxybbpbdzzrvs`, isolated `compound` schema.
- Archive migration `20260811120000_compound_snapshot_archive` is live and present in the migration ledger.
- Archive RLS is enabled and forced. Member reads, service writes, immutable captured rows, and the unique member/date/horizon constraint have been read back.
- GitHub environment `Production – compound` contains the six required database, market-data, and context secret names.
- CoinGecko uses its public endpoint; no paid CoinGecko key is configured.
- Resend is dormant. There is no resource, paid plan, domain, API key, or workflow variable. GitHub's failed-workflow notification is the operational alert.
- Vercel Authentication protects non-custom deployment URLs. The custom domain uses COMPOUND's one-user application gate. Project password protection and trusted-IP filtering are off.

## Access model

- COMPOUND has exactly one approved Supabase identity and one member row.
- Public signup, email entry, email delivery, social login, pricing, and account creation are absent.
- Entry uses a server-held magic-word digest. The plaintext word is not stored in source, documentation, database rows, logs, screenshots, or fixtures.
- A correct word creates a one-time Supabase session for the approved identity. Five failed attempts per one-way client fingerprint cause a 15-minute pause.
- This is convenience access for one internal user, not customer-grade identity. Externalization requires a separately approved identity and security model.

## Product contract

- COMPOUND is market-wide and global with a US-led cross-asset universe. Holdings never influence story selection or ranking.
- Today in markets has exactly three positions: one lead story and two compact briefs. Quiet days say `Nothing needs action` and show two stable checkpoints.
- The six destinations are Today in markets, Markets, Portfolio, Property, Spend, and Ask. Old URLs keep compatibility redirects.
- Property is one owned unit, separate from market ranking. The value estimate, rent band and suburb ranking are computed by the weekly property pipeline and stored with their inputs and confidence; loan maths runs in the browser from manual facts. The cost ledger Google Sheet is the editing surface and `compound.property_ledger` is a read-only mirror of it.
- Spend is every outgoing from every source, itemised and priced in US dollars. Bills and receipts are the money; the Control Center usage meter is a breakdown shown inside the Operating system section and never added to a total. The bills sheet is canonical over inbox receipts; the property ledger mirror supplies property outgoings.
- `stack` and `split` are separate component systems over one data layer.
- The 123-industry explorer uses the exhaustive 11-sector taxonomy. Hiding an industry declutters exploration but cannot suppress a materially significant Brief story.
- Captured wording, evidence, citations, falsifier, coverage, schema version, engine version, and publication time are immutable historical evidence.
- Live reads use authenticated APIs. Demo mode bundles `src/demo/latest.json` only when `VITE_COMPOUND_DEMO_MODE=true`; production has no public fixture route or private fixture chunk.
- COMPOUND never executes a trade and does not import Control Center application code. The spend pipeline reads three Control Center tables read-only (C-008); no browser or Vercel path does.

## Property pipeline contract

- Schedule: `.github/workflows/compound-property.yml`, 06:30 Brisbane every Tuesday, plus `workflow_dispatch`. Two attempts ten minutes apart.
- Entry: `compound/pipeline/property/main.ts`. Providers: RBA cash rate (free), RTA median rents workbook (free, link discovered each run or `RTA_MEDIAN_RENTS_URL`), Domain Developer API (free key, `DOMAIN_API_KEY`), the ledger sheet by gid (Google service account). A failed or unconfigured provider marks the run `partial` and the tab names what is missing.
- Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the GitHub environment. Every other secret is read from the environment first and then from Supabase Vault through `compound.read_secret` (service role only). Vault holds `domain_api_key`, `property_google_service_account_email`, `property_google_service_account_private_key`, `property_ledger_sheet_id`, `property_ledger_sheet_gid`.
- Personal facts (property, loan, rates, rents, building sales) enter through `deno task property:import` or direct SQL by the owner. Migrations and fixtures never carry them; `compound/scripts/check-supabase.mjs` fails if they do.
- Value estimate method `hedonic_lite_v1`: same-building sale adjusted for car spaces, blended with the postcode pool of two bed unit sales, band from the pool's middle range, floor at the smaller unit's sale. Constants and assumptions are stored in `property_valuations.inputs`.
- Suburb score: percentile ranks of rent return (0.35), rent growth (0.25), price growth (0.25) and supply (0.15) across the inner-south target set; missing inputs score the middle and are named on the row.

## Spend pipeline contract

- Schedule: `.github/workflows/compound-spend.yml`, 06:45 Brisbane every day, plus `workflow_dispatch` with an optional `dry_run` input that prints counts and dedupe pairs without writing. Two attempts ten minutes apart. The bills sheet refreshes on the 9th; the next morning's run picks it up.
- Entry: `compound/pipeline/spend/main.ts`. Providers: RBA F11.1 exchange rates (free), the bills sheet by gid (Google service account, range A:N, header row found under the title row), Control Center invoices, meter (trailing 90 days) and registry through the GET-only `readPublic`, and `compound.property_ledger` rows where money went out. A failed or unconfigured provider marks the run `partial`; a source that failed to read does not hide its rows.
- Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the GitHub environment. Vault holds `spend_bills_sheet_gid`; the sheet id falls back to `property_ledger_sheet_id` and the Google account to the `property_google_service_account_*` names. Nothing new in the GitHub environment.
- Dedupe: exact Gmail id, then same merchant, currency and amount within three days (supersedes and flags `matched_by_amount` while `FUZZY_SUPERSEDES` is on), then same merchant within two percent and ten days (flag only, both count). Identical sheet rows both persist, flagged `sheet_duplicate`. Rows a source no longer returns are set `hidden`, never deleted.
- Pricing: USD rows as is; AUD, EUR and GBP through the RBA rate on or before the date, up to ten days back; otherwise `unpriced` and left out of every total. Control Center rows keep their own USD figure.
- Scope: `property_ledger` rows are property; an override in `compound.spend_merchant_overrides` wins; then a static alias list (Google Play and YouTube personal, Google Workspace by mailbox domain, n8n via Paddle); then the registry's `vendor_match` needles on whole words; else personal. `compound.spend_merchants` is rebuilt each run from the registry plus discovered merchants.

## Daily pipeline contract

- Schedule: 6:30 a.m. `America/New_York`, every day, with dual UTC cron entries and an Eastern-time guard.
- Retry policy: at most three attempts within 45 minutes. Failure leaves the last successful snapshot untouched.
- Status is `complete`, `partial`, or `quiet`; staleness is derived after 30 hours.
- Partial publication is allowed only when every visible claim remains supported and exact source limitations are stored.
- Implemented collectors: FMP, FRED, CoinGecko, and DefiLlama. Perplexity with Exa fallback adds current context only after deterministic ranking.
- Backfill runs in resumable 30-day batches and must not use later evidence or revisions.

## Verification evidence

- Calm Brief app: 91 Vitest tests, boundary checks, Supabase boundary checks, TypeScript, and production build pass under Node 24.
- Pipeline: Deno type-check and 16 tests pass, including the production PostgREST regression and the current FMP `averageChange` contract.
- `compound-ask`: Deno type-check and 10 tests pass. `compound-login`: Deno type-check passes.
- Browser matrix: 24 representative, quiet, stale, and partial combinations pass at 320, 390, 430, 1024, 1440, and 1920 pixels with no horizontal overflow.
- Updated stack and split screenshots from the private-fixture build are under `C:\Users\krish\.scratch\compound-calm-brief\after-private-fixture`.
- Live anonymous `/api/snapshots/latest` returns 401 with `Cache-Control: private, no-store`.
- Live `/latest.json` returns the 562-byte HTML application shell, not JSON or the former private fixture. The production bundle contains no private demo snapshot.
- Authenticated production readback passed at 390, 1024, and 1440 pixels: exactly three cited Brief positions, face-level wider-world provenance, full cited detail, 11 collapsed Settings sectors, the 123-industry Markets explorer, the captured History day, scoped Ask, and the honest empty Portfolio state. No horizontal overflow was present.
- The split detail panel found during readback was corrected in PR #241; the remaining Brief collapses to one readable lead rather than squeezing its headline.
- Vercel reported no production runtime-error clusters in the two-hour release window.
- Production authentication previously passed wrong-word denial, one-time session exchange, private snapshot read, and signed-in Ask streaming without storing the word.

## Remaining release order

1. Observe two scheduled 6:30 a.m. Eastern runs. The next run must prove the corrected 123-industry capture.
2. Seed and archive holdings evidence before calling the Portfolio surface complete; the current live surface honestly shows an empty state when no supported holdings evidence exists.
3. Prove historical-vintage handling for every reconstructed series.
4. Begin the resumable five-year backfill only after the scheduled-run and vintage gates pass.

Any external product, billing, paid email alert, additional member, or stronger customer authentication is a separate future decision.
