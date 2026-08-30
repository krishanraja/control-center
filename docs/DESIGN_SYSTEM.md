# Design System — "Obsidian Aurora"

> **Scope.** The visual + interaction language of Control Center: themes,
> tokens, typography, material, motion, haptics, and the shared primitives every
> surface renders through. The contract that keeps the app feeling like one
> product across 11 tabs and two device classes.
>
> **Not in this document.** Per-tab product behaviour lives in
> [`PRODUCT.md`](./PRODUCT.md); component-by-component patterns in
> [`COMPONENTS.md`](./COMPONENTS.md). See ADR-007 for *why* this language was
> adopted.

---

## Philosophy

Obsidian Aurora evolves the original "Calm & Anticipatory" motion language into
a full, adaptive identity. The soul is a **command cockpit** — deep, quiet,
premium — that is **alive with a restrained sense of presence** and adapts to
day or night. Every choice is still measured against the product's north star:
*does it reduce time-to-decision, or just look nice?*

Three ideas run through everything:

1. **One product, two device intents.** Mobile is triage / one-handed / push
   forward; desktop is deep work / keyboard. The same tokens and primitives
   render both — the deltas live inside the primitive, never at the call site.
   (`useDeviceClass()` resolves intent by pointer type, zoom-invariant.)
2. **Surface the next action.** The `DoThisNextHero` is the one focal, breathing
   surface on every tab; everything else recedes.
3. **Respect the person.** Everything honours `prefers-reduced-motion`; haptics
   are silent no-ops off Android; the theme follows the OS by default.
4. **One system per job.** Every recurring capability — type, icons, overlays,
   chips, create, editing, loading, copy — has exactly one house
   implementation, documented here. Extend it in place (a prop, a tone, a
   kind); never ship a sibling variant or a local re-implementation. The
   per-capability index for coding agents lives in the root
   [`AGENTS.md`](../AGENTS.md) ("The house systems"); the rationale in
   [ADR-013](./DECISIONS/013-one-system-per-job.md).

---

## Themes & the "at will" toggle

Two independent, persisted switches applied as attributes on `<html>`:

| Switch | Values | Attribute | Source |
|---|---|---|---|
| Theme mode | `system` \| `light` \| `dark` | `data-theme="light\|dark"` | `src/lib/theme.ts` |
| Ambient (experimental) | on \| off | `data-ambient="off"` | `src/lib/theme.ts` |

- **`system`** live-follows the OS colour scheme; **light/dark** force it.
- **Ambient off** disables the experimental "Living Canvas" layer (aurora field
  + grain + mood), leaving a clean, flat adaptive light/dark.
- Reachable three ways: the **desktop sidebar footer**, the **mobile "More"
  drawer → Appearance row**, and **⌘K → Appearance**. All go through
  `ThemeToggle` / the `useTheme()` hook.
- **No flash of the wrong theme:** a tiny inline script in `index.html` sets
  `data-theme` from `localStorage` before any style paints (mirrors
  `theme.ts`). The splash screen has a light variant too.

### The keystone convention — `--fg`

Tailwind's `white` is remapped to `rgb(var(--fg) / <alpha-value>)`. `--fg` is
`255 255 255` in dark and **`0 0 0` (pure black, NOT `--ink`)** in light.
**This single lever makes the thousands of existing `text-white/60`,
`bg-white/[0.05]`, `border-white/10` utilities theme-adaptive with no per-file
edits.** Pure black is deliberate: every muted tier is an opacity of `--fg`, and
those ratios were tuned for white-on-obsidian. Inverted onto pale paper the same
opacity reads washed out, so true black lifts every tier at once.

**Contributor rules that follow from this:**
- `text-white/NN`, `bg-white/NN`, `border-white/NN` are theme-adaptive — use
  them freely for foreground text, tints, and hairlines.
- Need text that stays **pure white on a coloured fill** (e.g. on an accent
  button)? Use `text-[#fff]`, not `text-white`.
