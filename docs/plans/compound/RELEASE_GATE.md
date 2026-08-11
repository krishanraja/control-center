# COMPOUND production release gate

- Last updated: 2026-08-11 EDT
- Repository: `krishanraja/control-center`
- Vercel project/root: `compound` / `compound/`
- Supabase project: `gojpffsrxybbpbdzzrvs`
- Product scope: one internal user; no signup, pricing, billing, or external access

## Rollback

- Pre-Calm production revision: `310b77a4f2e3017ef4f58d61c27f5bc93918d6bd`.
- Pre-Calm Vercel deployment: `dpl_9pPPVNH3pmVECW1WbNMSGXucftQj`.
- Earlier vertical-slice fallback: revision `270c0089ce31301b93cf0b51ffa6409b5ea66165`, deployment `dpl_C8FBD2bzg6yUwN4LGRmgCAv8mhqW`.
- Database changes roll forward. The archive migration is additive and captured rows are immutable.

## Completed gates

1. Foundation, login, rate-limit, schema-exposure, and archive migrations are live.
2. Archive RLS, immutability, unique publication constraints, and member/service boundaries passed readback.
3. GitHub environment `Production – compound` has the six required secret names.
4. Daily-history PR #238 and capture repair PR #240 are merged.
5. Workflow run `31533242283` published two cited, three-position snapshots for 2026-08-11.
6. The partial state names the CoinGecko 429 limitation and keeps supported FMP, FRED, and DefiLlama claims.
7. Calm Brief PR #239 is green and merge-clean against main.
8. The demo fixture is removed from `public/`; production mode compiles it to `null`, while explicit demo mode bundles it locally.
9. All 123 known FMP industries map to exactly 11 top-level sectors. A partial capture with no industry moves still renders the full taxonomy without inventing a move.
10. Resend remains uninstalled, unbilled, and unreachable from the workflow.

## Remaining merge gate

1. Merge PR #239 and confirm the main deployment is ready.
2. Verify `/latest.json` is not served and anonymous snapshot/history calls return 401 with private no-store headers.
3. Sign in through the one-user magic-word flow without exposing the word to automation or documentation.
4. Verify the cited Brief face, detail context, 11 collapsed Settings sectors, 123-industry explorer, History, Ask, and honest empty Portfolio state in stack and split.
5. Check production runtime errors and preserve final screenshots.
6. Observe two scheduled runs; the next run must capture industry rows through FMP's `averageChange` contract.

## Blockers after UI merge

- Two scheduled runs have not yet been observed.
- The first captured day has zero industry moves; this is disclosed and the parser is fixed, but live 123-row evidence awaits the next capture.
- `compound.holdings` has no active rows, so Portfolio history has no supported holdings evidence yet.
- Five-year reconstruction has not started and remains gated on vintage proof.

These blockers do not change the internal-only Brief release boundary. They prevent claims that the scheduler, captured industry history, Portfolio history, or five-year backfill are complete.
