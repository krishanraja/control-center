/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
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
        // Muted accent ramps override Tailwind's neon defaults for the weights the
        // app actually uses. This de-neons every raw `violet-/emerald-/rose-/red-/
        // amber-/sky-*` usage (hundreds of them, the brand violet chief among them)
        // at the source — same class names, calmer result. Hue identity is kept;
        // only the chroma comes down, so the UI reads as a considered instrument.
        violet: {
          200: '#c9c2e3', 300: '#b3aad6', 400: '#9a90c6', 500: '#8477b3', 600: '#6f639c',
        },
        emerald: {
          200: '#a8cfbb', 300: '#8fc3a8', 400: '#6cab8b', 500: '#5b9578', 600: '#4d7f66',
        },
        rose: {
          200: '#dcb6b6', 300: '#d3a3a3', 400: '#c98585', 500: '#b96c6c', 600: '#a15a5a',
        },
        red: {
          300: '#d3a3a3', 400: '#c98585', 500: '#bd6f6f', 600: '#a75c5c',
        },
        amber: {
          200: '#e2cea0', 300: '#dcc08a', 400: '#cba35c', 500: '#b98f4a', 600: '#a07a3d',
        },
        sky: {
          200: '#aecdd7', 300: '#93b8c4', 400: '#6ba6b5', 500: '#5a93a2', 600: '#4c7d8a',
        },
        command: {
          bg: '#0a0a0b',
          surface: '#1a1a1d',
          card: '#2a2a2d',
          border: '#3a3a3d',
          text: '#e5e7eb',
          success: '#4d9e78',
          warning: '#b98f4a',
          error: '#bd6f6f',
          info: '#5a93a2',
        },
        // Muted, low-chroma accents. A serious instrument reserves colour for
        // meaning and keeps it desaturated — these read as "considered", not neon.
        // Same token names, so every tint/border/text usage softens at the source
        // without touching call sites.
        pod: {
          ops:     '#6ba6b5', // muted teal    (was neon cyan   #22d3ee)
          revenue: '#6cab8b', // muted sage    (was neon green  #34d399)
          growth:  '#8f88bd', // muted lavender (was neon violet #a78bfa)
        },
        status: {
          needsYou: '#cba35c', // muted ochre  (was neon amber #fbbf24)
          blocked:  '#c98585', // muted clay   (was neon red   #f87171)
          active:   '#6cab8b', // muted sage
          waiting:  '#8a94a3', // slate
          done:     '#6b7280', // grey
        },
      },
      // Depth tokens. Elevation reads as layered, lit surfaces rather than flat
      // cards — via soft neutral shadow, never a coloured glow.
      boxShadow: {
        glass:    '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 30px -12px rgba(0,0,0,0.6)',
        'glass-lg': '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 70px -24px rgba(0,0,0,0.75)',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
