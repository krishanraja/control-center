import React from 'react'
import { usePressable, type UsePressableOpts } from './usePressable'
import { useDeviceClass } from './motion'
import { DrawnCheck } from './DrawnCheck'

/**
 * Pressable — the shared body for tactile buttons.
 *
 * One control, both device classes. It consumes usePressable for the press +
 * haptic + async state machine, and renders the state visually:
 *   • pending → the honest `.animate-indeterminate` rail under the label
 *   • success → a check that draws itself (DrawnCheck) over the label
 * Variant class strings are a superset of the existing DetailSheet buttons, so
 * adopting it is behaviour-preserving. Padding tightens on desktop (deep work,
 * denser) and a focus ring appears for keyboard nav; on mobile the targets stay
 * thumb-sized. All of that branches here, once, never at the call site.
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface PressableProps extends UsePressableOpts {
  children: React.ReactNode
  variant?: Variant
  /** Override the full className (skips built-in variant styling). */
  className?: string
  /** Stretch to container width — the default for stacked sheet actions. */
  block?: boolean
  type?: 'button' | 'submit'
  'aria-label'?: string
}

const VARIANT: Record<Variant, { base: string; checkStroke: string }> = {
  // Primary is the aurora — a lit violet→indigo gradient with a soft accent glow.
  primary:   { base: 'aurora-btn', checkStroke: '#ffffff' },
  secondary: { base: 'bg-white/[0.07] text-white active:bg-white/[0.12]', checkStroke: '#a99bff' },
  danger:    { base: 'bg-red-500/15 text-red-300 active:bg-red-500/25', checkStroke: '#fca5a5' },
  ghost:     { base: 'bg-transparent text-white/70 active:bg-white/[0.06]', checkStroke: '#a99bff' },
}

export function Pressable({
  children,
  variant = 'secondary',
  className,
  block = true,
  type = 'button',
  onPress,
  haptic,
  disabled,
  successHold,
  'aria-label': ariaLabel,
}: PressableProps) {
  const device = useDeviceClass()
  const { state, bind, pressClass } = usePressable({ onPress, haptic, disabled, successHold })
  const v = VARIANT[variant]

  // When a custom className is supplied we respect it wholesale (used for
  // bespoke surfaces like nav rows); otherwise compose the standard button.
  const composed =
    className ??
    [
      block ? 'w-full' : 'inline-flex',
      'relative overflow-hidden rounded-2xl text-[15px] font-semibold transition-colors',
      device === 'desktop'
        ? 'py-2.5 px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50'
        : 'py-3.5',
      v.base,
      pressClass,
      bind.disabled ? 'opacity-90 cursor-default' : '',
    ]
      .filter(Boolean)
      .join(' ')

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      onClick={bind.onClick}
      onPointerDown={bind.onPointerDown}
      disabled={bind.disabled}
      aria-busy={bind['aria-busy']}
      className={composed}
    >
      {/* Content dims while resolving so the state read is unambiguous. */}
      <span
        className={`flex items-center justify-center gap-2 transition-opacity ${
          state === 'pending' ? 'opacity-60' : state === 'success' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {children}
      </span>

      {/* Success: the earned moment — a check drawing itself, centered. */}
      {state === 'success' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <DrawnCheck size={22} stroke={v.checkStroke} ring={false} />
        </span>
      )}

      {/* Pending: the honest progress rail along the bottom edge. */}
      {state === 'pending' && (
        <span className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
          <span className="block h-full w-1/3 animate-indeterminate bg-current opacity-70" />
        </span>
      )}
    </button>
  )
}
