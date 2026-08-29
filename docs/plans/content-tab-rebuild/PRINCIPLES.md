# Design principles — the constitution

> This is the **single, ranked list of UX design principles** for the Content tab rebuild. Every observed friction in `OBSERVATIONS.md` is a violation of one of these. Every job in `NIRVANA.md` exists to honour one of these. Every PR in `PLAN.md` must cite the principles it advances.
>
> If two principles conflict, the lower-numbered one wins. When in doubt, P-1 wins everything.
>
> **Authorship:** drafted 2026-06-17 from the live-test session + the mind/make OS skill. Any change requires a Krish ack in `STATE.md`.

---

## Tier A — The non-negotiables

### P-1. The screen is honest

The UI shows what is true about the data and only what is true. A card labelled `review` has a substantive body. A "Ready for you" tier contains things actually ready for you. A "voice ok" pill means the voice is ok. A timestamp says when something actually changed.

> **Sub-rules.** No state without invariant. No badge without semantics. No label that survives if the data behind it is empty.
>
> **Violated when** an empty draft sits in `review` (`OBS-001`), the "Awaiting you" tier renders 11 zero-word cards (`OBS-002`), a "voice ok" chip displays on a 0-word doc (`OBS-013`), em dashes ship in bodies despite `sanitizeVoice()` (`OBS-008`).

### P-2. One mode, one device

Mobile is **triage + fast iteration**. Desktop is **deep work + publish**. Each device has affordances built for its mode; primitives from the other device do not bleed across.

> **Sub-rules.** Swipe decks belong on mobile and the desktop overflow modal only. Two-column-and-aside layouts belong on desktop. Touch targets ≥ 44px on mobile; ≥ 32px on desktop with mouse precision.
>
> **Violated when** the desktop main view mounts swipe-card primitives (`OBS-015`), mobile Composer's rail buttons are 34px (`OBS-006`).

### P-3. Every click goes where the click promises

Buttons do the obvious thing. If the button says **Open idea**, it opens the Composer; it does not silently scroll-and-outline. If the click target is the title, the title opens the same thing the title-shaped button below it opens.

> **Sub-rules.** No click that "tries to scroll a card into view" — always commit to the deep action. No two adjacent buttons whose verbs differ by a single word ("Open" vs "Open idea"). No icon-only buttons without `aria-label` AND a tooltip on hover.
>
> **Violated when** clicking the top "Open idea" CTA from the Calendar view does nothing (`OBS-009`), thumbs up / thumbs down icons are unlabeled (`OBS-014`), the dropdown caret next to Save Draft has no visible affordance (`OBS-016`).

### P-4. One concept, one name, one place

Every concept has exactly one user-visible name and exactly one canonical surface. "Approve / Mark Ready / Push to Cleo / Save Draft" are at most one verb. "Pillar / lane / channel / tag / sweep" describe distinct things and are not used interchangeably.

> **Sub-rules.** Renames happen in code, not in user docs. Back-compat routes hide behind the new name. No metadata pill that means "this card was inspiration" sitting next to one that means "this is a draft" without a typographic hierarchy that explains which is the primary fact.
>
> **Violated when** cards stack `Inspiration sweep · draft · Synthesis hypothesis · AGENTIC OPERATIONS · SYNTHESIS · F# 10` pills with no hierarchy (`OBS-005`), Save Draft / Push to Cleo coexist (`OBS-017`), "Sweep" vs "Triage deck" vs "Synthesize" all appear in the same header row (`OBS-018`).

### P-5. Volume is hidden, not displayed

Big numbers shame the user. The OS surfaces only the next decision. Counts are diagnostic, not foreground. Backlogs collapse; they do not stream.

> **Sub-rules.** No lane should ever show > N cards in flow at once (current cap: 8 visible per state). Overflow routes to the triage deck. A "13 drafting" header is fine; a 13-tall column of 307-px-tall draft cards is not.
>
> **Violated when** the Drafting lane streams 13 full-height cards (`OBS-004`), the Backburner contains 79 buried items with no breakdown by reason (`OBS-019`).

---

## Tier B — The shape of the work

### P-6. Two modes of writing, both first-class

A content creator alternates between **fast iteration** (publish four short things this hour) and **deep work** (one essay this week). The UI dedicates a clearly-named affordance to each, and never makes the user use one to do the other.

