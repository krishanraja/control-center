/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Display — the new voice of the product. A characterful variable
        // grotesque for headlines, hero titles, and section eyebrows. Applied to
        // h1–h6 globally in index.css; falls back to Geist so nothing breaks if
        // the font is slow to arrive.
        display: [
          'Bricolage Grotesque Variable',
          'Geist Variable',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        // Serif — reserved for the "partner's voice": Marcus's brief, the OS
        // mission, the earned "all clear" moment. Warmth, not chrome.
        serif: [
          'Fraunces Variable',
          'ui-serif',
          'Georgia',
          'Cambria',
          'serif',
        ],
        sans: [
          'Geist Variable',
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
          'Geist Mono Variable',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
      colors: {
        // ── Obsidian Aurora foundation ─────────────────────────────────────
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
        // Kept as hex so every existing `/NN` opacity usage across ~179 files
        // keeps working untouched; only the underlying colour warms up.
        command: {
          bg: '#08070d',
          surface: '#14131b',
          card: '#1c1b24',
          border: '#2a2833',
          text: '#eceaf5',
          success: '#34d399',
          warning: '#fbbf24',
          error: '#fb7185',
          info: '#60a5fa',
        },
        pod: {
          ops:     '#22d3ee',
          revenue: '#34d399',
          growth:  '#a78bfa',
        },
        status: {
          needsYou: '#fbbf24',
          blocked:  '#fb7185',
          active:   '#34d399',
          waiting:  '#94a3b8',
          done:     '#6b7280',
        },

        // ── Brand accent cascade ───────────────────────────────────────────
        // Redefine the `violet` ramp to the aurora anchor so the existing
        // violet-300/400/500 usages everywhere shift to the new brand accent
        // at once, cohesively, with zero per-file edits.
        // Brand accent ramp — 300–950 are the aurora fills/dots (fixed hex);
        // 50/100/200 are theme-adaptive accent TEXT (see --ac-* in index.css).
        violet: {
          50:  'rgb(var(--ac-violet) / <alpha-value>)',
          100: 'rgb(var(--ac-violet) / <alpha-value>)',
          200: 'rgb(var(--ac-violet) / <alpha-value>)',
          300: '#b8a8fc',
          400: '#9c86f8',
          500: '#8b7cf6',
          600: '#6f5ae6',
          700: '#5a44c8',
          800: '#48379e',
          900: '#392c7d',
          950: '#241a52',
        },
        // Semantic accent text shades — 50/100/200 flip light↔deep by theme so
        // accent labels on tinted cards stay readable. 300+ keep Tailwind defaults.
        amber:   { 50: 'rgb(var(--ac-amber) / <alpha-value>)',   100: 'rgb(var(--ac-amber) / <alpha-value>)',   200: 'rgb(var(--ac-amber) / <alpha-value>)' },
        emerald: { 50: 'rgb(var(--ac-emerald) / <alpha-value>)', 100: 'rgb(var(--ac-emerald) / <alpha-value>)', 200: 'rgb(var(--ac-emerald) / <alpha-value>)' },
        rose:    { 50: 'rgb(var(--ac-rose) / <alpha-value>)',    100: 'rgb(var(--ac-rose) / <alpha-value>)',    200: 'rgb(var(--ac-rose) / <alpha-value>)' },
        sky:     { 50: 'rgb(var(--ac-sky) / <alpha-value>)',     100: 'rgb(var(--ac-sky) / <alpha-value>)',     200: 'rgb(var(--ac-sky) / <alpha-value>)' },
        cyan:    { 50: 'rgb(var(--ac-cyan) / <alpha-value>)',    100: 'rgb(var(--ac-cyan) / <alpha-value>)',    200: 'rgb(var(--ac-cyan) / <alpha-value>)' },
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
      },
      // Calm & Anticipatory — depth tokens, now Obsidian Aurora. Glass reads as
      // layered, lit surfaces; the focus halo is the aurora accent.
      boxShadow: {
        glass:    '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 30px -12px rgba(0,0,0,0.7)',
        'glass-lg': '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 70px -24px rgba(0,0,0,0.82)',
        halo:     '0 0 0 1px rgba(139,124,246,0.22), 0 14px 60px -16px rgba(139,124,246,0.34), 0 8px 40px -20px rgba(34,211,238,0.18)',
        // Elevation ladder — warm-black ambient + a lit top edge.
        e1: '0 1px 2px 0 rgba(0,0,0,0.40), 0 8px 24px -12px rgba(0,0,0,0.70), inset 0 1px 0 0 rgba(255,255,255,0.05)',
        e2: '0 2px 4px 0 rgba(0,0,0,0.45), 0 16px 48px -16px rgba(0,0,0,0.75), inset 0 1px 0 0 rgba(255,255,255,0.06)',
        e3: '0 4px 8px 0 rgba(0,0,0,0.50), 0 32px 80px -24px rgba(0,0,0,0.85), inset 0 1px 0 0 rgba(255,255,255,0.07)',
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
