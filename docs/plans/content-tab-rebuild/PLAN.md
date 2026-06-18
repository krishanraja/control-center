# Plan — sequenced phases

> Each phase is one PR. Built around `CORE_PROBLEM.md`: **one pile, one card, one set of actions, the primary action develops the card (never relabels), one count.** Order is dependency-driven; do not skip ahead.
>
> Status legend: NOT STARTED / IN PROGRESS / DONE / BLOCKED. Mirror the row into `STATE.md` when you change it.
>
> **Every PR cites: Principles advanced · Jobs (J-NN) · DONE WHEN checks run.**

## Phase index

| ID | Title | Serves | Depends on | Risk |
|---|---|---|---|---|
| P-0 | Harness scaffolding | process | — | none — DONE |
| P-1 | Live-test observation pass | process | P-0 | none — DONE |
| P-1b | `PRINCIPLES.md` + `CORE_PROBLEM.md` | process | P-1 | none — DONE |
| P-2 | Krish confirms apex + constitution | decision | P-1b | none — (proceeding without blocking, per Krish) |
| **P-3** | **DB hygiene migration** (dry-run first) | F-1, F-3, J-01, J-09 | P-2 | low — data, reversible |
| **P-4** | **One pipeline + honest state guard** | F-1, F-2, F-3, J-01, J-06 | P-3 | high — core refactor |
| **P-5** | **Advance = develop, not relabel** (kill fake toasts, wire real research/draft) | F-1, J-01, J-07 | P-4 | medium |
| P-6 | One count, one population, everywhere | F-3, J-13, J-15 | P-4 | low |
| P-7 | Inline actions on every list card (Open/Develop/Approve/Schedule/Drop) | J-10, P-3, P-11 | P-4, P-5 | medium |
| P-8 | Collapse the surfaces: deck + rail + lanes → one workbench renderer | F-2, J-04 | P-4..P-7 | high |
| P-9 | Mobile read-first Composer + magic-chip iteration | J-03, P-6 | P-5, P-7 | medium |
| P-10 | Desktop two-pane workbench (rail + Composer-as-page) | J-04, P-2 | P-8 | high |
| P-11 | Calendar promoted + click-to-schedule from anywhere | J-05, P-12 | P-7 | low |
| P-12 | Sweep-as-default above 30 + honest empty states | J-11, P-5, P-16 | P-6 | low |
| P-13 | Seed rail → permanent "Incoming" tier | J-15, P-9 | P-8 | low |
| P-14 | Telemetry guarantee (every action → feedback_queue) | J-16, P-18 | P-5 | low |
| P-15 | Auto-classifier confidence badges + 1-click confirm | J-06, P-8 | P-4 | medium |
| P-16 | Remove `VITE_CONTENT_REBUILD_ENABLED` flag (rebuild is default) | lock-in | all above | low |

---

## P-3 — DB hygiene migration

### Goal
Make the data honest before any UI change sits on top of it. Demote zombie `review`/`drafting` rows that have no real body; backfill `sanitizeVoice()` over every existing body so the em-dash leak is gone at rest.

### Touches
- `scripts/migrations/2026-06-XX-content-hygiene.sql` (new)
- One-off node script `scripts/backfill-sanitize-bodies.ts` (new) — runs `sanitizeVoice()` per row (JS function, so must run in node, not pure SQL) and PATCHes via service role.

### Implementation
- **Dry-run query first** (paste from `RUNBOOK.md` C-1/C-2 block) and record the counts in `OBSERVATIONS.md`.
- Migration: demote `review`-state rows with `coalesce(length(body),0) < 200` AND empty `meta->'cleo_chat'` back to `drafting` if they have *some* body, else `seeded`. Write an `audit_log` row per demotion (`event_type='content_state_corrected'`).
- Backfill script: for every row where `body ~ '[\u2014\u2013\u2015]'`, recompute `sanitizeVoice(body)` and PATCH. Idempotent; safe to re-run.