> **Sub-rules.** Fast iteration: one-tap magic-edits, list-level inline actions, ≤ 4 taps to ship. Deep work: full-screen workbench, the rail tools (Cleo / Refine / Materials / Research / Standards) panel-stacked or split-view, materials pinned.
>
> **Violated when** the only way to approve from the list is "tap card → wait for Composer → tap Save Draft → tap back" (`OBS-003`), the Composer empty state forces the user to choose Cleo OR Edit (`OBS-007`).

### P-7. The pile is a backlog, not a stream

`seeded` and `researching` are upstream queues. Krish does not need to see them in flow. They surface only via the triage deck or a single "N upstream" line that opens the deck.

> **Sub-rules.** Lanes view shows `drafting`, `review`, `approved` by default. Upstream + downstream collapse to single-row entries. The "1 upstream to triage" line that mobile already shows is the right shape — desktop adopts it.
>
> **Violated when** the by-state aside on desktop lists every state (`OBS-020`) even when 0/0/0/0 is meaningless, when the lanes column renders `seeded` and `researching` rows on equal footing with `drafting` (`OBS-021`).

### P-8. The system suggests, the human decides

Every AI-derived label, score, lane, and state carries a confidence number. Below a threshold, the UI says "Cleo is unsure" with a single-click confirm. Above it, the label stands without explanation.

> **Sub-rules.** Five Standards stays advisory (PUB-001). Auto-classification of state/lane stays advisory below 0.7 confidence. The user sees the disagreement; the agent does not silently make it stick.
>
> **Violated when** zombie `review`-state cards are presented as fait accompli (`OBS-001`), lane is null on cards with no "Cleo is unsure" badge (`OBS-022`).

### P-9. The seed is incoming, not a popup

Real artifacts (customer voice, closed deals, fresh signals) are an honoured **incoming lane** in the workbench. They are not a collapsible bar that hides until clicked, and they are not a homepage banner.

> **Sub-rules.** A seeded idea always carries its source ref + `Open source` action. Promotion (seed → seeded row → researching) is one click. Honest empty state ("no fresh artifacts") shows quietly inside the same lane.
>
> **Violated when** the seed rail is a top-of-tab collapsible banner Krish can ignore (`OBS-023`), the empty state copies a phantom CTA (`OBS-024`).

### P-10. Materials are first-class

Research the user attaches to a piece grounds every generation AND rides into the published Doc. A piece without materials shows a single-tap "+ Add materials" affordance in the deep-work view.

> **Sub-rules.** Drag/drop, paste-URL, paste-text all funnel to `meta.materials[]`. Cleo chat without materials shows a gentle nudge ("attach a couple of links and I'll be sharper").
>
> **Violated when** the Composer empty state mentions materials only in a paragraph of small grey text (`OBS-025`).

---

## Tier C — The texture

### P-11. Every action has both an inline form and a deep form

The list-level inline form is fast and irreversible-with-undo. The deep form is in the Composer and reversible across sessions.

> **Sub-rules.** Drop inline = single-tap left-swipe / right-click → undo toast (5s). Drop deep = explicit modal with reason chip. Approve inline = checkmark on the card. Approve deep = Save Draft from the Composer header. Schedule inline = pill button → mini calendar pop-out. Schedule deep = drag onto the calendar.
>
> **Violated when** the only path to Drop from the list is an unlabeled 22×22 X button (`OBS-026`), there is no inline Approve (`OBS-003`).

### P-12. Layout is calm at every scroll position

The screen does not lurch when the user scrolls. Sticky chrome is sticky; non-sticky chrome scrolls; nothing partially does both.

> **Sub-rules.** The lane filter pills stick. The by-state aside sticks (today it scrolls away on desktop — `OBS-027`). The Composer header sticks. The Save Draft button sticks at the bottom on mobile. No element has `position: sticky` without an explicit top/bottom offset.

### P-13. No horizontal scroll, anywhere, ever, on the page root

Inner horizontal scrollers must be self-contained (the lane pill row at top is OK; an inner card content scrolling sideways is not).

> **Sub-rules.** Page root passes the `RUNBOOK.md` detector. Sweep/Synthesize/Triage-deck buttons that overflow at mid widths wrap (`OBS-028`), not scroll.

### P-14. Voice is enforced at write-time AND at rest

