# Focus & Purpose

The pilot layer monitors the operator's output. This layer carries the
operator's theory: who he is, who he is not, and the counter-moves for the
traps he has named in his own record.

It exists to deliver on one problem statement, in his words: strengths become
liabilities in conversation (fast conclusions, accuracy over timing,
correcting before the other person feels understood, over-disclosure), asks
get pre-rejected before they are made, exposure gets replaced with
productive-looking work, and any system that creates more self-consciousness
makes it worse. The full diagnosis and evidence base is committed at
[`focus-purpose/OPERATING-MANUAL.md`](./focus-purpose/OPERATING-MANUAL.md);
what he wants from life, and the decision rules derived from his own ranked
answers, at [`focus-purpose/PURPOSE-WORKBOOK.md`](./focus-purpose/PURPOSE-WORKBOOK.md).
Those two documents are the corpus. They are in the repo precisely so the
theory is on tap for every future session and agent, not resident in one
chat's context.

## Where the theory lives, layer by layer

| Layer | File | Role |
|---|---|---|
| Corpus | `docs/focus-purpose/OPERATING-MANUAL.md` | The evidence-graded manual: diagnosis, 43-framework library, conflicts, conversation OS, script bank, exposure ladder, 30-day programme, coaching prompt |
| Corpus | `docs/focus-purpose/PURPOSE-WORKBOOK.md` | The ikigai distillation, v4 on top: the mission, the face, decision rules v2, the stop rule; v3 kept as history |
| On-tap slice | `src/content/focusTheory.ts` | The typed, curated subset the product renders: traps, situations, rules, purpose lines, prediction chips, self-rejection markers. Static on purpose, like `pilotStoic.ts`: instant, offline, cannot drift silently |
| Surface | `src/components/focusPurpose/` | The Focus & Purpose tab (`#/focus`) and the Home entry card |
| Data | `public.pilot_asks` + `api/pilot/asks.ts` | The daily ask: one row per civil day, prediction before outcome |

Change flows downhill: edit the corpus, then the on-tap slice, then the
surface. A surface line with no corpus backing is an invention; delete it.

## Constraints, non-negotiable

These extend the pilot layer's constraints (docs/PILOT-LAYER.md) and are
written down so a future session does not remove them as improvements. The
operator ruminates, over-monitors, and relitigates; the corpus is explicit
that a system which adds self-consciousness makes him worse. Therefore:

1. **No archive, anywhere.** No list of past asks, past trap taps, past idea
   tests. The only rows the client ever sees are today's ask and the single
   oldest unresolved one. Do not add a history endpoint, a calendar view, or
   an export.
2. **No scores, no streaks, no charts.** The ask card never counts, never
   trends, never colours by performance. The one number pair that exists is a
   prediction meeting its outcome, once, in one sentence.
3. **Theory surfaces only at the point of action.** A trap chip reveals one
   counter-move; a situation chip reveals one sequence; a rule chip reveals
   one verdict. There is no browse-the-library mode. The library is the docs.
4. **Every interaction ends in one move.** Steady hands off to the ask or the
   worry compiler; a script ends with a stop-talking point; a resolved ask
   ends with one learning line. Nothing loops back for reflection.
5. **The register is the pilot register.** Direct, calm, zero reassurance,
   zero motivational language, no exclamation marks, no em dashes. The
   counter-moves quote his own record back to him; they do not cheer.
6. **The idea test saves nothing.** It says so on the surface. A persisted
   log of judged ideas is rumination material.
7. **One trap vocabulary.** The traps in `focusTheory.ts` mirror the manual's
   real-time diagnostic and if-then plans. Add a trap only when the corpus
   documents it; never invent one from a single bad week.

## The surface

`src/components/focusPurpose/FocusPurposeTab.tsx`, tab id `focus`, in both
IA registries with drawer priority: its first-class doors are the check-in,
the anxious-day route, and Home's doorway row, not ambient nav presence.