### DONE WHEN
- [ ] `select count(*) from content_ideas where state='review' and coalesce(length(body),0)<200 and buried_at is null` → **0**
- [ ] `select count(*) from content_ideas where body ~ '[\u2014]'` → **0**
- [ ] Each demotion has a matching `audit_log` row.
- [ ] Re-running the backfill changes 0 rows (idempotent).

### Out of scope
- No UI changes. No new state values. No trigger changes.

### Rollback
- Demotions are reversible via the `audit_log` trail (each row records `from_state`). Revert the migration commit.

---

## P-4 — One pipeline + honest state guard

### Goal
Kill the four-way duplication. Create `src/hooks/useContentPipeline.ts` as the single owner of the pile, ordering, counts, transition rules, and actions. Make the server refuse a dishonest state transition.

### Touches
- `src/hooks/useContentPipeline.ts` (new — absorbs `useContentTriage` + the duplicated maps in `triageConfig.tsx`)
- `api/content-ideas.ts` (PATCH: add the transition guard)
- `src/lib/contentEngine.ts` (the canonical state machine: `STATE_ORDER`, `ADVANCE_NEXT`, `ADVANCE_GATES`, `isActive`, `populationFor()`)
- `triageConfig.tsx`, `useContentTriage.ts`, `decisionActions.ts` (case 'idea') all import from the single source — no local copies.

### Implementation
- Define the state machine ONCE in `contentEngine.ts`: the advance map, the gate set (`review`, `approved`), the active predicate, and a `canEnter(state, row)` guard (e.g. `review` requires `length(body) >= 200`).
- `useContentPipeline` exposes: `all`, `active`, `deck`, `counts` (one object every surface reads), `advance(row)`, `develop(row)`, `drop(row,reason)`, `retain(row)`, `undo()`. Commits persist server-side; the "handled" set is **derived from realtime state**, not session memory (so re-entering never resurrects a moved card — fixes OBS-036).
- Server PATCH: when `body.state` is supplied, fetch the row and run `canEnter(state, row)`; if it fails, return `409 { ok:false, error, reason:'state_guard' }`. The UI shows the reason instead of a silent success.

### DONE WHEN
- [ ] `rg "ADVANCE_NEXT|STATE_PRIORITY|patchIdeaState" src/` shows definitions in exactly ONE file (`contentEngine.ts`); others import.
- [ ] `curl -X PATCH .../api/content-ideas -d '{"id":"<empty-body card>","state":"review"}'` → **409** with `reason:'state_guard'`.
- [ ] Advancing a card in the deck, exiting, and re-entering does NOT show it again (verified live, both viewports).
- [ ] Principles advanced cited in PR: P-1, P-4. Jobs: J-01, J-06.