Every existing body is sanitised by a one-off migration. Every new write is sanitised server-side. The user never sees an em dash, ever.

> **Sub-rules.** The "⚠ em dash" badge disappears (because it is never needed). The "Fix voice" header button is hidden when the body is clean (defensive, but visible if a paste introduces one).

### P-15. Counters say something useful or are absent

`25 active`, `11 in review`, `79 buried` are signals only if they tell the user what to do. A count without a verb is noise.

> **Sub-rules.** "11 in review" reads "11 awaiting your sign-off — clear queue". "79 buried" reads "79 buried — review weekly" with a frequency hint. "0 scheduled this month" reads "schedule your first this month — drag any draft onto a day".

### P-16. Empty states do the next job for the user

A blank calendar month invites scheduling. A no-materials Composer offers drag-and-drop. An empty `seeded` lane offers "browse incoming". Empty state is never a void; it is a CTA.

> **Sub-rules.** No empty state without an action. No empty state with corp copy ("Coming soon", "Nothing to see").
>
> **Violated when** the desktop Composer empty draft canvas is 70% dead black space (`OBS-007`).

### P-17. Animations earn their time

Motion that conveys "this is happening" stays (skeleton loaders, success ticks). Motion for decoration is removed.

> **Sub-rules.** Every animation costs ≤ 250ms. No card pulse on entry. No gradient sweep on the lane header. Saving a draft shows a 200ms tick, not a 1500ms swoop.

### P-18. Telemetry is automatic

Every accept, reject, drop, schedule, edit writes to `feedback_queue` with a reason chip Krish picked or a default `unspecified`. Vera sees patterns; the user never types the same correction twice.

> **Sub-rules.** No "submit feedback" form. The action IS the feedback.

---

## Tier D — The system around the system

### P-19. Flags gate every change

Each new behaviour ships under `VITE_CONTENT_REBUILD_ENABLED` (or a phase-scoped flag underneath it). The previous behaviour stays reachable until Krish flips the flag.

### P-20. State files lead, code follows

`STATE.md`, `PLAN.md`, `OBSERVATIONS.md`, `PRINCIPLES.md`, `ANTI_PATTERNS.md`, `CONTEXT_POINTERS.md` are the spine. A weaker model reading them in order can finish a phase without rediscovering anything. (See `CHARTER.md` for the exact read order.)

### P-22. Anticipate the next action (the surface leans forward)

At every moment the one surface should already be offering the action Krish is most likely to want next — pre-placed, one input away, no hunting. The UI predicts intent from state and context and puts that action under the thumb (mobile) or the cursor (desktop).

> **Sub-rules.**
> - After a card is **developed to a real draft**, the next likely action is "send for review / approve" — surface it inline, don't make him reopen.
> - After he **approves**, the next likely action is "schedule it" — offer the calendar/day picker immediately.
> - After he **drops/advances** a card in the deck, the next card is already in place (no empty state, no re-tap).
> - On **opening a `review` card**, the primary affordance is Approve (it's ready) plus a one-tap "tighten" — not a blank editor.
> - On an **empty/seeded card**, the primary affordance is "Develop with Cleo" — the thing that moves it forward.
> - Desktop keeps the **next-best card pre-loaded** in the workbench so finishing one piece flows straight into the next without a list round-trip.
> - The single "what's next" pill (J-13) is the global expression of this: the highest-probability next action, always one tap away, on both devices.
>
> **Test.** From any state, the action Krish reaches for next is already visible and ≤ 1 input away. He should almost never have to navigate *to* an action — the action comes *to* him.

Every PR description includes a "Principles advanced" line (e.g. "P-1, P-7, P-13") and a "Principles unchanged" line. If a PR cites no principles, it is decoration and does not ship.

---

## How a future session uses this file

1. Read it once on session wake.
2. Look at the friction Krish describes.
3. Tag each friction with its principle (`P-N`) and append a one-line entry to `OBSERVATIONS.md` (`[P0/P1/P2] [P-N] <description>`).
4. Open `NIRVANA.md` — find the matching `J-NN`. If none exists, propose one (and stop to ask Krish).
5. Open `PLAN.md` — find the phase that delivers the job. Check its DONE WHEN block.
6. Ship the smallest slice. Cite principles in the PR.
7. Update `STATE.md` in the same commit.

If the principle list itself is wrong, propose an edit here BEFORE writing the code that would violate the current text.
