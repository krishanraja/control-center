/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        command: {
          bg: '#0a0a0b',
          surface: '#1a1a1d',
          card: '#2a2a2d',
          border: '#3a3a3d',
          text: '#e5e7eb',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },
        pod: {
          ops:     '#22d3ee',
          revenue: '#34d399',
          growth:  '#a78bfa',
        },
        status: {
          needsYou: '#fbbf24',
          blocked:  '#f87171',
          active:   '#34d399',
          waiting:  '#94a3b8',
          done:     '#6b7280',
        },
      }
    },
  },
  plugins: [],
}
