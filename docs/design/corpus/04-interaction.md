# 04. Interaction: touch, voice, what "haptic" honestly means, and immersion

## The rule

**A control announces that it is touchable.** A dial has a thumb, a ring, a
centre dot and a hint that stops for good on first touch. A disclosure has a
hitbox and a direction: a chevron in a 28px tile, rotating on open, never a
bare 16px glyph. A flat dot is not an affordance.

**Every tap target is 44px by hit-test**, and `.tap-44` grows the hit area
without moving the ink. A touch floor is not a density: 48px is right in a
sheet and wrong under a mouse, so the chip recipe takes `compact` and the desk
gets 36.

**Two paths for every gesture.** Swipe plus arrow keys; drag plus up and
down; a number key for every reason chip. Never drag-only, especially on a
phone. Undo on every optimistic write: the row changes now and reverts with
an Undo toast on failure; there is no loading state on a write.

**The write side has one system per job.** A phone never edits inside a dense
layout: the tap opens `shared/FocusedEditor`, text large and whole, voice
beside the keyboard, one full-width Save, danger behind "…" with a second
arming tap. The app knows the keyboard exists (`hooks/useKeyboardInset.ts`,
applied by `ui/dialog`). Small sets are chips, never a native select. Long
dictation goes into a plain box (`strategist/TalkBox`): no microphone of its
own, Enter is a new line, the draft is kept until the server has kept the note.

**Voice is a first-class input.** Krish dictates with Wispr Flow, which types
into whatever field has focus. So the field takes focus one frame after the
sheet has moved it, caret at the end, and competes with nothing.

**Haptics, honestly.** `hooks/useHaptics.ts` wraps `navigator.vibrate` with
twelve named patterns and is imported by 88 files. On Android it fires. On
his iPhone the web has no haptic channel at all, and on every desktop there
is nothing to shake, so there it is a silent no-op by design. "Haptic" on his
phone therefore means the tactile substitutes the system already has: the
press scale (`.press-spring`, `usePressable`), the swipe arming and
committing (`useCardDeck`), the check drawing itself (`DrawnCheck`), and the
sheet settling on the spring curve. The doctrine says this rather than
promising a buzz the device cannot deliver. Wire a haptic at a gesture
moment, not on every tap, and never let a surface depend on it to be
understood.

**Immersion is the instrument room, and it never costs legibility.** The
stage that never scrolls, the ambient field and grain behind content, the
mood that cools to tense on a critical alert and warms on growing revenue
(`useMoodSource`). All of it goes static under `prefers-reduced-motion`, dims
under `data-capacity='low'`, and switches off when ambient is off. A surface
that is only readable with the ambience on has failed.

**The keyboard is a contract.** ⌘K, ⌘I, ⌘J and ⌘/ open and close on Escape;
tab order runs sidebar then content; skip-to-content is the first stop and
moves focus, not scroll; every focusable control shows the house ring.

## Learned from

- **2026-08-22, Save off the edge.** The goal-edit row rendered Save off the
  right of a phone, under a keyboard the app could not see. The write side
  was locked that day: `FocusedEditor`, the keyboard inset, chips not selects
  (`DESIGN_SYSTEM.md`, "The write side").
- **2026-09-11, the phone deck.** The Pilots deck owned the whole screen
  instead of a fixed box; swipe gained Undo; known collaborators sorted to the
  bottom at Krish's call (`docs/plans/one-swing/STATE.md`, P2).
- **2026-09-23, the disclosure that read as unfinished.** A bare `+` / `−`
  glyph in a card corner was the one piece of chrome on Focus and the one that
  read as broken; the 28px rotating chevron is the house spelling
  (`DESIGN_SYSTEM.md`, "The Focus tab's material").
- **2026-09-26, the sheet that rose sideways.** An entrance keyframe wrote
  `transform`, which stripped Tailwind's `-translate-x-1/2`, so the phone's
  bottom sheets rose half off-screen and snapped as they landed. Keyframes
  move with `translate` and `scale` now, held by `e2e/sheet-motion-phone.spec.ts`.
- **2026-09-27, dictation.** The TalkBox is a plain textarea because a
  microphone of our own would compete with Wispr Flow
  ([ADR-026](../../DECISIONS/026-the-strategist.md), alternatives).
- **2026-10-02, buttons falling off the phone.** The composer's tool row ran
  about 250px past a 390px screen in every state and no phone spec had ever
  opened the composer; `e2e/composer-phone.spec.ts` fails CI if any control
  leaves a 360 or 390 screen (`NOW.md`, 2026-10-02).
- **2026-10-09, haptics measured.** 88 importers of a hook that is a no-op on
  the device he holds. The rule above is the honest reading of that number.

## Held by

- Tap targets by hit-test: `e2e/layout-audit-phone.spec.ts` (report mode) and
  `.tap-44` on every chip and segment (`DESIGN_SYSTEM.md`, Extensions for
  Content's today's calls).
- The keyboard contract: `e2e/keyboard.spec.ts`.
- Sheet motion on the phone: `e2e/sheet-motion-phone.spec.ts`.
- Every composer control on a phone screen: `e2e/composer-phone.spec.ts`.
- Overlays are the four primitives, each with a dialog role, focus trap,
  scroll lock and focus restoration: **review only**; the legacy `fixed
  inset-0` dialogs named in `DESIGN_SYSTEM.md` migrate when touched.
- Two paths for every gesture, Undo on every optimistic write, haptics only
  at gesture moments: **review only.**

## Measured by

- Tap targets under 44px by hit-test, per surface, from the phone layout
  audit (`LAYOUT_AUDIT=1 npx playwright test layout-audit --project=phone-360`).
- Hand-rolled `fixed inset-0` overlays outside the sanctioned list: read by
  `grep -rn "fixed inset-0" src/components`, compared to the names in
  `DESIGN_SYSTEM.md`, "The primitive layer", rule 2.
- `useHaptics` importers: 88 on 2026-10-09. The number to watch is not the
  import count but how many fire outside a gesture moment.

## Open

1. **A guard for hand-rolled overlays**: fail a new `fixed inset-0` outside
   the sanctioned list. Review only today.
2. **Haptic moments named**: an allowlist of the gesture hooks that may fire a
   pattern (`useCardDeck`, `usePressable`, the swipe commit), so a tap handler
   cannot add a buzz. Review only today.
3. **iOS**: if the PWA ever gains a native shell, the twelve patterns map onto
   `UIFeedbackGenerator` by name; that is why they carry those names already.
