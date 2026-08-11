# COMPOUND provider capability matrix

- Last updated: 2026-08-11 EDT
- Status: implemented and locally verified; first production capture pending PR #238 merge
- Commercial boundary: use the existing provider set; no new paid market-data provider is approved

| Domain | Daily captured evidence | Historical evidence without look-ahead | Current context | Implemented provider | Material limitation |
|---|---|---|---|---|---|
| US-led global equities | US, developed, emerging, and small-cap proxies plus FMP's 123-industry snapshot | Dated EOD prices and dated industry snapshots | Perplexity with Exa fallback | FMP | Proxy universe is US-led rather than every local market |
| Rates | Nominal and real Treasury yields | FRED observations with date controls | Perplexity with Exa fallback | FRED | Revised series need ALFRED-compatible vintage proof before backfill |
| Credit | High-yield spread plus available market confirmation | Dated FRED observations and FMP closes | Perplexity with Exa fallback | FRED and FMP | Investment-grade and sovereign breadth are not first-class |
| Currencies | Trade-weighted dollar plus available FMP symbols | Dated FRED observations and FMP closes | Perplexity with Exa fallback | FRED and FMP | Cross-rate breadth depends on the current FMP plan |
| Commodities | Gold and broad commodity proxies | Dated FMP closes | Perplexity with Exa fallback | FMP | Physical curves and positioning are unavailable |
| Crypto markets | Bitcoin, Ether, and Solana dated prices | CoinGecko date endpoint | Perplexity with Exa fallback | CoinGecko | Historical breadth and rate limits require batch readback |
| Crypto usage | Aggregate DeFi daily fees | DefiLlama dated series | Perplexity with Exa fallback | DefiLlama | Methodology changes need source notes |

MarketAux, Brave, and NewsAPI are not part of the implemented daily collector. They must not be described as active pipeline evidence.

## Production credentials

The GitHub Actions environment is named `Production – compound`. As of 2026-08-11 it contains:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FMP_API_KEY`
- `FRED_API_KEY`
- `PERPLEXITY_API_KEY`
- `EXA_API_KEY`

CoinGecko uses its public endpoint. `COINGECKO_API_KEY` and `COINGECKO_PRO_API_KEY` remain optional and are not configured.

No secret value belongs in source, documentation, logs, screenshots, fixtures, or chat.

## Context and alert boundaries

- Deterministic rules rank stories before any language model call.
- Perplexity with Exa fallback may compress current supplied evidence and add citations. It cannot change ranking, stance, decisive metric, or falsifier.
- Context is cached by member, date, and story key.
- Current search must never reconstruct historical news evidence.
- Resend is intentionally dormant. No Marketplace resource, paid plan, domain, API key, or GitHub secret exists, and the scheduled workflow does not receive Resend variables.
- GitHub's native failed-workflow notification is the active operational alert.

## Production proof still required

1. Confirm the current FMP plan returns all requested cross-asset symbols and the full 123-industry snapshot.
2. Confirm the FRED source-date behavior for every live series.
3. Publish one current capture and read back provider coverage, source dates, two horizon snapshots, and exactly three supported positions.
4. Observe two scheduled 6:30 a.m. Eastern runs.
5. Before backfill, prove FRED vintage handling and measure CoinGecko and DefiLlama limits with one bounded 30-day batch.

No five-year historical record exists yet. Existing starter rows are examples and are excluded from historical truth.