### Out of scope
- Wiring research/draft to actually run (that's P-5). This phase only makes the state machine single + honest.

### Rollback
- Flag `VITE_CONTENT_REBUILD_ENABLED=false` falls back to the old hooks; revert the server guard commit.

---

## P-5 — Advance = develop, not relabel

### Goal
Make the primary action produce the next real artifact. Remove every fabricated confirmation.

### Touches
- `src/lib/decisionActions.ts` (case 'idea')
- `src/hooks/useContentPipeline.ts`
- possibly `api/content-ideas/[id]/...` for a real research trigger

### Implementation
- **"Send to research":** either (a) wire it to the real research path (fire the research webhook / `dive-deeper`/`challenge` enrichment and reflect "researching…" → result on the card), or (b) if no research path is production-ready, **remove the button**. No toast may claim work that didn't happen (kills OBS-035). Decision recorded in `STATE.md`.
- **"Greenlight → drafting" / deck `Draft`:** opens the Composer on that card (develop), OR generates a first draft via the existing `/revise`/Cleo path and *then* sets `drafting`. State becomes a consequence of a draft existing, never a bare relabel.
- **`review` gate:** only reachable when a real body exists (enforced by P-4 guard); the action is "Send for approval" and it means it.

### DONE WHEN
- [ ] No `toast(...)` in the content paths asserts an action that the handler does not perform. (`rg "research|sent|drafted" src/lib/decisionActions.ts` audited.)
- [ ] Pressing the primary action on a card lands you in the Composer on that card OR shows a running/real result within one interaction.
- [ ] "Send to research" either runs (network call visible in devtools) or does not exist.
- [ ] Principles: P-1, P-3. Jobs: J-01, J-07.

### Out of scope
- The two-pane workbench layout (P-10). This phase fixes behavior, not layout.

### Rollback
- Flag off; revert commit.

---

## P-6 — One count, one population, everywhere

### Goal
A single `populationFor(filter)` in `contentEngine.ts`. Every counter on every surface reads it. A card is in exactly one place.

### Touches
- `contentEngine.ts` (`populationFor`, `pileCount`)
- `DesktopContent.tsx`, `MobileContent.tsx`, `TriageDeck.tsx`, `NextActionStrip` usages

### Implementation
- Define the canonical buckets: `upstream` (seeded+researching), `drafting`, `review`, `approved`, `incoming` (seed candidates), `buried`, `dropped`. Every header/strip/deck count derives from these.
- Remove the deck's separate `buildContentTriageConfig` population filter; it reads `populationFor('deck')`.
- Each count label gets a verb (P-15): "12 awaiting your sign-off", "1 upstream — swipe to clear".

### DONE WHEN
- [ ] For the same filter, deck count == list count == header count (asserted in a small unit test or a live check snippet in `RUNBOOK.md`).
- [ ] No two visible numbers describe overlapping-but-different populations.
- [ ] Principles: P-1, P-15. Jobs: J-13, J-15.

### Rollback
- Flag off; revert.

---

## P-7 — Inline actions on every list card

### Goal
Every card (mobile list, desktop rail, calendar cell) exposes the same primary actions without a round-trip: **Open · Develop · Approve · Schedule · Drop**.

### Touches
- `ContentIdeaCardActionable.tsx`, `MobileContent.tsx`, shared card component

### Implementation
- One `<ContentCardActions row />` used everywhere. Inline Drop = single tap + 5s undo. Inline Approve = checkmark (only enabled when state allows per P-4 guard). Inline Schedule = pill → mini calendar.
- Touch targets ≥ 44px on mobile (fixes OBS-006, OBS-026); labels/tooltips on all icon buttons (fixes OBS-014).

### DONE WHEN
- [ ] Clearing a 10-card review pile takes ≤ 10 actions on mobile (counted live).
- [ ] No unlabeled icon button (every one has aria-label + hover tooltip).
- [ ] All touch targets ≥ 44px at 390px width (CDP measure).
- [ ] Principles: P-3, P-6, P-11. Jobs: J-10.

### Rollback
- Flag off; revert.

---

## P-8 — Collapse the surfaces into one workbench renderer

### Goal
The deck, the right "IDEA" rail, and the lanes list become **renderings of `useContentPipeline`**, not separate implementations. One card object, one action set, two layouts (compact vs focused).

### Touches
- `DesktopContent.tsx`, `TriageDeck.tsx`, `decisionActions.ts`, `triageConfig.tsx`

### Implementation
- A single `ContentWorkbench` that switches *layout* by device/mode but never duplicates logic. The right-rail actions and the deck `→` call the same `pipeline.develop/advance`.
- Retire `buildContentTriageConfig`'s bespoke content branch (leads/guests/visibility keep theirs; content uses the pipeline).

### DONE WHEN
- [ ] `rg "content" src/lib/triageConfig.tsx` no longer defines a parallel content state machine.
- [ ] Switching mobile↔desktop↔deck shows the same card with the same actions, different layout.
- [ ] Principles: P-2, P-4. Jobs: J-04.

### Rollback
- Flag off; revert.

---

## P-9 — Mobile read-first Composer + magic-chip iteration

### Goal
Opening a card on mobile lands read-first with one row of magic chips (Tighten / Sharper open / Harder ending / Make it ready / Fix voice), inline preview-then-accept, big sticky Save Draft. ≤ 4 taps for a "tighten" iteration.

### Touches
- `ContentComposer.tsx` (`narrow` path), `MobileContent.tsx`

### DONE WHEN
- [ ] "Tighten this" iteration = ≤ 4 taps (open → chip → accept → save), counted live.
- [ ] Title not clipped on the deep-work surface at 390px (fixes OBS-031).
- [ ] Rail buttons ≥ 44px (fixes OBS-006).
- [ ] Principles: P-2, P-6. Jobs: J-03.

### Rollback
- Flag off; revert.

---

## P-10 — Desktop two-pane workbench

### Goal
Desktop Content body = left rail (the pile, dense, filterable) + right pane = Composer always open. Picking a card switches the right pane in place. No swipe-deck cards on the desktop main view.

### Touches
- `DesktopContent.tsx`, `ContentComposer.tsx`

### DONE WHEN
- [ ] No swipe primitive (`TriageCard`/`useCardDeck`) mounts on the desktop main view (React tree check).
- [ ] Picking a left-rail card updates the right Composer without an overlay/modal.
- [ ] No horizontal scroll at 1280/1440/1920 (RUNBOOK detector).
- [ ] Principles: P-2, P-12, P-13. Jobs: J-04.

### Rollback
- Flag off; revert.

---

## P-11 — Calendar promoted + click-to-schedule from anywhere

### Goal
Calendar is a first-class workbench entry. Schedule a draft from a list card inline, or by dragging onto a day.

### DONE WHEN
- [ ] Schedule from a card = ≤ 2 taps.
- [ ] "0 scheduled this month" empty state offers the action (fixes OBS-030, OBS-016/J-05).
- [ ] Principles: P-12, P-16. Jobs: J-05.

---

## P-12 — Sweep-as-default above 30 + honest empty states

### DONE WHEN
- [ ] When `activeCount > 30`, the top CTA is "Sweep to 30" (preview→apply); deck is secondary.
- [ ] Every empty state offers an action (P-16); no "Coming soon" / dead voids.
- [ ] Principles: P-5, P-7, P-16. Jobs: J-11.

---

## P-13 — Seed rail → permanent "Incoming" tier

### DONE WHEN
- [ ] Seed candidates render as an "Incoming" lane in the workbench, not a collapsible banner (fixes OBS-023).
- [ ] Seeding = one click, lands in `seeded` with source ref + "Open source".
- [ ] Principles: P-9, P-16. Jobs: J-15.

---

## P-14 — Telemetry guarantee

### DONE WHEN
- [ ] Every accept/develop/drop/schedule/approve writes a `feedback_queue` row (audited by a count before/after a test sweep).
- [ ] No "submit feedback" form anywhere — the action is the feedback.
- [ ] Principles: P-18. Jobs: J-16.

---

## P-15 — Auto-classifier confidence badges

### DONE WHEN
- [ ] Cards with classifier confidence < 0.7 show a "Cleo's unsure" badge + 1-click confirm.
- [ ] Above threshold: no badge.
- [ ] Principles: P-1, P-8. Jobs: J-06.

---

## P-16 — Remove the rebuild flag

### DONE WHEN
- [ ] `VITE_CONTENT_REBUILD_ENABLED` removed; rebuild is the only path.
- [ ] All prior-build content components deleted (not just dark).
- [ ] `STATE.md` ledger fully green.

---

## Per-phase template (for any phase that needs more detail when it starts)

```
## P-X — <title>
### Goal — 1-2 sentences
### Touches — files / migrations
### Implementation — steps
### DONE WHEN — checkable boxes (curl / SQL / CDP / live count), + "Principles advanced", + "Jobs"
### Out of scope
### Rollback — flag + revert
```

## Start / stop discipline

**Start:** mark the row IN PROGRESS in `STATE.md` (commit) → read `CORE_PROBLEM.md`, `PRINCIPLES.md`, `ANTI_PATTERNS.md`, `CONTEXT_POINTERS.md` → implement smallest slice → run DONE WHEN → live test both viewports → append to `OBSERVATIONS.md` → mark DONE in `STATE.md` (same commit as code) → open PR citing principles + jobs.

**Do not start if:** another phase is IN PROGRESS with no recent commit; a dependency is still red; you lack Vercel/Supabase access to verify; or the phase would violate `ANTI_PATTERNS.md`.
