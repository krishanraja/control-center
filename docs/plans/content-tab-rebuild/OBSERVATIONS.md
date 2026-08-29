# Live-test observations — append-only, principle-tagged

Format: each entry has an ID (`OBS-NNN`), a severity (`P0` blocker / `P1` major / `P2` polish), a principle tag (`P-N`), and a finding. Never delete. New sessions append. Entries roll up to `PRINCIPLES.md`; if no principle matches, raise the principle list before tagging.

---

## 2026-06-17 — Opus — live test on prod (mobile 390x844 + desktop 1440x900)

Setup: in-IDE browser, https://controlcenter.krishraja.com, access code `gosell`, both viewports via CDP `Emulation.setDeviceMetricsOverride`. Active backlog: 25 cards + 79 buried + 1 upstream = ~105 active. Lane mix: Drafting 13, Review 11, Researching 1, Seeded 0, Approved 0, Published 0, Dropped 205.

### State machine / data honesty

- **OBS-001 [P0] [P-1, P-8]** — 11 cards sit in `review` state with empty bodies. Visible on mobile as 11 cards in the "AWAITING YOU" tier, each saying "no draft yet · Open →". Verified on the card `ed8cf84c-6fe2-459e-8d86-834969923a38` (header reads `MINDMAKE · REVIEW · 0 words · saved`). The promotion to `review` fires without checking `length(body)`. This is the user's stated #1 complaint about auto-classification.
- **OBS-002 [P0] [P-1]** — The mobile "READY FOR YOU" tier is filled with those empty `review` cards. The promise of the tier is "things ready for your sign-off"; the data is "things mis-classified into review". The tier is lying.
- **OBS-013 [P1] [P-1, P-3]** — Desktop Composer header shows a `voice ok` pill on a 0-word document. Voice-ok of a void is meaningless. The pill should be hidden until there is something to be ok about.
- **OBS-008 [P1] [P-14]** — Em dashes ship through to many existing bodies. Some cards carry the `⚠ em dash` chip; many with em dashes do not. `sanitizeVoice()` lands on new writes only; rest data is dirty. The inconsistency is worse than uniform dirtiness because Krish trusts the absence of a warning.
- **OBS-022 [P1] [P-8]** — Cards with `lane is null` render without any lane chip and without a "Cleo is unsure" affordance. Krish can't tell whether the missing chip is intentional or broken.

### Surface bleed (mobile vs desktop)

- **OBS-015 [P0] [P-2]** — Desktop main view mounts the swipe-deck primitive (`TriageCard` + `useCardDeck`) inside the Triage-deck modal *and* when active count > 30. At 25 active it's only behind a button, but the primitive is loaded; it is the user's stated "mobile swipe cards on desktop" complaint.
- **OBS-006 [P1] [P-2]** — Mobile Composer's rail buttons (Cleo / Materials / Research / Edit) are 34px tall. Below the 44px iOS touch floor. Save Draft (45px) and the Cleo chat input are fine.

### Click destination ≠ click promise

