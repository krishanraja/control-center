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
| **Secondary tabs migrate to `DoThisNextHero`** | DONE | Today / Intel (Desktop+Mobile) / Org (Desktop+Mobile) / Subscriptions (Desktop+Mobile) all render through the shared hero. `NextActionStrip` deleted. Per-tab heroes: `today/NextTaskHero`, `intel/NextIntelDesktopHero` (+ Mobile), `org/NextOrgHero`, `customers/SubscriptionsWatchHero`. Intel desktop "Promote to bet" now actually promotes (was a P-3 violation — only scrolled + outlined). Subscriptions stays read-only watch (calm hero with no forced action when no expansion play). Build green (`tsc --noEmit` + `vite build`). |
| Home / Flows | NOT STARTED | Home already uses the new Focus Ritual spine (AltitudeSpine + BoardDaily + DecisionsInbox) — intentionally not a single hero, no NextActionStrip to remove. Flows has no next-action hero today — needs Krish's outcome lock before building. |

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

## Per-tab "do this next" intent (secondary tabs — shipped)
- **Today:** most-overdue task → "Start with {title} · {N}d overdue" (amber); else due-today → "Start with {title}" (sky); else first waiting → "Unblock {title}" (violet); else "Inbox zero" (clear). Action selects the task in the SplitPane.
- **Intel (desktop):** hot Zara signal (score ≥ 8, status received) → "Promote {summary} (score X) to a bet" — POSTs `/api/bets` + flips the signal to `actioned`. Else "{N} signals tracked — nothing scoring 8+ yet" (calm). Fixed the prior P-3 violation: button said "Promote to bet" but only scrolled the row into view.
- **Intel (mobile):** ranks Marcus's `external_signals` by urgency × days_until → "Open {signal}" with the urgency + countdown chip; the DetailSheet under it carries "Create task" / "Add to bets". Calm when no critical/high.
- **Org (Desktop + Mobile):** Vera's pending corrections → "Review Vera's edit for {agent} · {N} downvotes · {pattern}". Desktop scrolls + outlines the row; mobile navigates to the desktop route. Else "Roster is tight · N active · no patterns waiting".
- **Subscriptions (Desktop + Mobile):** read-only watch by design. Maya's expansion plays → "Reach out to {name} · ${mrr}/mo" (emerald); else calm "Watching the revenue · $X/mo MRR · N paid · no expansion plays waiting" (no button).
