# All-tabs rebuild — Charter

> Extends the Content tab rebuild's principles (`docs/plans/content-tab-rebuild/PRINCIPLES.md`, P-1..P-22) to every other tab. Same playbook: diagnose against the principles, find the ONE core problem, build the outcomes-centric spine (honest state · one count · advance=develop/act · "Do this next" hero · inline state-correct actions · anticipate the next action).
>
> **Read order:** this file → `docs/plans/content-tab-rebuild/PRINCIPLES.md` → `STATE.md` (this folder) → the per-tab section below.

## Krish's answers (2026-06-17) — the outcomes, do not re-guess

| Tab | What he wants MORE of (the outcome) | The blocker | Build priority |
|---|---|---|---|
| **Pipeline** (leads) | Leads **enriched + contacted fast** — push volume through the funnel | Leads aren't actionable enough to decide on AND the "next" isn't a *real immediate action* (it opens a deck, not "draft email to X now") | 1 |
| **Network** (contacts) | **Segment + match to venture goals + a sophisticated predictive scoring rubric → immediate action** on the right people | A 1,000-card grid (6,776 DOM nodes) with no scoring, no segmentation surfaced, no single next action | 2 (biggest rethink) |
| **Visibility** (guests + targets) | **One visibility engine** — booking podcast guests AND getting Krish on stages/CFPs/press, equally | Two stacked lists, no directive "do this next" spanning both | 3 |
| **Subscriptions** (customers) | **Watch revenue as it starts** — read-only is fine for now | Mostly $0 MRR + test data; over-built for current stage | 4 (light touch) |
| **Everywhere** | — | **Test/demo data pollutes live views** (`test-*`, `laurenkthermos`, ctrl signups) | 0 (foundation) |

## The shared spine (reused from Content)

1. **`isTestRecord` filter** — hide test/demo rows from every live list (data stays in DB; reversible filter). Foundation, ships first.
2. **`nextBestAction` per tab** — each tab gets a tab-specific "Do this next" that resolves to a REAL immediate action (Pipeline: "Draft email to X" / "Enrich X"; Visibility: "Pitch X" / "Apply to CFP closing in 3d"; Network: "Reach out to X — 92 fit, warm"; Subscriptions: read-only "watch", no forced action).
3. **One count, honest labels** — `contentBuckets`-equivalent per tab.
4. **Inline state-correct actions** — collapse button walls to THE 1-2 likely actions + overflow (Pipeline card today shows ~10 co-equal buttons → violation of P-3/P-5/P-22).
5. **Bounded rendering** — never mount an unbounded list (Network mounts hundreds → the crash risk Content already fixed).

## Per-tab core problem (from live diagnosis 2026-06-17, prod, 1440)

### Pipeline (`/leads`) — `DesktopLeads` / `MobileLeads`
- Has a next-action strip ("27 to decide · Open next") but **"Open next" opens the triage deck, not a real action.** Krish wants the hero to *do the thing* (draft email / enrich) in one tap.
- **Button wall:** each card shows Enrich · Skip · Mark contacted · Promote · Reassign · Follow-up · Draft email · mailto · 👍 · 👎 · Drop (~10 co-equal). P-3/P-5/P-22 violation.
- **Test data live:** `test-1781008408512` + ctrl signups in the Mindmake lane; "By source: Audience 26".
- Outcome lens: optimize for **contacted fast** — lead with the cheapest path to a real outreach (Draft email when there's an email; Enrich when not).

### Network (`/relationships`) — `DesktopLeadsRE` / `MobileLeadsRE`
- **1,000 contacts, ~hundreds mounted (6,776 interactive nodes).** Decision-by-scroll. Performance + P-5 violation.
- Has venture/tier/heat filters + a "Handle 1-by-1 · 108" deck, but the main surface is a giant grid, not a scored "reach out to these this week" list.
- Outcome lens: **predictive scoring rubric + venture segmentation + immediate action.** Needs a real "who to contact now, why, and the one action" surface; bound the render.

### Visibility (`/guests`) — `DesktopGuests` / `MobileGuests`
- Healthiest already: honest state lanes (Scouted→Confirmed), inbound/outbound toggle, triage labels (Strong/Maybe/Skip), a deck. Header "63 active · no scheduled guests awaiting confirmation".
- Missing: a directive **"Do this next"** spanning both engines (e.g., "Pitch Guillermo Rauch — strong, reachable" or "Apply to <CFP> closing in 3d").

### Subscriptions (`/customers`) — `DesktopCustomers` / `MobileCustomers`
- Already read-only-ish: MRR ticker, Customer Council, Expansion radar, revenue-by-source. Honest empties mostly present ("No urgent contacts. Caught up").
- **Test data:** `test-1712243000`, `laurenkthermos` in Gutted "Recent".
- Outcome lens: **watch** — keep it honest, hide test data, do NOT over-build. Surface the one real expansion play (Expansion radar already shows "Fractionl Circle · ready for upsell").

## Consistency mandate (Krish 2026-06-17: "everything feels consistent UI/UX when done")

Consistency must be **structural, not aspirational** — every tab renders through the SAME shared components, fed by tab-specific data. No per-tab clones of the same idea.

| Concern | One shared component every tab uses | Source of truth |
|---|---|---|
| "Do this next" hero | `src/components/shared/DoThisNextHero.tsx` (generic: kind/headline/sub/action) | per-tab `nextBest*()` selector |
| Card action row | `DoThisNextHero` + a shared primary/secondary/overflow action grammar (lead with THE one action, ≤2 visible, rest in overflow) | per-tab action map |
| Count labels | verb-labeled "N in flight · M to {verb}" pattern (from Content P-6) | per-tab buckets fn |
| Empty states | shared "caught up" / "nothing waiting" affordance with a next-step CTA (P-16) | — |
| Test-data filter | `src/lib/recordHygiene.ts` | one helper |
| Triage deck | existing `SwipeCockpit` + `triageConfig` (already shared) | — |

Shared visual grammar (applies everywhere):
- **Hero tones:** emerald = approve/ready/positive-terminal; violet = develop/act/primary; sky = schedule/time; neutral = clear/none.
- **One primary action** per surface, leading, color-coded by tone; secondary is quiet; destructive (Drop/Kill) is a small icon in an overflow, never co-equal.
- **44px min touch targets** on mobile; labeled icons everywhere (no bare icon buttons).
- **Same header shape** across tabs: title + one-line purpose + "N {noun} · M to {verb}" count.
- No surface shows > the lane cap of cards; overflow → deck.

When a tab is "done" it must pass a consistency check: its hero, card actions, counts, and empty states are visually and behaviorally indistinguishable in *grammar* from Content's (only the nouns/verbs differ).

- One PR per tab-phase; build green (`tsc` + `vite build`); test both viewports; commit + push (Vercel auto-deploys); STATE.md updated in the same commit.
- Reuse `src/lib/contentEngine.ts` patterns; put shared helpers in a neutral lib (`src/lib/recordHygiene.ts` for `isTestRecord`).
- Never delete data — test-data hiding is a view filter.
- No fabricated confirmations; every action does what it says (the "Sent to Zara" lesson).
- Git author Krish; no secrets in client bundle.
