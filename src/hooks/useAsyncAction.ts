import { useCallback, useEffect, useRef, useState } from 'react'

// One vocabulary for "something is happening".
//
// The Content tab's long operations (revise, challenge, score, dive-deeper,
// transform, brief assembly, commission) run for 30 to 60 seconds against a
// model. Every one of them already had a busy flag, so a spinner appeared. What
// none of them had was DURATION, and a spinner with no duration is
// indistinguishable from a hang: at eight seconds you wonder, at twenty you
// reload, at forty you assume it is broken and lose the work.
//
// So this tracks elapsed time as well as busy state. The rule the UI applies is
// that under about three seconds nobody needs a number, and past it everybody
// does. A slow operation should read as slow, not as broken.

/** Milliseconds before elapsed time is worth showing. */
export const SHOW_ELAPSED_AFTER_MS = 3000

export interface AsyncActionState {
  /** The key of the action currently running, or null. */
  busyKey: string | null
  /** Milliseconds the current action has been running; 0 when idle. */
  elapsedMs: number
  /** True once the run is slow enough that the wait should be narrated. */
  isSlow: boolean
  /** Is this specific action the one running? */
  isBusy: (key: string) => boolean
  /** Is ANY action running? Use to disable a whole cluster of controls. */
  isAnyBusy: boolean
  /** Run `fn` under `key`, guaranteeing the busy state is always released. */
  run: <T>(key: string, fn: () => Promise<T>) => Promise<T | undefined>
  /** Escape hatch for surfaces still threading a `setBusy` prop into children.
   *  Prefer `run`, which cannot leak a stuck spinner. This exists so a panel can
   *  adopt the vocabulary without every child being converted in the same
   *  change; a child using it still gets the elapsed-time counter. */
  setBusyKey: (key: string | null) => void
}

export function useAsyncAction(): AsyncActionState {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAt = useRef<number>(0)
  // A component can unmount mid-flight (tab switch, row closed). Releasing state
  // on a dead component is a warning at best and a leak at worst.
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    if (!busyKey) { setElapsedMs(0); return }
    startedAt.current = Date.now()
    setElapsedMs(0)
    // 250ms keeps the seconds counter honest without re-rendering per frame.
    const id = window.setInterval(() => {
      if (alive.current) setElapsedMs(Date.now() - startedAt.current)
    }, 250)
    return () => window.clearInterval(id)
  }, [busyKey])

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusyKey(key)
    try {
      return await fn()
    } finally {
      // Always released, including when fn throws. The original hand-rolled
      // versions of this were correct, but each one had to remember to be.
      if (alive.current) setBusyKey(null)
    }
  }, [])

  return {
    busyKey,
    elapsedMs,
    isSlow: busyKey !== null && elapsedMs >= SHOW_ELAPSED_AFTER_MS,
    isBusy: (key: string) => busyKey === key,
    isAnyBusy: busyKey !== null,
    run,
    setBusyKey,
  }
}