- Need a high-emphasis **inverted** button (white-on-dark by night,
  ink-on-paper by day)? Use `.btn-contrast`, not `bg-white text-black`.
- A solid opaque surface that should follow the theme? Use `bg-base` / `bg-sunk`
  (never a hardcoded `bg-[#0f0f12]`).
- **A fixed hex under adaptive text is the bug that keeps shipping.** Each half
  looks fine on its own, so review does not catch it: the surface is picked for
  one theme, the text flips with the other, and they converge. `command.surface`
  was `#14131b` under `text-white/90`, and the Home door pills (Focus / Signals /
  Intel) plus the critical alert banner rendered dark-on-dark in daylight
  (2026-08-30). The whole `*-300` accent tier had the same shape: 9-11:1 on
  obsidian, 1.6-2.0:1 on paper, and 467 of its 489 uses are text.
- **Colour used as TEXT must be legible on both grounds** — obsidian `#08070D`
  and paper `#F2F1F8`. Either give it a channel (dark keeps its hex, light takes
  the deep `--ac-*` value, as `--s300-*` does) or do not use it as text. A fixed
  mid-tone that clears both is fine and several are deliberate: the `command`
  semantics and the `*-400` fill tier.
- Two guards hold this. `scripts/check-theme-tokens.mts` (CI) checks the cause
  without a browser; `e2e/theme-contrast.spec.ts` measures the real composited
  contrast across six routes in both themes, and fails a page that never left its
  splash rather than passing it silently.

---

## Tokens

All colour truth lives as CSS custom properties in `src/index.css :root` (dark)
and `:root[data-theme='light']` (day), mapped into semantic Tailwind names in
`tailwind.config.js`.

### Colour
| Token | Dark | Light | Tailwind |
|---|---|---|---|
| `--bg-base` | `#08070D` obsidian | `#F2F1F8` lavender paper | `bg-base` |
| `--bg-sunk` | `#060509` | `#E9E8F2` | `bg-sunk` |
| `--ink` / muted / faint | `#ECEAF5` / `#A7A3B8` / `#6E6A80` | `#171521` / `#585466` / `#8A8598` | `text-ink` / `text-ink-muted` / `text-ink-faint` |
| `--fg` (white remap) | `255 255 255` | `0 0 0` | `*-white/NN` |
| `--accent` / `-2` / `-3` (aurora) | muted violet → indigo → teal | deepened for paper | `text-accent`, `.aurora-*` |

> Light `--fg` is pure black, **not** `--ink`. Every muted tier in this app is
> an opacity of `--fg`, and those ratios were tuned for white-on-obsidian;
> inverted onto pale paper the same opacities read washed out. True black lifts
> every tier at once. `index.css` is the source of truth for all of these.

- **Brand accent cascade:** Tailwind's `violet` ramp is redefined to the aurora
  anchor, so existing `violet-300/400/500` usages are the brand colour.
- **Semantics preserved:** `pod` (ops cyan / revenue emerald / growth violet)
  and `status` (needsYou amber / blocked rose / active emerald / waiting slate /
  done gray) keep their meaning — never re-purpose these hues.
- **Money ink:** the MRR number wears `.money-text` (emerald→cyan clip).

### Material & elevation
- `.glass-card` / `.surface` / `.surface-2` are built from per-theme card tokens
  (`--card-bg`, `--card-bg-a`, `--card-border-a`, `--card-hi-a`, `--card-shadow`):
  a lit white-overlay by night, a raised near-white panel by day.
- Elevation ladder `shadow-e1/e2/e3`; radii stay generous (2xl/3xl).

### Motion
- Easings: `--ease-calm` (base), `--ease-out-soft`, `--ease-spring` (tactile
  overshoot). Gestures/keyframes documented inline in `index.css`.

---

## Typography

