# All-tabs rebuild — STATE (read first)

Extends `docs/plans/content-tab-rebuild/` to the other tabs. Outcomes per tab are locked in `CHARTER.md` (Krish's 2026-06-17 answers) — do not re-guess them.

## Ledger

| Phase | Status | Notes |
|---|---|---|
| Diagnosis (Pipeline/Network/Visibility/Subscriptions, prod 1440) | DONE | screenshots in `.scratch/diag-*.png`; core problem per tab in CHARTER |
| Foundation: `isTestRecord` view filter | DONE (commit b3b6df7) | `src/lib/recordHygiene.ts`; applied to Pipeline (Desktop+Mobile) + Visibility (Desktop+Mobile). Network + Subscriptions test-filtering pending their phases (aggregate hooks). |
| **Pipeline**: real-immediate-action hero + collapse the ~10-button card wall | NEXT | outcome = contact fast. Hero must DO the action (Draft email / Enrich), not open a deck. |
| **Network**: venture segmentation + predictive scoring rubric + bounded render + immediate action | NOT STARTED | biggest rethink (1,000 contacts, 6,776 DOM nodes today). |
| **Visibility**: unified "Do this next" across inbound guests + outbound stages | NOT STARTED | tab is already healthy; needs the directive spine. |
| **Subscriptions**: hide test data in `useCustomers` aggregates + honest empties (read-only) | NOT STARTED | light touch; lowest priority. |
| Secondary tabs (Home/Today/Org/Intel/Flows) | NOT STARTED | after the priority 4. |

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
