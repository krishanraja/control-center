import React from 'react'

/**
 * Working — the one small "this control is busy" mark, and the single
 * replacement for `<Loader2 className="animate-spin" />`.
 *
 * The stock spinner was wrong here in three ways that all compound:
 *
 *  • It runs on Tailwind's fixed 1s linear clock, so it ignored --dur-orbit and
 *    every other dial in index.css. Tuning the app's feel could not reach it.
 *  • It was absent from the reduced-motion block, so 74 of them kept turning
 *    for someone who had asked the OS to stop motion.
 *  • A constant-velocity full circle is a mechanical gesture. Everything else
 *    that says "the system is working" in this product orbits: the splash
 *    particle, ProcessingOverlay's ThinkingOrbit. A button should be the same
 *    idea at a smaller scale, not a different one.
 *
 * So: a track ring plus a travelling arc, on --dur-orbit, in currentColor, at
 * the 1.5px stroke the global Lucide override already forces on every icon.
 * Under reduced motion the arc simply holds still, which still reads as
 * "engaged, not finished" rather than disappearing.
 *
 * Decorative by default. The label belongs to <Pending>, which announces the
 * wait politely; a bare mark inside a button is covered by that button's own
 * aria-busy.
 */
export function Working({
  size = 13,
  className = '',
}: { size?: number; className?: string }) {
  // r is set so the stroke sits inside the box at any size; the dash pattern is
  // a quarter of the circumference, which is the smallest arc that still reads
  // as an arc rather than a dot at 9px.
  const r = 7
  const circumference = 2 * Math.PI * r
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="9" r={r} opacity="0.2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        strokeDasharray={`${circumference * 0.26} ${circumference}`}
        className="animate-working"
        style={{ transformOrigin: '50% 50%' }}
      />
    </svg>
  )
}
