// Gates the action-inbox Home recompose (GlanceHeader + DecisionsInbox +
// collapsed objectives + PulseGroup). Build-time Vite var, default OFF so the
// current Home stays the fallback until dogfooded. Flip in Vercel
// (VITE_HOME_V2_ENABLED=true) + redeploy to roll out. Mirrors the
// VITE_FOCUS_MODE_ENABLED pattern in useFocusMode.ts.
export function isHomeV2Enabled(): boolean {
  return import.meta.env.VITE_HOME_V2_ENABLED === 'true'
}
