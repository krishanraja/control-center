/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Mindmake structure. Archivo owns headings, navigation and controls.
        display: [
          'Archivo Variable',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        // Newsreader is reserved for the claim or earned payoff.
        serif: [
          'Newsreader Variable',
          'ui-serif',
          'Georgia',
          'Cambria',
          'serif',
        ],
        sans: [
          'Archivo Variable',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
        // Long-form explanations can opt into Mindmake's reading face without
        // turning dense controls into editorial copy.
        body: [
          'Source Serif 4 Variable',
          'ui-serif',
          'Georgia',
          'serif',
        ],
      },
      // ── Role-named type scale (docs/DESIGN_SYSTEM.md) ────────────────────
      // The doc's 11/12/13/14/16/20/28/40/56 scale, made real as ADDITIVE
      // tokens. Deliberately not an override of text-sm/text-base: redefining
      // Tailwind's defaults would reflow ~180 files at once. New and rebuilt
      // surfaces adopt these; the bracket-literal sizes retire as surfaces are
      // touched.
      fontSize: {
        micro:   ['11px', { lineHeight: '15px' }],
        label:   ['12px', { lineHeight: '17px' }],
        body:    ['13px', { lineHeight: '19px' }],
        ui:      ['14px', { lineHeight: '20px' }],
        lede:    ['16px', { lineHeight: '23px' }],
        title:   ['20px', { lineHeight: '26px' }],
        heading: ['28px', { lineHeight: '34px' }],
        display: ['40px', { lineHeight: '44px' }],
        hero:    ['56px', { lineHeight: '58px' }],
      },
      // Existing surfaces intentionally use 8%, 12% and 92% alpha stops. They
      // are not in Tailwind's stock opacity scale; without these entries the
      // classes compile to nothing and the UI silently loses borders, tints or
      // text contrast. Keep uncommon one-off values in bracket syntax.
      opacity: {
        8: '0.08',
        12: '0.12',
        92: '0.92',
      },
      colors: {
        // ── Mindmake instrument-room foundation ───────────────────────────
        // Channel-format CSS vars (defined in index.css :root) so opacity
        // modifiers work (text-ink/70, bg-accent/15) AND a future light theme
        // is a single :root[data-theme] block away.
        // Remap `white` to the foreground channel: white overlays at night,
        // ink on paper by day. This is what makes the thousands of existing
        // `text-white/60`, `bg-white/[0.05]`, `border-white/10` utilities
        // theme-adaptive without touching a single component. (Pure white where
        // it must stay white — text on a filled accent — uses `text-[#fff]`.)
        white: 'rgb(var(--fg) / <alpha-value>)',
        base: 'rgb(var(--bg-base) / <alpha-value>)',
        sunk: 'rgb(var(--bg-sunk) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          2: 'rgb(var(--accent-2) / <alpha-value>)',
          3: 'rgb(var(--accent-3) / <alpha-value>)',
        },

        // ── Legacy semantic tokens (refined hue, same names) ───────────────
        // Channel-format, like `white`/`base`/`ink` above, so `/NN` opacity
        // modifiers keep working AND the surfaces flip with the theme.
        //
        // These were fixed hex until 2026-08-30, which made every
        // `bg-command-surface` a permanently dark panel. Paired with the
        // adaptive `text-white/90` that sits on them, light mode rendered dark
        // ink on a dark surface: the Home door pills (Focus / Signals / Intel)
        // and the critical alert banner were both unreadable in daylight.
        // The semantic colours below (success/warning/error/info) stay fixed:
        // they are meaning, not surface, and read on either ground.
        command: {
          bg: 'rgb(var(--cmd-bg) / <alpha-value>)',
          surface: 'rgb(var(--cmd-surface) / <alpha-value>)',
          card: 'rgb(var(--cmd-card) / <alpha-value>)',
          border: 'rgb(var(--cmd-border) / <alpha-value>)',
          text: 'rgb(var(--cmd-text) / <alpha-value>)',
          success: '#4d9e78',
          warning: '#b98f4a',
          error:   '#bd6f6f',
          info:    '#5a93a2',
        },
        // Muted, low-chroma — colour reserved for meaning, kept off-neon.
        pod: {
          ops:     '#6ba6b5', // muted teal    (was neon cyan   #22d3ee)
          revenue: '#6cab8b', // muted sage    (was neon green  #34d399)
          growth:  '#8f88bd', // muted lavender (was neon violet #a78bfa)
        },
        status: {
          needsYou: '#cba35c', // muted ochre (was neon amber #fbbf24)
          blocked:  '#c98585', // muted clay  (was neon rose  #fb7185)
          active:   '#6cab8b', // muted sage
          waiting:  '#8a94a3', // slate
          done:     '#6b7280', // grey
        },

        // ── Brand accent cascade ───────────────────────────────────────────
        // Redefine the legacy `violet` ramp to Mindmake mint so existing
        // violet-300/400/500 usages everywhere shift to the new answer accent
        // at once, cohesively, with zero per-file edits.
        // Brand accent ramp — 300–950 are the aurora fills/dots (fixed hex);
        // 50/100/200 are theme-adaptive accent TEXT (see --ac-* in index.css).
        violet: {
          50:  'rgb(var(--ac-violet) / <alpha-value>)',
          100: 'rgb(var(--ac-violet) / <alpha-value>)',
          200: 'rgb(var(--ac-violet) / <alpha-value>)',
          // Mindmake mint ramp. The name remains as a compatibility alias only.
          300: 'rgb(var(--s300-violet) / <alpha-value>)',
          400: 'rgb(var(--s400-violet) / <alpha-value>)',
          500: '#63cf9e',
          600: '#4faf85',
          700: '#3e8e68',
          800: '#2f6f51',
          900: '#204c39',
          950: '#12291f',
        },
        // Semantic accent text shades — 50/100/200 flip light↔deep by theme so
        // accent labels on tinted cards stay readable. 300+ keep Tailwind defaults.
        // 50–200 are theme-adaptive accent TEXT (--ac-*); 300–600 are muted, off-neon
        // ramps so raw `*-400` fills/dots/borders stop using Tailwind's neon defaults.
        amber:   { 50: 'rgb(var(--ac-amber) / <alpha-value>)',   100: 'rgb(var(--ac-amber) / <alpha-value>)',   200: 'rgb(var(--ac-amber) / <alpha-value>)',   300: 'rgb(var(--s300-amber) / <alpha-value>)', 400: '#cba35c', 500: '#b98f4a', 600: '#a07a3d' },
        emerald: { 50: 'rgb(var(--ac-emerald) / <alpha-value>)', 100: 'rgb(var(--ac-emerald) / <alpha-value>)', 200: 'rgb(var(--ac-emerald) / <alpha-value>)', 300: 'rgb(var(--s300-emerald) / <alpha-value>)', 400: '#6cab8b', 500: '#5b9578', 600: '#4d7f66' },
        rose:    { 50: 'rgb(var(--ac-rose) / <alpha-value>)',    100: 'rgb(var(--ac-rose) / <alpha-value>)',    200: 'rgb(var(--ac-rose) / <alpha-value>)',    300: 'rgb(var(--s300-rose) / <alpha-value>)', 400: '#c98585', 500: '#b96c6c', 600: '#a15a5a' },
        red:     { 300: 'rgb(var(--s300-red) / <alpha-value>)', 400: '#c98585', 500: '#bd6f6f', 600: '#a75c5c' },
        sky:     { 50: 'rgb(var(--ac-sky) / <alpha-value>)',     100: 'rgb(var(--ac-sky) / <alpha-value>)',     200: 'rgb(var(--ac-sky) / <alpha-value>)',     300: 'rgb(var(--s300-sky) / <alpha-value>)', 400: '#6ba6b5', 500: '#5a93a2', 600: '#4c7d8a' },
        cyan:    { 50: 'rgb(var(--ac-cyan) / <alpha-value>)',    100: 'rgb(var(--ac-cyan) / <alpha-value>)',    200: 'rgb(var(--ac-cyan) / <alpha-value>)',    300: 'rgb(var(--s300-cyan) / <alpha-value>)', 400: '#6ba6b5', 500: '#5a93a2', 600: '#4c7d8a' },
        indigo:  { 50: 'rgb(var(--ac-indigo) / <alpha-value>)',  100: 'rgb(var(--ac-indigo) / <alpha-value>)',  200: 'rgb(var(--ac-indigo) / <alpha-value>)' },
        // Secondary accent hues used only as text (fuchsia HUMOR chips, blue LENGTH,
        // etc.) — text-only, so 100/200/300 all flip light↔deep by theme.
        fuchsia: { 100: 'rgb(var(--ac-fuchsia) / <alpha-value>)', 200: 'rgb(var(--ac-fuchsia) / <alpha-value>)', 300: 'rgb(var(--ac-fuchsia) / <alpha-value>)' },
        purple:  { 100: 'rgb(var(--ac-purple) / <alpha-value>)',  200: 'rgb(var(--ac-purple) / <alpha-value>)',  300: 'rgb(var(--ac-purple) / <alpha-value>)' },
        teal:    { 100: 'rgb(var(--ac-teal) / <alpha-value>)',    200: 'rgb(var(--ac-teal) / <alpha-value>)',    300: 'rgb(var(--ac-teal) / <alpha-value>)' },
        orange:  { 100: 'rgb(var(--ac-orange) / <alpha-value>)',  200: 'rgb(var(--ac-orange) / <alpha-value>)',  300: 'rgb(var(--ac-orange) / <alpha-value>)' },
        blue:    { 100: 'rgb(var(--ac-blue) / <alpha-value>)',    200: 'rgb(var(--ac-blue) / <alpha-value>)',    300: 'rgb(var(--ac-blue) / <alpha-value>)' },
        green:   { 100: 'rgb(var(--ac-green) / <alpha-value>)',   200: 'rgb(var(--ac-green) / <alpha-value>)',   300: 'rgb(var(--ac-green) / <alpha-value>)' },
        pink:    { 100: 'rgb(var(--ac-pink) / <alpha-value>)',    200: 'rgb(var(--ac-pink) / <alpha-value>)',    300: 'rgb(var(--ac-pink) / <alpha-value>)' },

        // ── Relume bridge ──────────────────────────────────────────────────
        // Vendored Relume primitives (src/components/ui/*) reference a
        // `scheme-*` semantic layer. Rather than install their Tailwind preset
        // — which replaces theme.gradientColorStops and ships a second, rival
        // token system — point those names at the Obsidian Aurora channels.
        // Vendored files then compile unmodified and inherit light/dark for
        // free, exactly like every hand-written surface in the app.
        scheme: {
          background: 'rgb(var(--bg-base) / <alpha-value>)',
          foreground: 'rgb(var(--card-bg) / <alpha-value>)',
          text: 'rgb(var(--ink) / <alpha-value>)',
          border: 'rgb(var(--fg) / 0.10)',
          'btn-text': 'rgb(var(--bg-base) / <alpha-value>)',
        },
      },
      // Calm & Anticipatory — depth tokens, now Obsidian Aurora. Glass reads as
      // layered, lit surfaces; the focus halo is the aurora accent.
      boxShadow: {
        glass:    '0 1px 0 0 rgba(230,237,232,0.04) inset, 0 8px 30px -12px rgba(0,0,0,0.7)',
        'glass-lg': '0 1px 0 0 rgba(230,237,232,0.05) inset, 0 24px 70px -24px rgba(0,0,0,0.82)',
        halo:     '0 0 0 1px rgba(127,227,180,0.24), 0 14px 60px -16px rgba(79,175,133,0.32)',
        // Elevation ladder — warm-black ambient + a lit top edge.
        e1: '0 1px 2px 0 rgba(0,0,0,0.40), 0 8px 24px -12px rgba(0,0,0,0.70), inset 0 1px 0 0 rgba(255,255,255,0.05)',
        e2: '0 2px 4px 0 rgba(0,0,0,0.45), 0 16px 48px -16px rgba(0,0,0,0.75), inset 0 1px 0 0 rgba(255,255,255,0.06)',
        e3: '0 4px 8px 0 rgba(0,0,0,0.50), 0 32px 80px -24px rgba(0,0,0,0.85), inset 0 1px 0 0 rgba(255,255,255,0.07)',
      },
      // Relume's radius tokens. Its own defaults are 0rem (sharp corners);
      // Obsidian Aurora is soft, so these match the house language already in
      // use (rounded-2xl pressables, rounded-xl inputs, pill badges).
      borderRadius: {
        button: '0.75rem',
        card: '1rem',
        image: '0.75rem',
        form: '0.625rem',
        badge: '9999px',
        checkbox: '0.375rem',
        carousel: '1rem',
        dropdown: '0.75rem',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
        // Tactile overshoot — press, commit, sheet settle.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
