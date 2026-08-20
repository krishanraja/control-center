// Simplified IA (12 tabs -> 6), committed 2026-08-20 with the Home recompose.
//
// This was a build-time flag (VITE_IA_V3_ENABLED) while the IA was dogfooded.
// It is now structural: the ruling queue's only host is the OS tab's Queue
// subtab, and the flag-off branch still routed rulings to the deleted Today
// tab — so a flag-off build would have had no decisions surface at all. The
// function stays so its 20+ call sites read as intent, but the answer is
// committed, not configured.
export function isSimplifiedIA(): boolean {
  return true
}
