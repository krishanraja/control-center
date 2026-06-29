/**
 * Haptic feedback via the Web Vibration API.
 *
 * Note on reach: `navigator.vibrate` is honoured by Android Chrome / Samsung
 * Internet and is a silent no-op on iOS Safari and desktop browsers. We keep the
 * method *names* semantic (modelled on iOS's UIFeedbackGenerator families) so
 * the moment Safari ships the API the whole app lights up for free, and so call
 * sites read as intent ("impactRigid on toggle-on") rather than raw durations.
 *
 * Additive contract: the original six methods (tap/select/success/warning/
 * error/heavy) are consumed in ~70 files and MUST keep their exact patterns.
 * Everything below them is new and optional.
 */
export function useHaptics() {
  const vibe = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  }
  return {
    // ── Original contract (do not change the patterns) ──────────────────────
    tap: () => vibe(8),
    select: () => vibe(12),
    success: () => vibe([10, 40, 20]),
    warning: () => vibe([15, 50, 15]),
    error: () => vibe([30, 60, 30]),
    heavy: () => vibe(25),

    // ── Impact family (UIImpactFeedbackGenerator analogues) ─────────────────
    /** Faint tick — drag thresholds, scrubbing past a notch. */
    impactLight: () => vibe(6),
    /** Confident bump — gesture committed (pull-to-refresh fired). */
    impactMedium: () => vibe(14),
    /** Crisp, hard edge — a toggle snapping ON. */
    impactRigid: () => vibe(18),
    /** Cushioned tick — a toggle releasing OFF, a sheet settling closed. */
    soft: () => vibe(10),

    // ── Notification family (richer than success/error) ─────────────────────
    /** A celebratory double-pulse for terminal/earned moments. */
    notifySuccess: () => vibe([12, 30, 12, 30, 40]),

    // ── The single primitive usePressable taps on touch-down ────────────────
    /** Touch-down feel — fired on pointerdown, before the click resolves. */
    press: () => vibe(8),
  }
}
