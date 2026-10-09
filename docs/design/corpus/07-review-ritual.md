# 07. The review ritual: how a change is checked before Krish sees it

## The rule

**Measure, never argue.** A layout claim is a number from a populated
fixture at a viewport above the widest breakpoint in the code: page scroll,
clipped content, nested scrollers, the largest empty rectangle inside the
box content occupies, squeezed text, overlapping controls, composited
contrast, off-scale type, and tap targets by hit-test
(`e2e/fixtures/layout.ts`; `e2e/layout-audit-desk.spec.ts` and
`-phone.spec.ts`). A probe reads what is painted: two still frames after a
change, never the frame between a change and the refit.

**A guard that has never failed is a comment.** Before a gate ships, plant
the defect it exists to catch, watch it fail, remove the defect, then
commit. `useFitFolds` was proved by switching the folds off and watching
eleven checks fail; the frame-reach probe by restoring the old wrapper and
watching nine fail at 96px; the entropy ratchet by a zero baseline and a
planted `transition-all`.

**A probe that finds nothing has to be proved able to find something.** The
first clipping probe returned clean after visiting one element while Systems
was 225px over with 60 elements unreachable (root `AGENTS.md`, "Measuring a
layout").

**The guard list is generated, never maintained by hand.** The root
`AGENTS.md` CI list is read from `.github/workflows/ci.yml`; it once named
nine guards that did not exist and omitted seven that ran.

**Every material surface passes the concept gate before code.** Three
independent concept spines that differ on at least two load-bearing axes
(sequencing, agency, primary interaction, information structure, state
model), judged blind by two fresh judges, synthesised, rendered once, shown
cold, approved explicitly, then locked. Routine repairs inside the lock
continue without reopening taste. The worked example is
[`docs/design/editorial-desk/CONCEPT-GATE.md`](../editorial-desk/CONCEPT-GATE.md):
three spines, two judges, one lock, the rejected destination recorded with
its reason.

**The end-of-build scan runs before presenting, every time** (`krish-design`,
section 7): stale content, typos and spacing, symmetry, affordances, verdict
placement, whitespace, copy compliance, render verification (actually look at
it), present the file, responsive range, accessibility, voice and combined
proof. A build that was never looked at was never checked.

**The local list before a push.** CI runs five named specs plus every
`*-desk.spec.ts` at 1440 and 1920 and every `*-phone.spec.ts` at 390 and 360;
everything else is caught only by a full local run. The structural guards in
`scripts/check-*.mts` run in seconds and run first.

## Learned from

- **2026-09-17, the metric that rewarded filling space.** "Percent of
  viewport width occupied" scored a surface 96% while half the screen sat
  empty beside one narrow card; the screenshot Krish sent back hours later
  showed it. Replaced by the largest empty rectangle inside the content box
  (`DESIGN_SYSTEM.md`, "The correction, same day").
- **2026-09-23, three cycles lost in one day** (root `AGENTS.md`): the probe
  that returned on its first node; a fixture that rendered an empty page and
  scored holes of 0.33 that said more about the mock than the layout; and
  the failure a no-scroll shell introduces that no other measure can see,
  because clipped content does not scroll, overlap, leave a hole or appear in
  the screenshot.
- **2026-09-23, Focus.** The last wide surface with no desk spec had been
  shipped and reshaped twice without one test rendering it; each assertion
  was mutation-tested rather than trusted (`e2e/focus-desk.spec.ts`).
- **2026-09-07, the concept gate.** Krish rejected a separate Editorial
  Desk destination because it duplicated the Content engine; the Cut Room
  spine survived as a state inside the existing room, locked on 2026-09-07
  with the implementation rules written into the gate.
- **2026-10-03, two still frames.** A probe taken between a change and the
  frame that refits it measured a layout nobody sees (`settled()` in
  `e2e/fixtures/dailyMove.ts`).
- **2026-10-05, the production render.** A logged-in render of all eight
  tabs at 1440x900, 1280x800 and 390x844 showed no page scroll and no crash
  (`NOW.md`). That is the kind of evidence a claim about the whole needs.

## Held by

- The gates that fail: `e2e/desk-noscroll-desk.spec.ts`,
  `e2e/phone-noscroll-phone.spec.ts`, `e2e/home-fit-desk.spec.ts`,
  `e2e/home-fit-phone.spec.ts`, `e2e/frame-reach-desk.spec.ts`,
  `e2e/surface-moves-desk.spec.ts`, `e2e/theme-contrast.spec.ts`,
  `e2e/keyboard.spec.ts`, `e2e/sheet-motion-phone.spec.ts`,
  `e2e/composer-phone.spec.ts`, and the structural guards in
  `.github/workflows/ci.yml`.
- The audit that never fails and records the numbers:
  `e2e/layout-audit-*.spec.ts` behind `LAYOUT_AUDIT=1`.
- The entropy ratchet in report mode for the quarterly read.
- The concept gate and the end-of-build scan: **review only**, by the
  design owner, and recorded in `docs/design/<surface>/CONCEPT-GATE.md` for
  a material surface.

## Measured by

- The layout audit's table per surface, in `audit/` after a run.
- The entropy ledger, dated, under "Measured by" in `01-entropy.md`.
- The count of e2e specs (66 on 2026-10-09) against the surfaces they cover;
  a surface with no spec is the next Focus.

## Open

1. **A generated guard list.** The root `AGENTS.md` CI paragraph is
   described as generated from `ci.yml` and is edited by hand; a script that
   prints it would make the sentence true.
2. **The quarterly read** as a dated routine rather than a habit: a
   `--report` run whose table lands in `01-entropy.md`.
3. **A coverage map**: which surfaces have a desk and a phone spec, generated
   from `e2e/`, so the next untested surface is named rather than found.
