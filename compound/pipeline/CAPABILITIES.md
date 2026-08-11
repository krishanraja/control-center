# COMPOUND provider capability matrix

This matrix records what the existing provider set can support before any new paid market-data provider is
proposed. A green cell still requires the named credential in the GitHub Actions environment and a
contract-fixture readback before production publication is enabled.

| Domain                 | Daily captured evidence                                                   | Historical evidence without look-ahead         | News or world context                   | Current provider                | Material limitation                                             |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| US and global equities | US, developed, emerging, small-cap proxies; company and 123-industry data | Dated EOD prices and dated industry snapshots  | MarketAux; Perplexity with Exa fallback | FMP, MarketAux, Perplexity, Exa | Proxy universe is US-led rather than every local market         |
| Rates                  | Nominal and real Treasury yields                                          | FRED real-time vintage parameters              | Perplexity with Exa fallback            | FRED, Perplexity, Exa           | Revised series require ALFRED-compatible vintage verification   |
| Credit                 | High-yield spread and HYG price confirmation                              | FRED vintage observations and dated ETF closes | Perplexity with Exa fallback            | FRED, FMP, Perplexity, Exa      | Investment-grade and sovereign breadth are not yet first-class  |
| Currencies             | Trade-weighted dollar                                                     | FRED dated observations                        | Perplexity with Exa fallback            | FRED, Perplexity, Exa           | Cross rates beyond FMP plan coverage need contract readback     |
| Commodities            | Gold and broad commodity proxies                                          | Dated FMP closes                               | Perplexity with Exa fallback            | FMP, Perplexity, Exa            | Physical curves and positioning are unavailable                 |
| Crypto markets         | Bitcoin, Ether, and Solana dated prices                                   | CoinGecko date endpoint                        | Perplexity with Exa fallback            | CoinGecko, Perplexity, Exa      | Historical global market breadth depends on plan limits         |
| Crypto usage           | Aggregate DeFi daily fees                                                 | DefiLlama dated series                         | Perplexity with Exa fallback            | DefiLlama, Perplexity, Exa      | Protocol-level historical methodology changes need source notes |

## Credential and contract gate

The scheduled workflow requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`, and
`FRED_API_KEY`. CoinGecko can use its public endpoint; `COINGECKO_API_KEY` and `COINGECKO_PRO_API_KEY` are
supported for the demo and pro hosts respectively. `PERPLEXITY_API_KEY` and `EXA_API_KEY` add cached context
after deterministic selection. Resend remains an explicit installation and environment-provisioning gate.

Read-only verification on 11 August 2026 found that the GitHub environment `Production – compound` exists but
currently contains zero secrets. The workflow therefore fails closed until the named credentials are
provisioned under the explicit production gate.

## Gaps before proposing another paid feed

1. Confirm the current FMP plan returns the full dated industry snapshot and the listed cross-asset symbols.
2. Confirm FRED vintage behavior for every reconstructed series, particularly revised macro series added
   later.
3. Measure CoinGecko and DefiLlama historical rate limits during a 30-day dry batch.
4. Add MarketAux only after its historical as-of contract is verified. Current Perplexity and Exa search must
   never be used to reconstruct historical news context.

No new paid market-data provider is proposed in this release.
