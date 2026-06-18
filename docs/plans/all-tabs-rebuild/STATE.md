# All-tabs rebuild — STATE (read first)

Extends `docs/plans/content-tab-rebuild/` to the other tabs. Outcomes per tab are locked in `CHARTER.md` (Krish's 2026-06-17 answers) — do not re-guess them.

## Ledger

| Phase | Status | Notes |
|---|---|---|
| Diagnosis (Pipeline/Network/Visibility/Subscriptions, prod 1440) | DONE | screenshots in `.scratch/diag-*.png`; core problem per tab in CHARTER |
| Foundation: `isTestRecord` view filter | DONE (commit b3b6df7) | `src/lib/recordHygiene.ts`; applied to Pipeline (Desktop+Mobile) + Visibility (Desktop+Mobile). Network + Subscriptions test-filtering pending their phases (aggregate hooks). |
| **Shared `DoThisNextHero`** (consistency made structural) | DONE (commit a780d3c) | `src/components/shared/DoThisNextHero.tsx` — the ONE hero every tab renders through. Content refactored onto it. |
| **Pipeline hero** (real action, desktop+mobile) | DONE (commit a780d3c) | `NextLeadHero`: Draft email → Enrich → Promote → Follow up → clear. Verified: header 30→5 active (test filter), hero "Enrich Lionsgate". |
| **Pipeline**: collapse the ~10-button card wall to 1 primary + overflow | DONE (1f3361a) | LeadCard: one state-correct primary + "More" overflow + quiet Drop. |
| **Network**: venture segmentation + predictive scoring rubric + bounded render + immediate action | DONE (aa62226) | `networkScore.ts` rubric, `NextNetworkHero`, ranked + bounded render (HAND_CAP/REVIEW_CAP), test-filtered. |
| **Visibility**: unified "Do this next" across inbound guests + outbound stages | DONE (adeeea8) | `NextVisibilityHero` spans both; replaced the two NextActionStrips. |
| **Subscriptions**: hide test data in `useCustomers` aggregates (read-only) | DONE (ff53f06) | test rows dropped at fetch → honest MRR/counts/recent. Kept read-only per Krish. |
| Secondary tabs (Home/Today/Org/Intel/Flows) | NOT STARTED | after the priority 4. |

### Priority-4 complete (2026-06-17)
All four prioritised tabs now share the one `DoThisNextHero` (consistent grammar/tones/actions), have test/demo data filtered from live views, and lead with a real one-tap next action tuned to Krish's stated outcome:
- **Pipeline** → "Draft email / Enrich" (contact fast); card wall collapsed.
- **Network** → "Reach out to {name} — {score}/100" (predictive rubric); render bounded.
- **Visibility** → "Confirm / Pitch / Apply" (one engine, inbound+outbound).
- **Subscriptions** → honest read-only watch.
Commits: b3b6df7 (hygiene) → 7838fdd → a780d3c (shared hero + Pipeline) → 1f3361a (card) → adeeea8 (Visibility) → aa62226 (Network) → ff53f06 (Subscriptions). All built green, pushed, auto-deployed.

## Reusable primitives (from the Content rebuild)
- `src/lib/contentEngine.ts` — pattern for `nextBestAction`, `contentBuckets`, honest-state guard, `advanceMode`.
- `src/components/content/NextBestActionHero.tsx` — the "Do this next" hero pattern to clone per tab.
- `src/lib/recordHygiene.ts` — test/demo filter (this initiative).
- `src/lib/triageConfig.tsx` — per-tab triage configs already exist (leads/contacts/guests/visibility).

## Per-tab "do this next" intent (to build)
- **Pipeline:** has email → "Draft email to {name}"; else "Enrich {name} (~$0.50)"; else "Promote {name}". Real one-tap action, not "Open next".
- **Network:** "Reach out to {name} — {score} fit, {tier}" scoped to the active venture; predictive score = the rubric (venture-fit × heat × reachability × recency).
- **Visibility:** max over both engines — "Pitch {guest} (strong, reachable)" vs "Apply to {CFP} — closes in {n}d"; pick the most time-sensitive/highest-value.
- **Subscriptions:** read-only — "1 customer ready for upsell: {name}" (Expansion radar) or "Caught up". No forced action.
