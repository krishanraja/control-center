import React from 'react'
import { usePressable, type UsePressableOpts } from './usePressable'
import { useDeviceClass } from './motion'
import { DrawnCheck } from './DrawnCheck'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

// Colour comes from ui/button now, so a button variant is defined once rather
// than once here and again in every panel that hand-rolls its own. The check
// stroke stays local because it is the only piece the shared variants have no
// concept of.
//
// The old local `danger` was `text-red-300`, a fixed hex tuned for the dark
// surface. Only accent shades 50/100/200 map to the --ac-* channels that flip
// with the theme, so it washed out on the light background. ui/button's danger
// is rose-200 and flips correctly.
const CHECK_STROKE: Record<Variant, string> = {
  primary: '#ffffff',
  secondary: '#a99bff',
  danger: '#fca5a5',
  ghost: '#a99bff',
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

  // When a custom className is supplied we respect it wholesale (used for
  // bespoke surfaces like nav rows); otherwise compose the standard button.
  const composed =
    className ??
    cn(
      buttonVariants({ variant, size: device === 'desktop' ? 'default' : 'touch' }),
      // The house pressable is softer-cornered than the base button and always
      // full width in a stacked sheet. twMerge resolves both against the
      // variant string rather than letting source order decide.
      block ? 'w-full' : 'inline-flex',
      'relative overflow-hidden rounded-2xl',
      pressClass,
      bind.disabled ? 'opacity-90 cursor-default' : '',
    )

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
          <DrawnCheck size={22} stroke={CHECK_STROKE[variant]} ring={false} />
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
