# ADR-007: Obsidian Aurora design system + adaptive light/dark theming

- Status: Accepted
- Date: 2026-07-01
- Deciders: Krish

## Context

The dashboard's original skin (near-black `#0a0a0b`, flat 3%-white glass, a
single violet accent, Geist everywhere) was competent but read as generic
premium dark-SaaS. The interaction foundation was already strong (haptics,
swipe-triage, device-intent detection, a universal "do this next" hero, the
"Calm & Anticipatory" motion language) — the gap was **identity**, not
capability. The brief: a 2027-grade, beautiful, haptic "thought partner" that
respects mobile (triage / one hand) vs desktop (keyboard deep work), always
surfaces the next action, and loses no functionality. A follow-up requirement:
an **adaptive light/dark** theme switchable at will, with the experimental
ambient layer toggleable off.

## Decision

Adopt **"Obsidian Aurora"** — a token-first evolution of the dark cockpit with a
violet→indigo→cyan aurora accent — and make it **adaptive light/dark**. The
whole system is CSS variables mapped into Tailwind semantic tokens, so the
identity changes from one source of truth and a light theme is a `:root[data-
theme]` override. The single highest-leverage move: **remap Tailwind's `white`
to a `--fg` theme variable**, which makes the app's thousands of `*-white/NN`
utilities theme-adaptive with no per-file churn. Typography adds a display face
(Bricolage Grotesque) and a serif "voice" (Fraunces) over Geist body / Geist
Mono numbers. An `AmbientField` presence layer + mood reactivity + richer swipe
haptics deliver the "magic," all gated by reduced-motion and an ambient
on/off switch. Full details in [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).

## Alternatives considered

- **Keep dark-only, polish tokens.** Rejected — too small for "revolutionize,"
  and the user explicitly wanted adaptive light/dark.
- **Rip out and rebuild the interaction layer.** Rejected — the substrate
  (haptics, swipe, device intent, next-action hero) was already world-class;
  the work was identity, not mechanics.
- **Per-file colour sweep instead of a `white`/token remap.** Rejected — ~179
  files; the token + `--fg` remap achieves an app-wide adaptive shift with a
  fraction of the risk.
- **Sweep every raw literal to tokens in one pass.** Rejected in favour of
  foundation-first: tokens + shared primitives re-skin everything at once;
  residual per-tab literals are cleaned progressively.

## Consequences

- **Positive:** one coherent identity across 11 tabs + two device classes + two
  themes; adaptive by default; the next action is the most alive thing on
  screen; future themes are a token override away.
- **Negative:** contributors must learn the conventions (use tokens, not
  hardcoded hex; `text-[#fff]` for on-accent white; `.btn-contrast` for inverted
  CTAs; `bg-base` for solid theme surfaces). Web haptics are Android-only until
  iOS Safari ships the Vibration API.
- **Neutral:** dark remains the default/flagship; light is a first-class but
  progressively-polished alternative (data-dense contrast tuning continues).

## Follow-ups

- Progressive light-mode contrast polish on data-dense surfaces with real data.
- Optional: a per-object grain pass on focal cards; time-of-day auto-mood.
