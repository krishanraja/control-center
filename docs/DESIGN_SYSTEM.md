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
`255 255 255` in dark and `24 22 32` (ink) in light. **This single lever makes
the thousands of existing `text-white/60`, `bg-white/[0.05]`, `border-white/10`
utilities theme-adaptive with no per-file edits.**

**Contributor rules that follow from this:**
- `text-white/NN`, `bg-white/NN`, `border-white/NN` are theme-adaptive — use
  them freely for foreground text, tints, and hairlines.
- Need text that stays **pure white on a coloured fill** (e.g. on an accent
  button)? Use `text-[#fff]`, not `text-white`.
- Need a high-emphasis **inverted** button (white-on-dark by night,
  ink-on-paper by day)? Use `.btn-contrast`, not `bg-white text-black`.
- A solid opaque surface that should follow the theme? Use `bg-base` / `bg-sunk`
  (never a hardcoded `bg-[#0f0f12]`).

---

## Tokens

All colour truth lives as CSS custom properties in `src/index.css :root` (dark)
and `:root[data-theme='light']` (day), mapped into semantic Tailwind names in
`tailwind.config.js`.

### Colour
| Token | Dark | Light | Tailwind |
|---|---|---|---|
| `--bg-base` | `#08070D` obsidian | `#F2F1F8` lavender paper | `bg-base` |
| `--bg-sunk` | `#060509` | `#F4F2ED` | `bg-sunk` |
| `--ink` / muted / faint | `#ECEAF5` / `#A7A3B8` / `#6E6A80` | `#161620` / `#5C5868` / `#8C8898` | `text-ink` / `text-ink-muted` / `text-ink-faint` |
| `--fg` (white remap) | `255 255 255` | `24 22 32` | `*-white/NN` |
| `--accent` / `-2` / `-3` (aurora) | `#8B7CF6` → `#6366F1` → `#22D3EE` | deepened for paper | `text-accent`, `.aurora-*` |

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
| The "partner's voice" — OS mission, Marcus brief, AllClear | **Fraunces Variable** (serif) | `font-serif` |
| Body, labels, controls | **Geist Variable** | `font-sans` (default) |
| Live tabular numbers / tickers | **Geist Mono Variable** | `font-mono tabular-nums` |

Fonts are self-hosted via Fontsource (imported in `src/main.tsx`) — no external
fetch. Role scale: 11/12/13/14/16/20/28/40/56.

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
`SwipeDeck` / `SwipeCockpit`, `Skeleton`, `Toast`, `SlideOver`, `AmbientField`,
`ThemeToggle`. `components/mobile/primitives.tsx`: `HeroCard`, `StatPill`,
`FeedCard`, `FeedRow`, `TabHeader`, `MobileShell`. Chrome: `DesktopSidebar`,
`BottomNav`, `CommandPalette`.

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
   right panel, `BottomSheet` for a sheet. A bare `fixed inset-0` has no dialog
   role, no focus trap, no scroll lock and no focus restoration. Fourteen
   surfaces had that problem. The two `fixed inset-0` overlays left are a menu
   and a click-away scrim, neither of which is a modal.
3. **Never hand-roll a tab switcher.** `shared/SegmentedNav` gives roving focus,
   arrow keys, Home/End and a `testIdPrefix` for the e2e suite.