| Role | Family | Tailwind |
|---|---|---|
| Headlines, hero titles, section eyebrows, big numbers | **Bricolage Grotesque Variable** | `font-display` (auto on `h1–h6`) |
| The "partner's voice" — morning check-in, AllClear (never on Home since the 2026-08-20 recompose) | **Fraunces Variable** (serif) | `font-serif` |
| Body, labels, controls | **Geist Variable** | `font-sans` (default) |
| Live tabular numbers / tickers | **Geist Mono Variable** | `font-mono tabular-nums` |

Fonts are self-hosted via Fontsource (imported in `src/main.tsx`) — no external
fetch. Role scale: 11/12/13/14/16/20/28/40/56 — **real tokens since the
2026-08-20 recompose**: `text-micro / label / body / ui / lede / title /
heading / display / hero` in `tailwind.config.js`, each with a tuned line
height. Additive on purpose (they do not override `text-sm` etc.).
**The whole of `src/` is ON the scale since the 2026-08-21 sweep**: all
2,154 bracket-literal px sizes (28 distinct values) were mapped onto the
nine tokens, and every uppercase label's tracking normalized to the eyebrow
recipe's `0.14em`. `scripts/check-type-tokens.mts` runs in CI and fails any
new `text-[Npx]` or off-recipe uppercase tracking, so the sweep stays swept.

## Iconography

One source, one weight, one rhythm — the icon counterpart of the type sweep.

- **Every icon ships through `src/lib/icons.tsx`** — lucide glyphs wrapped
  once with `absoluteStrokeWidth` and the house stroke (`ICON_STROKE = 1.75`),
  so a 12px glyph and a 24px glyph carry the same physical line weight,
  matched to Geist and the DrawnCheck mark. Direct `lucide-react` imports are
  a CI failure (`scripts/check-icons.mts`).
- **Sizes snap to the icon scale** 12 / 14 / 16 / 20 / 24 / 32 inside the
  wrapper (larger passes through), so call sites can stay approximate while
  the render lands on one rhythm.
- **Active chrome steps up in weight, not just colour:** the bottom nav and
  sidebar pass `strokeWidth={2.25}` on the active tab (still absolute), on
  top of the existing violet halo. Those two files, the FAB's 2.25, and the
  sub-12px filled-checkbox Check marks (2.5) are the only sanctioned inline
  stroke widths.
- **The circled icon is one primitive:** `<IconTile>`
  (`components/shared/IconTile.tsx`), sizes sm/md/lg, tones neutral/accent.
  Never hand-roll another ring-around-an-icon.
- **No text glyphs as chrome.** 🎙 💭 ‹ › and their relatives render
  differently on every platform and read as assembled; the guard fails them.
  The one sanctioned character mark is the middle dot as a separator.
- **Identity marks are not icons:** `Logomark`, `AgentAvatar`, `DrawnCheck`
  and the hand-drawn sparklines stay bespoke.

**The eyebrow is one primitive.** `<Eyebrow>` (`components/shared/Eyebrow.tsx`)
is THE small-caps section label: `font-display text-micro font-semibold
uppercase tracking-[0.14em]`. Six ad-hoc recipes used to coexist on Home
alone (tracking 0.1–0.2em, three weights) — that inconsistency is what made
the old page read as mixed type. Never hand-roll a new one.

---

## The write side — how anything gets typed on a phone

Locked 2026-08-22, after the goal-edit row rendered Save off the right edge
of a phone, under a keyboard the app could not see. Three rules, one system
each:

1. **A phone never edits inside a dense layout.** Any "edit this text" tap on
   a narrow viewport opens `shared/FocusedEditor`: a bottom sheet showing the
   text large and whole (`VoiceField` — voice sits beside the keyboard as an
   equal), ONE full-width Save, the sheet's own dismissal as Cancel, and any
   destructive action hidden behind "…" with a second arming tap before it
   runs. Desktop keeps inline editing; same action, different mechanics.
2. **The app knows the keyboard exists.** `hooks/useKeyboardInset.ts` reads
   `visualViewport`; `ui/dialog.tsx` applies the inset as bottom padding on
   every `bottom` / `responsive` DialogContent, so every sheet in the app
   keeps its primary action above the keyboard with zero per-surface code.
   Anything consuming the raw hook divides by `var(--z, 1)` — the inset is
   physical pixels, layout units inside the mobile wrapper are zoomed.
