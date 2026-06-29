import { useCallback, useRef, useState } from 'react'
import { useHaptics } from '../../hooks/useHaptics'
import { useReducedMotion } from './motion'

/**
 * usePressable — the DRY brain behind every tactile control.
 *
 * It bundles the three things a "magical" button needs and that were previously
 * re-implemented (or skipped) per call site:
 *   1. Touch-down haptic — fired on pointerdown, the way native iOS controls
 *      buzz the instant your finger lands, not on the eventual click.
 *   2. Press depth — the `press-effect` class (active:scale-95), suppressed
 *      under prefers-reduced-motion.
 *   3. Async choreography — if onPress returns a Promise the control enters
 *      `pending` (disabled + aria-busy), then resolves to `success` (+success
 *      haptic) or `error` (+error haptic) and settles back to idle after a hold.
 *
 * Haptics are silent no-ops on desktop/iOS, so the same code path serves both
 * device classes with no branching here — see Pressable for the visual deltas.
 */
export type PressState = 'idle' | 'pending' | 'success' | 'error'

type HapticName = keyof ReturnType<typeof useHaptics>

export interface UsePressableOpts {
  /** The action. Sync returns nothing; async returns a Promise we choreograph. */
  onPress?: () => void | Promise<unknown>
  /** Touch-down haptic. `false` to suppress. Defaults to 'press'. */
  haptic?: HapticName | false
  /** Don't fire / report state. */
  disabled?: boolean
  /** ms to hold the success/error state before settling back to idle. */
  successHold?: number
}

export interface UsePressableReturn {
  state: PressState
  bind: {
    onClick: (e: React.MouseEvent) => void
    onPointerDown: () => void
    disabled: boolean
    'aria-busy': boolean
  }
  /** Compose onto className; empty under reduced motion. */
  pressClass: string
}

export function usePressable(opts: UsePressableOpts): UsePressableReturn {
  const { onPress, haptic = 'press', disabled = false, successHold = 900 } = opts
  const h = useHaptics()
  const reduced = useReducedMotion()
  const [state, setState] = useState<PressState>('idle')
  // Guard against state updates after unmount / double-fire while pending.
  const inFlight = useRef(false)

  const fireHaptic = useCallback(() => {
    if (haptic && typeof h[haptic] === 'function') h[haptic]()
  }, [h, haptic])

  const onPointerDown = useCallback(() => {
    if (disabled || inFlight.current) return
    fireHaptic()
  }, [disabled, fireHaptic])

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || inFlight.current) return
      const result = onPress?.()
      if (result instanceof Promise) {
        e.preventDefault?.()
        inFlight.current = true
        setState('pending')
        result.then(
          () => {
            inFlight.current = false
            setState('success')
            h.success()
            window.setTimeout(() => setState('idle'), successHold)
          },
          () => {
            inFlight.current = false
            setState('error')
            h.error()
            window.setTimeout(() => setState('idle'), successHold)
          },
        )
      }
    },
    [disabled, onPress, h, successHold],
  )

  return {
    state,
    bind: {
      onClick,
      onPointerDown,
      disabled: disabled || state === 'pending',
      'aria-busy': state === 'pending',
    },
    pressClass: reduced ? '' : 'press-effect',
  }
}
