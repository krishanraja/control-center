import { useEffect } from 'react'

/**
 * AmbientField — the Obsidian Aurora "presence" layer.
 *
 * Two fixed, pointer-inert layers painted *behind* all content:
 *   • the aurora field — a slow, blurred aurora that reads as the system
 *     thinking *with* you. Its hue drifts with the OS mood via the --mood-*
 *     CSS vars (see setMood). It goes perfectly still under
 *     prefers-reduced-motion (handled in index.css).
 *   • the grain        — a whisper of noise that kills gradient banding, the
 *     tell of a premium dark surface rather than a flat web page.
 *
 * Mount once at the app root. No data dependencies — surfaces that already hold
 * the numbers (Home: MRR / critical alerts) call setMood() to tint the whole
 * app, so we never open a second realtime channel just to feel alive.
 */
export function AmbientField() {
  return (
    <>
      <div className="ambient-field" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
    </>
  )
}

export type Mood = 'calm' | 'warm' | 'tense'

// Channel triples (space-separated RGB) matching the index.css :root defaults.
const MOOD: Record<Mood, [string, string, string]> = {
  calm:  ['139 124 246', '99 102 241', '34 211 238'],  // violet · indigo · cyan — steady state
  warm:  ['52 211 153', '139 124 246', '250 204 21'],  // emerald · violet · gold — the money is up
  tense: ['251 113 133', '99 102 241', '139 124 246'], // rose · indigo · violet — something's on fire
}

/** Shift the ambient mood app-wide. Cheap: sets three CSS vars on <html>. */
export function setMood(mood: Mood) {
  if (typeof document === 'undefined') return
  const [a, b, c] = MOOD[mood]
  const el = document.documentElement
  el.style.setProperty('--mood-1', a)
  el.style.setProperty('--mood-2', b)
  el.style.setProperty('--mood-3', c)
}

// ── Mood priority registry ───────────────────────────────────────────────────
// Several surfaces know something about the OS state (Home's MRR delta, the
// critical-alert banner). Rather than fight over the CSS vars, each registers a
// mood + priority; the highest-priority active source wins. Empty → calm. This
// keeps state-reactivity honest without opening a second realtime channel.
const sources = new Map<string, { mood: Mood; priority: number }>()

function resolveMood() {
  let best: { mood: Mood; priority: number } | null = null
  for (const v of sources.values()) if (!best || v.priority > best.priority) best = v
  setMood(best?.mood ?? 'calm')
}

/** Register (or clear, with mood=null) a mood source. Highest priority wins. */
export function setMoodSource(id: string, mood: Mood | null, priority = 0) {
  if (mood === null) sources.delete(id)
  else sources.set(id, { mood, priority })
  resolveMood()
}

/** Declarative mood source for a component — auto-clears on unmount. */
export function useMoodSource(id: string, mood: Mood | null, priority = 0) {
  useEffect(() => {
    setMoodSource(id, mood, priority)
    return () => setMoodSource(id, null)
  }, [id, mood, priority])
}