3. **Small sets are chips, never dropdowns.** A native `<select>` hides its
   options and truncates the most important one at the exact moment of
   choosing. Up to roughly seven options: `OptionChips` (the house
   replacement for a small-set select) or the purpose-built `ServesPicker`
   (parent OS goal as full-width readable rows) and `VentureChips`, all in
   `components/goals/GoalPickers.tsx`. Sets that outgrow a line:
   `shared/ChipOverflow` (+N into a sheet). Long dynamic chip labels get
   `text-left` + `truncate`: a chip never wraps to a second line and never
   centres its text.

## Create — the one + button

On a phone there is ONE way to make something new: the violet + button,
bottom-right on every tab (`components/CreateSheet.tsx`). It opens a bottom
sheet listing the current tab's create actions first, then the two global
captures (task, idea). Actions owned by a tab's own components are reached
over the `src/lib/quickCreate.ts` bus (`requestCreate(kind)` fires the
matching `useQuickCreateListener(kind, fn)`); self-contained flows (research,
add a person, the captures) mount their modal from the sheet itself. Adding a
create action is one entry in `tabActions` plus one listener — never a new
inline create button on a narrow viewport. Desktop keeps its inline entry
points; the FAB is mobile-only and hides while a full-screen overlay owns the
screen.

## The copy register

Swept 2026-08-21 (Krish: plain English, understandable by a 12-year-old).
Every string the product renders:

- Plain English in complete sentences. No stacked two-word fragments, no
  insider metaphors, no button label a first-time reader cannot act on.
- Never presumptuous, preachy, or bossy; no meta-lines about the app itself.
- No em dashes anywhere in product copy (`sanitizeVoice()` enforces this on
  generated text); the ellipsis is the single character `…`.
- Product nouns are kept, not diluted: shifts, ventures, ships, the worry
  compiler, Built/Paid, MRR. One vocabulary per concept — never rename a
  canon term on one surface while the others keep it.
- Loading strings live only in `src/lib/loadingVoice.ts` (see the ladder
  below); the pilot surfaces additionally hold the stricter pilot register
  (direct, calm, zero reassurance — `docs/PILOT-LAYER.md`).

---

## Presence — ambient field, mood, haptics

- **AmbientField** (`components/shared/AmbientField.tsx`) paints a fixed aurora
  field + fine grain *behind* content (grain also kills gradient banding). Both
  disappear when ambient is off and go static under reduced-motion.
- **Mood** reacts to real OS state without new realtime channels: components
  register via `useMoodSource(id, mood, priority)` — `CriticalAlertBanner` cools
  the field to *tense* (priority 10), a growing MRR warms it (priority 3),
  *calm* otherwise. Highest priority wins; auto-clears on unmount.
- **Haptics** (`hooks/useHaptics.ts`, iOS `UIFeedbackGenerator` vocabulary) are
  wired at gesture moments: the swipe deck (`useCardDeck`) fires an `impactLight`
  tick as a swipe arms and an `impactMedium` on commit; `usePressable` fires on
  touch-down. Silent no-ops on desktop / iOS Safari.

---

## Shared primitives (change here, cascade everywhere)

`components/shared/`: `Pressable` (aurora primary via `.aurora-btn`),
`DoThisNextHero`, `AllClear` (serif), `StatusPill`, `PodChip`, `SwipeCard` /
`SwipeDeck` / `SwipeCockpit`, `Skeleton`, `Toast`, `Modal`, `SlideOver`,
`Eyebrow`, `IconTile`, `FocusedEditor`, `ChipOverflow`, `SegmentedNav`,
`Working`, `AmbientField`, `ThemeToggle`. `components/mobile/`:
`primitives.tsx` (`HeroCard`, `StatPill`, `FeedCard`, `FeedRow`, `TabHeader`,
`MobileShell`) and `BottomSheet`. Choice chips:
`components/goals/GoalPickers.tsx` (`OptionChips` / `ServesPicker` /
`VentureChips`). Chrome: `DesktopSidebar`, `BottomNav`, `CommandPalette`,
`CreateSheet` (the mobile + button) and Home's `FocusDoor`.

