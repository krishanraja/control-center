# COMPOUND provider capability matrix

- Last updated: 2026-08-11 EDT
- Status: first production capture published; scheduled-run and historical-vintage proof remain open
- Commercial boundary: existing providers only; no new paid market-data provider is approved

| Domain | Daily captured evidence | Historical evidence without look-ahead | Current context | Provider | Proven limitation |
|---|---|---|---|---|---|
| US-led global equities | US, developed, emerging, small-cap, credit, gold, and commodity proxies; FMP industry snapshot | Dated EOD prices and dated industry snapshots | Perplexity with Exa fallback | FMP | First capture proved proxy prices; corrected 123-industry parsing awaits the next run |
| Rates | Nominal and real Treasury yields | FRED observations with date controls | Perplexity with Exa fallback | FRED | Revised series need ALFRED-compatible vintage proof before backfill |
| Credit | High-yield spread plus HYG confirmation | Dated FRED observations and FMP closes | Perplexity with Exa fallback | FRED and FMP | Investment-grade and sovereign breadth are not first-class |
| Currencies | Trade-weighted dollar | Dated FRED observations | Perplexity with Exa fallback | FRED | First capture carried the latest available source date, 2026-08-07 |
| Commodities | Gold and broad commodity proxies | Dated FMP closes | Perplexity with Exa fallback | FMP | Physical curves and positioning are unavailable |
| Crypto markets | Bitcoin, Ether, and Solana prices | CoinGecko date endpoint | Perplexity with Exa fallback | CoinGecko | Public endpoint returned 429 for Solana on the first capture |
| Crypto usage | Aggregate DeFi daily fees | DefiLlama dated series | Perplexity with Exa fallback | DefiLlama | Methodology changes need source notes |

MarketAux, Brave, and NewsAPI are not implemented collector evidence.

## Property providers (weekly, `compound/pipeline/property/`)

| Feed | Evidence | Cost | Cadence | Limitation |
|---|---|---|---|---|
| Ledger sheet (Google service account, tab by gid) | Every cost and rent row, mirrored read-only into `property_ledger` | free | weekly | Header must match the eight ledger columns or the sync stops |
| RBA F1 | Cash rate target, month end | free | weekly | Context only; the loan's own rate is a manual fact |
| RTA Queensland median rents | Median weekly rent by postcode, dwelling type, bedrooms, quarterly | free | quarterly | Workbook link moves each quarter; site may reset connections, run goes partial and keeps last quarter |
| Domain Developer API | Asking rents (25th, median, 75th), listing counts, sold prices and median sold for two bed units per postcode | free tier | weekly | Requires the Agencies and Listings and Properties and Locations packages on the project; aggregates only are stored; "Powered by Domain" shown |
| Manual observations | Building sales and any hand-entered market fact | free | as entered | Owner supplies source URL and date |

Paid fallbacks not approved: PropRadar Hobby (A$49 a month) or an Apify realestate.com.au actor, both pluggable as another observation source.

## Spend providers (daily, `compound/pipeline/spend/`)

| Provider | What it gives | Cost | Access | Failure mode |
|---|---|---|---|---|
| RBA F11.1 | Daily A$1 = USD, EUR, GBP rates back to 2023 | Free, no key | Public CSV | Run partial; unpriced rows counted, not guessed |
| Bills sheet | Every bill and receipt the Gmail skill wrote, tab by gid, range A:N | Free | Google service account, Viewer | Header drift stops the sync; run partial |
| Control Center invoices | `public.spend_invoices`, one label, daily | Free | Service role, GET only via `readPublic` | Run partial; sheet rows still count |
| Control Center meter | `public.meter_daily`, trailing 90 days | Free | Service role, GET only | Operating system section says the meter is silent |
| Control Center registry | `public.service_registry` vendor needles and cycle budgets | Free | Service role, GET only | Scope falls back to aliases and overrides |
| Property ledger | `compound.property_ledger` rows with direction out | Free | Same schema | Property scope empty until the property run has synced |

## Production proof

- Workflow `31533242283` published two immutable captured rows for 2026-08-11 on attempt one.
- Both horizons contain exactly three stories; every story has at least one citation.
- FMP and DefiLlama source dates are 2026-08-11. FRED rates and credit are dated 2026-08-10; currencies are dated 2026-08-07.
- Status is `partial` because CoinGecko returned 429. Unsupported crypto claims were suppressed.
- FMP's snapshot response uses `averageChange` and includes exchange-level duplicates. The collector now parses that field and averages rows into unique industries. The first row predates this repair and correctly remains immutable with zero captured industries.

## Credentials and context

GitHub environment `Production – compound` contains `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`, `FRED_API_KEY`, `PERPLEXITY_API_KEY`, and `EXA_API_KEY`. CoinGecko uses its public endpoint.

- No secret value belongs in source, docs, logs, screenshots, fixtures, or chat.
- Deterministic rules rank stories before AI context.
- Perplexity with Exa fallback may compress supplied current evidence and add citations. It cannot change rank, stance, decisive metric, or falsifier.
- Current search never reconstructs historical news evidence.
- Resend is dormant; GitHub's native failed-workflow notification is the alert.

## Proof still required

1. Observe two scheduled 6:30 a.m. Eastern runs.
2. Prove the next capture contains the expected unique 123-industry set.
3. Prove FRED vintage behavior for every reconstructed series.
4. Measure CoinGecko and DefiLlama limits with one bounded 30-day batch before backfill.
5. Seed an approved holdings source before claiming Portfolio history is live.

No five-year historical record exists yet. Starter rows are examples and excluded from historical truth.
