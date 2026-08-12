import React from 'react'
import { Loader2 } from 'lucide-react'
import { SHOW_ELAPSED_AFTER_MS } from '../../hooks/useAsyncAction'

// The one way this app says "working".
//
// Paired with useAsyncAction. Two rules it exists to enforce:
//
//   1. Say what is happening, not just THAT something is. "Working..." tells
//      you nothing you could not see from the disabled button.
//   2. Past a few seconds, show how long. An operation that admits it has been
//      running for 24 seconds reads as slow. The identical operation with a
//      bare spinner reads as broken, and gets reloaded.

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
  className?: string
}

export function Pending({ label, elapsedMs = 0, stage, className = '' }: PendingProps) {
  const show = elapsedMs >= SHOW_ELAPSED_AFTER_MS
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] text-white/55 ${className}`}
      // Announced politely so the wait is legible to a screen reader too,
      // rather than being a purely visual spinner.
      role="status"
      aria-live="polite"
    >
      <Loader2 size={13} className="animate-spin flex-shrink-0" aria-hidden="true" />
      <span>{stage ? `${label}: ${stage}` : label}</span>
      {show && <span className="tabular-nums text-white/35">{seconds(elapsedMs)}</span>}
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
  if (loading) {
    return (
      <div className="py-10 text-center">
        <Pending label={loadingLabel} />
      </div>
    )
  }
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}