**Do not** hand-roll a card, button, pill, or hero — extend the primitive so
both device classes and both themes stay coherent.

---

## Where the system lives

| Concern | File |
|---|---|
| Theme state + persistence | `src/lib/theme.ts` |
| CSS tokens, themes, material, motion, keyframes | `src/index.css` |
| Tailwind semantic tokens + `white` remap + fonts | `tailwind.config.js` |
| Pre-hydration theme init + splash | `index.html` |
| Fonts | `src/main.tsx` |
| Device intent + reduced motion | `src/components/shared/motion.ts` |
| Pod / status colour maps | `src/components/shared/tokens.ts` |

---

## Loading — the ladder

Every wait in the app maps to exactly one rung. The rung is chosen by **real
measured latency**, not by how important the operation feels. This is the rule
that makes each state fit for purpose, and it is also the rule that stops the
work being overdone.

| Rung | Real latency | Treatment | Primitive |
|---|---|---|---|
| **0 · Instant** | under 200ms | **Nothing.** No spinner, no skeleton, no dim. | `useDeferredPending` returns false |
| **1 · Settle** | 200ms to 2s | Content-shaped skeleton in the exact geometry of what is arriving. No words. | `Skeleton` / `SkeletonList` / `BoardSkeleton` / `MobileTabSkeleton` / `SkeletonDetail` / `HomeSkeleton` |
| **2 · Narrate** | 2s to 10s | Skeleton or inline row plus one present-continuous label. Elapsed appears at 3s. | `Pending`, `Loadable`, `Working` |
| **3 · Accompany** | over 10s | Owns the surface. Staged narration, elapsed clock, stated expectation, an exit. | `ProcessingOverlay` |

Two orthogonal modes, neither of which is a rung:

- **Refresh** (data already on screen). Never blank, never skeleton, never dim.
  The control that was pressed acknowledges itself with `Working`; an automatic
  poll says so through `LastUpdated` / `RefreshRail`. Content stays interactive.
- **Optimistic** (writes). No loading state at all. The row changes now and
  reverts with an Undo toast on failure. See `useSwipeTriage`, `useContentTriage`,
  `useGrowth`.

### The restraint rules

As load-bearing as the ladder itself.

1. **No loading affordance under 200ms.** A skeleton painted for 60ms is a
   flicker, and a flicker reads as a rendering bug. Wrap the flag in
   `useDeferredPending`.
2. **Reserve space from frame 0, shimmer later.** `<Skeleton quiet={!waiting} />`
   holds the box with no fill. Layout shift and flash are both avoidable; you
   do not have to pick one.
3. **One loading affordance per surface region.** If the panel shows a
   skeleton, its buttons do not also spin.
4. **No full-screen overlay under about 1.5s.**
5. **No percentage that cannot be honestly computed.** Indeterminate, or
   nothing. `.animate-indeterminate` is the house rail.
6. **A refresh of visible data never gets a skeleton and never dims.**
7. **Never animate two things at once in one viewport region.**
8. **Empty state never renders while a load is in flight.** `Loadable` enforces
   it. "Nothing here needs you" during a fetch is a false statement that
   happens to be replaced later.
9. **Return null only when the component is genuinely often absent.** If it
   almost always resolves to content, reserve its space. `BetsStrip` is the
   correct null (no live bets is common); `ShipLedgerCard` is not (it always
   resolves), and reserves.

### Copy

All of it lives in [`src/lib/loadingVoice.ts`](../src/lib/loadingVoice.ts), one
entry per operation. Do not type a loading string into a component.

- Present continuous, naming the work: `Rewriting the draft`, never `Working`
  or `Loading`.
