import React from 'react'
import { Working } from './Working'
import { SHOW_ELAPSED_AFTER_MS } from '../../hooks/useAsyncAction'

// The one way this app says "working".
//
// Paired with useAsyncAction. Three rules it exists to enforce:
//
//   1. Say what is happening, not just THAT something is. "Working..." tells
//      you nothing you could not see from the disabled button. The wording
//      itself lives in src/lib/loadingVoice.ts so it is written once.
//
//   2. Past a few seconds, show how long. An operation that admits it has been
//      running for 24 seconds reads as slow. The identical operation with a
//      bare spinner reads as broken, and gets reloaded.
//
//   3. Past the point where it is normally done, say THAT, in words. A clock
//      climbing past a number the user has no reference for is just anxiety
//      with a decimal place. "Longer than usual" is the honest read, and it is
//      the difference between waiting and giving up.

function seconds(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export interface PendingProps {
  /** Present continuous, naming the actual work: "Revising", "Scoring". */
  label: string
  /** From useAsyncAction. Elapsed appears once it passes the threshold. */
  elapsedMs?: number
  /** What is taking the time, when the operation has stages worth naming. */
  stage?: string | null
  /** Roughly how long this normally takes. Past it, the wait says so. */
  expectedMs?: number
  /**
   * `inline` sits in a row of text or beside a control.
   * `block` owns an empty panel, matching the geometry of EmptyState,
   * AllClear and the ErrorBoundary so the four states are one family.
   */
  variant?: 'inline' | 'block'
  className?: string
}

export function Pending({
  label,
  elapsedMs = 0,
  stage,
  expectedMs,
  variant = 'inline',
  className = '',
}: PendingProps) {
  const showElapsed = elapsedMs >= SHOW_ELAPSED_AFTER_MS
  // Only once it is meaningfully past, not the instant it ticks over, so a
  // normal-but-slightly-slow run does not get flagged as abnormal.
  const overdue = Boolean(expectedMs && elapsedMs > expectedMs * 1.5)

  if (variant === 'block') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 py-16 px-6 text-center animate-rise ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/45">
          <Working size={18} />
        </div>
        <div className="space-y-1">
          <p className="text-body font-semibold text-white/70">
            {stage ? `${label}: ${stage}` : label}
          </p>
          {overdue ? (
            <p className="text-micro text-white/35">
              Longer than usual. Still running.
              {showElapsed && <span className="tabular-nums"> {seconds(elapsedMs)}</span>}
            </p>
          ) : showElapsed ? (
            <p className="text-micro text-white/30 tabular-nums">{seconds(elapsedMs)}</p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-label text-white/55 ${className}`}
      // Announced politely so the wait is legible to a screen reader too,
      // rather than being a purely visual spinner.
      role="status"
      aria-live="polite"
    >
      <Working size={13} />
      <span>{stage ? `${label}: ${stage}` : label}</span>
      {overdue && <span className="text-white/35">longer than usual</span>}
      {showElapsed && <span className="tabular-nums text-white/35">{seconds(elapsedMs)}</span>}
    </span>
  )
}

// The other half of the rule, and the one that actually bit: an empty state may
// never render while a load is in flight. "Nothing here needs you" shown during
// a fetch is not a neutral placeholder, it is a false statement that happens to
// be replaced later.
export interface LoadableProps {
  loading: boolean
  isEmpty: boolean
  /** Shown while loading. Name the thing being loaded. */
  loadingLabel: string
  /** Shown only once loading has finished AND there is genuinely nothing. */
  empty: React.ReactNode
  children: React.ReactNode
}

export function Loadable({ loading, isEmpty, loadingLabel, empty, children }: LoadableProps) {
  if (loading) return <Pending variant="block" label={loadingLabel} />
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}
