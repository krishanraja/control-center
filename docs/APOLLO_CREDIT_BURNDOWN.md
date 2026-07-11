# Apollo Credit Burn-Down (interim, non-n8n)

> **HISTORICAL (2026-07-10):** advisory sales retired with the Amperity move; the
> `mindmaker_buyer` lane and this Apollo burn-down are no longer live. Kept for
> the record.

Why this exists: there's a standing Apollo balance (~1642 credits) and the n8n
lead pipeline is down until ~Jul 1, so the normal ingest route can't spend it.
This is the interim, **metered** way to turn those credits into high-quality
leads in the Control Center without n8n — and it doubles as reusable tooling for
later. It serves **O-2** (consulting revenue) and the content/guest pipelines.

Two modes, **both gated by the ICP rubric** (`docs/APOLLO_ICP_RUBRIC.md`):
1. **New prospecting** — search Apollo per lane, reveal/enrich, score, insert.
2. **Enrich-existing** — re-enrich un-enriched `leads`/`contacts` already on file.

## The pieces

| File | Role |
|---|---|
| `docs/APOLLO_ICP_RUBRIC.md` | The rubric (lanes, filters, weights, gate). The human master. |
| `api/_apollo.ts` | Apollo client: `apolloSearch` (free), `apolloBulkEnrich` (credits), `apolloCreditsRemaining`. |
| `api/_icpScore.ts` | Executable rubric: `scoreProspect()` → per-lane scores, tier, tags, insert decision. |
| `scripts/apollo/burn.ts` | Orchestrator CLI: search → dedup → enrich → score → insert. Metered + idempotent. |
| `scripts/apollo/usage.ts` | Credit balance probe (best-effort). |

## How to run

Needs env where it runs (VPS or any secrets-injected shell — **not** an empty CI
container): `APOLLO_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`.

```bash
npx tsx scripts/apollo/usage.ts                       # check balance first
npx tsx scripts/apollo/burn.ts --test 50 --dry        # plan + estimate, no spend
npx tsx scripts/apollo/burn.ts --test 50 --commit     # the 50-lead GATE (review in CC)
# … only after Krish is happy with the 50 …
npx tsx scripts/apollo/burn.ts --commit --max-credits 1500
npx tsx scripts/apollo/burn.ts --enrich-existing --commit --max-credits 200
```

Flags: `--dry` (default) · `--commit` · `--test N` · `--limit N` ·
`--max-credits N` (hard cap; stops when the local revealed-email counter hits it)
· `--lanes a,b,c` · `--enrich-existing`.

## Metering & guardrails

- **Search is free**; only `bulk_match` reveals spend credits. Dedup runs
  **before** reveal so credits aren't wasted on people already in the DB.
- `--max-credits` is a hard stop on revealed emails (the credit proxy). Apollo's
  balance endpoint is plan-dependent; `usage.ts` may return "unknown", so the
  local counter is the source of truth for the cap.
- `--dry` prints lane candidate counts + a spend estimate and writes nothing.
- Inserts go straight to `leads` (`source_type='apollo'`, `status='new'`), so
  they appear in the Leads tab's per-venture lanes immediately.

## The gate (do not skip)

Run `--test 50 --commit` first. Review the 50 in the Control Center Leads tab:
every card should have a best lane ≥ 70, a correct venture/tags, and a sensible
`why_relevant`. Only once that quality bar is clearly met do you run the full
burn. The 50 exist to prove the rubric before the budget is committed.

## Results log

| Date | Mode | Lanes | Revealed (credits) | Inserted (>=70) | Notes |
|---|---|---|---|---|---|
| 2026-06-20 | test v1 | all 6 | 45 | 17 | First gate run. Exposed the 8 calibration failures (vendor-keyword trap, mm_ctrl wrong audience, builder no-audience-signal, match-by-id, no *_norm cols). |
| 2026-06-20 | validation v2 | mindmaker, mm_ctrl, builder | 37 | 20 | Corrected filters. mindmaker 11/15 (real in-house transformation buyers), mm_ctrl 8/12 (construction/mfg/logistics ops leaders), builder 1/7 (needs a web/audience pass). |
| 2026-06-20 | scale | mindmaker, mm_ctrl | ~480 | 125 | Big run on the two validated revenue lanes. 480 scored, 431 verified emails, 125 cleared >=70. All are Heads of AI/Digital Transformation, CDOs, CIOs, and ops Presidents/COOs at non-vendor operating companies (Masimo, Swiss Re, Volkswagen FS, Bloomsbury, Lufkin, Alta Equipment, ...). |

**Running total:** 562 credits spent this session (2205/2500 consumed), **295 left** (resets 2026-06-25). **162 Apollo leads** in the Leads tab (mm_ctrl-tagged 140, mindmaker-tagged 135; multi-tag overlap).

**Observed at scale:** `mm_ctrl_buyer` almost never *wins* best-lane vs `mindmaker_buyer` (its `ai_curiosity` dimension drags traditional-industry leaders down), so those prospects carry both tags but `primary_venture=mindmaker`. The fix (swap `ai_curiosity` -> `ops_complexity`) is logged below.

**Open calibration items for the next pass:**
- `builder_economy` needs a web/social enrichment pass (Exa/Perplexity) for audience + novelty — Apollo alone can't tell a landmark guest from a generic AI founder.
- `mm_ctrl_buyer` dimension `ai_curiosity` (0.20) penalizes exactly the traditional-industry leaders CTRL is for; consider swapping it for an `ops_complexity` signal.
- `mindmaker_buyer` enterprise CIO/CDO profile is adjacent to Meliora/AdFixus more than the SMB/founder core Mindmaker ICP; may warrant a sub-lane split.