- **OBS-009 [P0] [P-3]** — From the Calendar view, clicking the "Open idea" CTA in the NextActionStrip does **nothing visible**. (Code reads: the handler does `scrollIntoView` on a DOM node that doesn't exist in the calendar layout.) The button is the most prominent CTA on the tab; it's a black hole on half the views.
- **OBS-014 [P1] [P-3]** — Each desktop lane card carries a 22×22 thumbs-up and 22×22 thumbs-down icon. They have `aria-label="Thumbs up"` / `"Thumbs down"` but no visible label, no tooltip on hover, and no in-product explanation of what they do.
- **OBS-016 [P2] [P-3]** — Save Draft button in the desktop Composer has an adjacent caret-dropdown with no visible affordance. (Likely a channel override.) The caret is 1/3 the click area of the main button; click target ambiguity.
- **OBS-026 [P1] [P-3, P-11]** — Inline `Drop` on each desktop lane card is a 44×44 unlabeled `×` icon. Hover shows `Drop this idea`. The most destructive action on the card has the least typography.

### Density / metadata explosion

- **OBS-004 [P0] [P-5]** — Drafting lane streams 13 cards at 307px each (~4,000 px of stack). The lane cap (`LANE_CAP = 8`) is set but isn't taking effect for this state — overflow falls to the deck only above 30, and 13 < 30. Result: scroll-tunnel.
- **OBS-005 [P1] [P-4, P-1]** — A single card can stack 6+ metadata pills: `DRAFTING · Inspiration sweep · draft · Synthesis hypothesis · AGENTIC OPERATIONS · SYNTHESIS · F# 10 · just now`. They are taxonomically distinct (state, source, format, hypothesis, agent tag, lane, pillar, timestamp) but visually undifferentiated. The user reads them as a wall of decoration.
- **OBS-019 [P2] [P-5, P-15]** — Backburner shows "(79)" with no breakdown by reason. A 79-pile is sticky doom; even one-level decomposition ("60 stale, 12 low-fit, 7 superseded") would unblock action.

### Pile management

- **OBS-020 [P1] [P-7]** — Desktop by-state aside lists Seeded (0), Researching (1), Drafting (13), Review (11), Approved (0), Published (0), Dropped (205). Showing every state with zeros is noise; showing `Dropped 205` is sticky distraction (nothing to do there).
- **OBS-021 [P1] [P-7]** — The lanes column renders `seeded` and `researching` rows on equal footing with `drafting`, encouraging the user to act on upstream rows that should not yet be in the action surface.
- **OBS-027 [P2] [P-12]** — On desktop, the `by-state` aside scrolls *with* the lane column rather than sticking to the side. After 600px of scroll, the user loses the overview entirely.

### Composer

- **OBS-007 [P1] [P-6, P-16]** — Desktop Composer empty draft canvas: ~70% of the left pane is dead black. The "Nothing written yet" callout floats at the top; the rest is void. Empty state should fill the canvas with a first-tap CTA.
- **OBS-025 [P2] [P-10]** — Composer empty state mentions materials only in small grey copy under the "Nothing written yet" callout. Materials are first-class to the rebuild; affordance must be primary.
- **OBS-029 [P2] [P-3]** — Composer rail tabs (Cleo / Refine / Materials / Research / Standards) are icon-only at the top right with no visible label until clicked. Tab-style without labels is divination.

### Header / chrome

- **OBS-017 [P2] [P-4]** — Buttons "Save Draft" / "Push to Cleo" coexist (legacy back-compat). Spec acknowledges the migration; user doesn't.
- **OBS-018 [P2] [P-4]** — Desktop header row carries `Synthesize`, `Sweep`, `Triage deck` as three side-by-side actions of similar visual weight. They are not equivalent (Sweep = preview-bulk-drop; Triage = swipe pile; Synthesize = fold N into 1). The triad reads as "three buttons for the same thing".

### Seeds

- **OBS-023 [P1] [P-9]** — Top-of-tab seed rail is a single-line collapsible bar that defaults to collapsed (`localStorage.cc_seed_rail_open !== '1'`). At first load it reads "8 ideas ready to seed" without showing them. The pile of incoming artifacts is hidden by default.
- **OBS-024 [P2] [P-16]** — When the seed rail empties, it shows "No fresh artifacts… capture an idea with ⌘I". Good copy, but the keyboard hint is the only CTA; mobile users see no affordance.

### Calendar

- **OBS-030 [P1] [P-16]** — Calendar shows "0 scheduled this month" and an empty grid. Krish has 25 in-flight pieces. Calendar is a dead surface. Either schedule should be made one-click from the list (today: open the picker by clicking a day, scroll past 25 unscheduled, pick one) or the surface should be demoted.

### Fast iteration paths

- **OBS-003 [P0] [P-11, P-6]** — From the mobile list, the only inline action per card is `Open →`. To approve a card it's: tap → wait for Composer mount → tap action → tap Back → next card. For a 25-card review pile that's ~100 taps just to sweep. No inline Approve, no inline Schedule, no inline Drop with reason.
- **OBS-031 [P1] [P-2]** — Mobile Composer header title clips to "The Persuasion Era Ended. The Prototype Era St…" even on 390px width. A content creator iterating on a piece needs the full headline visible.

### Counters that don't help

- **OBS-032 [P2] [P-15]** — "1 upstream to triage" on mobile uses an entry-row CTA — right shape. But "11 in review" and "25 active" are numbers in the header without verbs; they don't tell the user what to do.

### What works (preserve)

- The `AppFrame` no-scroll shell at desktop AND mobile (`scrollWidth === clientWidth`, root not scrollable). Confirmed via CDP.
- The bottom nav + floating Capture button on mobile.
- The "1 upstream" entry-row pattern on mobile — exactly the right shape for "this lane is upstream, swipe to clear".
- The Backburner collapsed footer pattern.
- The Composer rail being one panel at a time (avoids overload) — though the labels need to be visible (`OBS-029`).
- Realtime — changes from one device echo to the other (verified by mode switch + auto-state from triage).

---

## 2026-06-17 (later) — Opus — code-confirmed root cause of "buttons do nothing"

Krish reported: the Triage deck feels like a duplicate of the main tab; the green `→` and the right-rail "Greenlight"/"Send to research" do nothing visible; cards reappear unchanged; counts contradict each other. Traced each to source. These supersede the earlier "auto-classification" framing — the deeper cause is duplicated surfaces + relabel-not-develop. See `CORE_PROBLEM.md`.

- **OBS-033 [P0] [P-4]** — FOUR implementations of the same content state machine: `DesktopContent.tsx` lanes, `triageConfig.tsx buildContentTriageConfig` (deck), `decisionActions.ts` case `'idea'` (rail), `useContentTriage.ts` (brain). `useContentTriage.ADVANCE_NEXT`/`STATE_PRIORITY`/`patchState` are literal copies of `triageConfig`'s `CONTENT_ADVANCE_NEXT`/`CONTENT_STATE_PRIORITY`/`patchIdeaState`. This is the structural root of "duplicated UI".
- **OBS-034 [P0] [P-1, P-3]** — All "advance" actions are `PATCH /api/content-ideas {id, state}` — relabel only, no content produced. "Greenlight → drafting" (`decisionActions.ts`:177) moves an empty card to `drafting`, still empty. From the user's seat: nothing happened.
- **OBS-035 [P0] [P-1]** — "Send to research" (`decisionActions.ts`:184) toasts *"Sent to Zara for research."* but the handler ONLY does `PATCH {state:'researching'}`. No Zara webhook, no agent call. The confirmation is fabricated; research never runs. This is the "says it's sent and I never hear back" bug, exactly.
- **OBS-036 [P0] [P-1, P-12]** — The deck's "already handled" set is session-only React state (`useContentTriage` `committed = useState<Set>`). Exiting and re-entering triage wipes it, so an advanced card (still active) returns to the top with the same button. "Same card, same green button, same nothing."
- **OBS-037 [P0] [P-3, P-6]** — In the triage deck the primary action (`→`) advances state instead of opening the Composer. The Composer (`#/content?idea=`) is the ONLY surface that develops a card. So triage structurally cannot reach the develop surface — you can only push cards through empty stages.
- **OBS-038 [P0] [P-1, P-15]** — Five different "pile" populations on one screen: "25 active" (all active), "12 in review" (review only), deck "Up next 13" (`buildContentTriageConfig` = seeded+researching+drafting, excludes review/approved), by-state aside (every state incl. Dropped 205), "197+ more to triage" (another population). No single source of truth for the count.

## 2026-06-17 — Opus — P-3 executed: dry-run numbers + correction

Dry-run (read-only, PostgREST anon) of prod `content_ideas`, then correction via deployed service-role API.

- **Dry-run population:** 309 total rows. 25 active = 13 `review` + 12 `drafting`. Of those: **4 review** had empty `body`; **11 drafting** had empty `body`. 9 review had real bodies (≥200 chars). All 15 empty-body cards carried a `thesis` (researched, never drafted).
- **Em-dash audit (revises OBS-008):** **0** em/en dashes across `idea`, `thesis`, AND `body` in all 309 rows. `sanitizeVoice()` on write already keeps stored data clean. The em dashes seen in the mobile screenshots (OBS-008) are NOT in stored content fields — likely a rarer glyph (U+2015 horizontal bar) or rendered from an unsanitized `source_snippet`/preview path. **The em-dash-at-rest backfill is a no-op; dropped from P-3.** (If the visible dashes recur, chase `source_snippet` rendering, not `body`.)
- **Correction applied:** 15 empty-body `review`/`drafting` rows → `researching` (all had a thesis). Post-state verified on prod: **review 9 / drafting 1 / researching 15, zero empty-body review/drafting.** 15 `audit_log` rows written (`event_type='content_state_corrected'`). Reversal snapshot: `p3-reversal-snapshot.json`.
- **Key data insight reinforcing CORE_PROBLEM:** the zombie pile was concentrated in `drafting` (11/12 empty), which is the exact fingerprint of "advance = relabel": cards pushed to `drafting` by the deck `→` / "Greenlight" without a draft ever being written. P-4/P-5 must make the state a consequence of content existing.

## Pending verification (post first DB query)

- [ ] Exact count of `review` rows with `length(body) < 200` (the C-1 success target). Numbers will appear here.
- [ ] Exact count of zombie `drafting` rows with no body AND no `cleo_chat`.
- [ ] Histogram of body-length-by-state, to set the threshold in `J-01`.
- [ ] Em-dash audit: how many bodies contain `—` characters?

These four queries are paste-ready in `RUNBOOK.md`.
