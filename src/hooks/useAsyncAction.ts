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
//
// It also carries a STAGE, because on the longest runs the number alone stops
// helping. "42s" says the wait is real; "42s, drafting in your voice" says the
// wait is progressing, which is the thing the user actually wants to know and
// the only honest alternative to a percentage nothing can compute.

/** Milliseconds before elapsed time is worth showing. */
export const SHOW_ELAPSED_AFTER_MS = 3000

/** Handed to the work so it can narrate itself as it moves. */
export type StageReporter = (stage: string | null) => void

export interface AsyncActionState {
  /** The key of the action currently running, or null. */
  busyKey: string | null
  /** Milliseconds the current action has been running; 0 when idle. */
  elapsedMs: number
  /** The stage the running action last reported, or null. */
  stage: string | null
  /** True once the run is slow enough that the wait should be narrated. */
  isSlow: boolean
  /** Is this specific action the one running? */
  isBusy: (key: string) => boolean
  /** Is ANY action running? Use to disable a whole cluster of controls. */
  isAnyBusy: boolean
  /** Run `fn` under `key`, guaranteeing the busy state is always released.
   *  `fn` receives a reporter it can call to name the stage it has reached. */
  run: <T>(key: string, fn: (setStage: StageReporter) => Promise<T>) => Promise<T | undefined>
  /** Escape hatch for surfaces still threading a `setBusy` prop into children.
   *  Prefer `run`, which cannot leak a stuck spinner. This exists so a panel can
   *  adopt the vocabulary without every child being converted in the same
   *  change; a child using it still gets the elapsed-time counter. */
  setBusyKey: (key: string | null) => void
}

export function useAsyncAction(): AsyncActionState {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stage, setStage] = useState<string | null>(null)
  const startedAt = useRef<number>(0)
  // A component can unmount mid-flight (tab switch, row closed). Releasing state
  // on a dead component is a warning at best and a leak at worst.
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    if (!busyKey) { setElapsedMs(0); setStage(null); return }
    startedAt.current = Date.now()
    setElapsedMs(0)
    // 250ms keeps the seconds counter honest without re-rendering per frame.
    const id = window.setInterval(() => {
      if (alive.current) setElapsedMs(Date.now() - startedAt.current)
    }, 250)
    return () => window.clearInterval(id)
  }, [busyKey])

  const run = useCallback(async <T,>(
    key: string,
    fn: (setStage: StageReporter) => Promise<T>,
  ): Promise<T | undefined> => {
    setBusyKey(key)
    setStage(null)
    const report: StageReporter = (s) => { if (alive.current) setStage(s) }
    try {
      return await fn(report)
    } finally {
      // Always released, including when fn throws. The original hand-rolled
      // versions of this were correct, but each one had to remember to be.
      if (alive.current) { setBusyKey(null); setStage(null) }
    }
  }, [])

  return {
    busyKey,
    elapsedMs,
    stage,
    isSlow: busyKey !== null && elapsedMs >= SHOW_ELAPSED_AFTER_MS,
    isBusy: (key: string) => busyKey === key,
    isAnyBusy: busyKey !== null,
    run,
    setBusyKey,
  }
}

/**
 * Elapsed milliseconds for a boolean that some surface is already tracking.
 *
 * useAsyncAction is the better vocabulary and owns the busy state itself, but
 * dozens of surfaces already have their own `busy` / `shipping` / `generating`
 * flag wired through props and callbacks. Converting each one is a large,
 * risky, unrelated refactor; the thing they are all missing is not a state
 * machine, it is the number. So this reads the flag they already have.
 *
 * Zero when idle, so a call site can pass it straight through without guarding.
 */
export function useElapsed(active: boolean): number {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    if (!active) { setMs(0); return }
    const started = Date.now()
    setMs(0)
    const id = window.setInterval(() => setMs(Date.now() - started), 250)
    return () => window.clearInterval(id)
  }, [active])
  return active ? ms : 0
}

/**
 * Walk a fixed list of stage names on a timer, for work that genuinely cannot
 * report its own progress (a single opaque model call). It is honest about
 * being an estimate: it never claims completion, and it holds on the last stage
 * rather than looping or finishing early.
 *
 * Used by the long publish/build paths, where OneActionPicker already proved
 * the pattern.
 */
export function useStageWalk(stages: string[] | undefined, active: boolean, everyMs = 18_000): string | null {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active || !stages?.length) { setIndex(0); return }
    setIndex(0)
    const id = window.setInterval(
      () => setIndex(i => Math.min(i + 1, stages.length - 1)),
      everyMs,
    )
    return () => window.clearInterval(id)
  }, [active, stages, everyMs])
  if (!active || !stages?.length) return null
  return stages[Math.min(index, stages.length - 1)]
}
