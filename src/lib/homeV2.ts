// Gates the action-inbox Home recompose (GlanceHeader + DecisionsInbox +
// collapsed objectives + PulseGroup). Build-time Vite var, default OFF so the
// current Home stays the fallback until dogfooded. Flip in Vercel
// (VITE_HOME_V2_ENABLED=true) + redeploy to roll out. Mirrors the
// VITE_FOCUS_MODE_ENABLED pattern in useFocusMode.ts.
export function isHomeV2Enabled(): boolean {
  return import.meta.env.VITE_HOME_V2_ENABLED === 'true'
}

// Gates the unified Focus Ritual: one guided stepper across all three altitudes
// (portfolio / weekly / daily) driven by staleness, an altitude spine in the
// header, and the decision panels demoted to a read-only board. Supersedes the
// HomeV2 recompose + the standalone WeeklyFocusTakeover when on. Build-time Vite
// var, default OFF until dogfooded. Flip VITE_FOCUS_RITUAL_ENABLED=true + redeploy.
export function isFocusRitualEnabled(): boolean {
  return import.meta.env.VITE_FOCUS_RITUAL_ENABLED === 'true'
}