- **Header:** one purpose line per civil day (`purposeFor`), serif, with its
  provenance. Never more than one — and **never truncated**: the line is the
  point, so it is never clamped or ellipsised on any device (2026-08-22; the
  tab runs short of a screen on most phones, and very short viewports degrade
  to the wrapper's scroll, not to "…").
- **The ask (the spine):** `AskCard`. Compose (voice-first); once there is
  text, the refusal prediction appears as four plain chips (Likely / Lean
  yes / Lean no / Unlikely — progressive, so an empty card asks exactly one
  thing); "Save the ask" commits; "I sent it" stamps `sent_at` and writes the
  ships row (channel `ask`, dedup key `ask:<id>`) server-side; outcomes are
  recorded with one tap and answered with one learning line. An unresolved
  ask from a past day surfaces above, one at a time. The self-rejection scan
  (`findSelfRejection`) names softeners ("sorry to bother", "just checking")
  as they are typed; advisory, never blocking.
- **Steady:** the manual's real-time diagnostic as six trap chips; the
  counter-move renders under the tap. Two traps hand off to the worry
  compiler, two to the ask.
- **Before you speak:** ten script cards from the manual's situation bank:
  sequence, what not to say, stop-talking point.
- **Test an idea:** the workbook's eight decision rules (v2) as failure chips,
  verdict under the chips, nothing saved.
- **Footer:** "compile a worry" and "shutdown", the two actions that used to
  float over every tab.

## Access paths

1. **Morning check-in.** The intent list carries `Make the ask` (key `ask`),
   routing to `#/focus`. The number one intervention in the manual now has a
   name in the morning vocabulary.
2. **Anxious auto-route.** An unskipped reading with anxiety >= 4 (the same
   boundary `computeMode` routes red on; `isAnxiousReading`) opens the day on
   `#/focus?steady=1` with Steady unfolded. On green-override days it fires
   at check-in; on red days only after red mode clears by ship or escape
   hatch, because red mode's one-screen contract is untouched. The unlock
   path that opens the in-app draft carries its own destination and is never
   routed over.
3. **Home.** The `Focus` door at the bottom of both Home shells
   (`src/components/home/FocusDoor.tsx`): a full-width row on desktop, and
   on mobile a compact pill sharing the + button's band with the Intel pill
   (2026-08-22). It carries no number: counting anything about the operator
   in ambient chrome would break the doctrine of the hub it points at. A
   doorway, not a vital. Because the pill lives in the band the + button
   already reserved, it costs the canon nothing and is **always visible** —
   the old under-840px hiding gate is gone.

   > It began as `FocusEntryCard`, a card under the pilot cards on each Home
   > branch. The 2026-08-20 Home recompose rebuilt Home as a one-screen,
   > no-scroll canon and dropped the mounts, so the door was briefly missing
   > altogether. The replacement was a link at the end of the vitals line —
   > which read as one more metric and, on a narrow phone, wrapped alone onto
   > a second row. The 2026-08-21 pass gave it a full-width row; the
   > 2026-08-22 pass compressed that to the pill, which finally made it
   > unconditional.
4. **Drawer and ⌘K.** Via the tab registry, both IAs.
5. **The + create sheet.** On the Focus tab the mobile + button offers
   "Write today's ask", delivered over the `quickCreate` bus
   (`useQuickCreateListener('ask')` focuses the compose field).

## Data model and routes

`scripts/migrations/2026-08-20-pilot-asks.sql` (mirrored in
`supabase/migrations/20260820120000_pilot_asks.sql`): `public.pilot_asks`,
one row per `ask_date` (unique index), house RLS posture (anon SELECT,
service_role ALL). `predicted_no_pct` is captured before the send and never
edited after; that is the calibration against the burden belief (Flynn and
Lake 2008: requesters underestimate compliance by as much as half).

`api/pilot/asks.ts`: GET today + single oldest unresolved; POST upsert per
civil day, `mark_sent` also upserting the ledger row idempotently; PATCH
records the outcome. Same posture as the rest of the pilot API: public read,
unauthenticated operator writes, service role server-side only.

## What moved, 2026-08-20

The floating pilot dock ("compile a worry | shutdown", one pill over every
tab) is gone. `EveningShutdown` now renders only the once-a-day after-5pm
prompt; `ShutdownModal` is exported and mounted by the Focus tab;
`WorryCompiler` lost its dock-button wrapper and is opened by the Focus tab's
footer and by the spiralling/relitigating counter-moves. The dock primitives
(`PilotDock`, `DockButton`, `useAboveNavOffset`) were deleted from
`src/components/pilot/controls.tsx`.

## Tuning points, known and deliberate

- The worry compiler's prompt (`api/_worry-prompt.ts`) does not yet know the
  avoided-ask pattern (a worry that is really an unmade request compiling to
  the bounded ask). Candidate rule if the compiler feels too quick to close;
  change it with live testing, not speculatively.
- The exposure ladder (manual §7) is in the corpus but not yet a surface. If
  the daily ask plateaus at low-stakes requests, the ladder's levels are the
  next slice to bring on tap, still without history views.
- `ask` days rank nominations like money/growth days (`INTENT_KINDS.ask`);
  revisit once a few weeks of ask-intent days exist.