- The ellipsis character `…`. Never `...`, never a bare `…` as the whole label.
- Sentence case.
- Model-backed waits name the agent. The map stores a **slug**, and the display
  name is resolved live from the roster, because agents get renamed and retired
  and a wait that confidently names a retired agent is worse than one that says
  nothing. Plain reads stay neutral.
- No em dashes (see `krish-voice`).

### Where the system lives

| Concern | File |
|---|---|
| The anti-flash gate | `src/components/shared/useDeferredPending.ts` |
| The one small busy mark | `src/components/shared/Working.tsx` |
| Named waits + elapsed + block variant | `src/components/shared/Pending.tsx` |
| The blocking "thinking" overlay | `src/components/shared/ProcessingOverlay.tsx` |
| Skeleton family | `src/components/shared/Skeleton.tsx` |
| Background-refresh hairline | `src/components/shared/RefreshRail.tsx` |
| Elapsed / stage / stage-walk | `src/hooks/useAsyncAction.ts` |
| Every loading string | `src/lib/loadingVoice.ts` |
| Streaming client (SSE, JSON fallback) | `src/lib/streamText.ts` |
| Streaming server helper | `api/_stream.ts` |
| Sweep, rail, orbit, dials, reduced motion | `src/index.css` |

Timing comes from the `--dur-*` block in `index.css`: `--dur-skeleton`,
`--dur-indeterminate`, `--dur-orbit`, `--dur-breathe`. They calm under
`data-capacity='low'` with the rest of the app, and everything here is inside
the `prefers-reduced-motion` block.

**Never reach for `animate-spin`.** It runs on a clock no dial can reach and it
is suppressed under reduced motion. Use `Working`.

### Boot

`index.html`'s splash holds until `PilotGate` stamps `data-app-ready` on
`<html>`, which is the moment the gate or the dashboard first paints. It used to
hide on React's first commit, which `ToastProvider` satisfies with an empty
toast container while the pilot read was still in flight, so a cold load went
splash, blank, pop. If you move that gate, move the attribute with it. The 6s
safety net in `index.html` is what makes holding the splash safe.

---

## The primitive layer (`src/components/ui/`)

Vendored from Relume, re-skinned to Obsidian Aurora, and owned here. Relume's
Tailwind preset, icon set and animation library are deliberately NOT installed:
the preset ships a rival token system, and this config remaps `white` to the
`--fg` channel, which is what makes the thousands of existing `text-white/NN`
utilities theme-adaptive.

`ui/` sits BENEATH `shared/`. `Pressable`, `HeroCard`, `SwipeCard` and
`DoThisNextHero` keep their public API and are implemented on top of it, so both
device classes and both themes stay coherent from one place.

Three rules that are easy to get wrong, each of which has already been got
wrong once here:

1. **Accent foregrounds use shade 200, never 300.** Only 50/100/200 of the
   accent ramps map to the `--ac-*` channels that flip between themes. 300 and
   up are fixed hexes tuned for the dark surface, so a 300 foreground looks
   correct at night and washes out to illegible on paper.
2. **Never hand-roll an overlay.** `shared/Modal` for a modal, `SlideOver` for a
   right panel, `BottomSheet` for a sheet, `FocusedEditor` for editing text on
   a phone. A bare `fixed inset-0` has no dialog role, no focus trap, no
   scroll lock and no focus restoration. Fourteen surfaces had that problem.
   The hand-rolled `fixed inset-0`s that remain are deliberate non-modals
   (DesktopToday's and CreativeBoard's click-away scrims) or full-screen
   takeovers carrying their own dialog role (the Focus ritual, the composer
   shells), plus a few legacy dialogs that predate the primitive
   (DesktopContent's schedule and sweep, `IdeaCaptureModal`): migrate those
   when you touch them; never copy them.
3. **Never hand-roll a tab switcher.** `shared/SegmentedNav` gives roving focus,
   arrow keys, Home/End and a `testIdPrefix` for the e2e suite.
