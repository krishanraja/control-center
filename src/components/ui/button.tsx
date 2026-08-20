import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned to Obsidian Aurora.
//
// The variants are the ones this product already speaks, taken from
// shared/Pressable.tsx and growth/atoms.tsx rather than from Relume's own
// palette: Relume ships `bg-neutral-darkest` / `border-white bg-white`, and
// neither survives contact with this config. `white` is remapped to the --fg
// channel, so `bg-white text-black` renders as invisible ink-on-paper in
// daylight; `neutral-darkest` is not a colour that exists here at all and would
// silently compile to nothing.
//
// Pressable keeps the press/haptic/async state machine. This is the flat button
// underneath it.
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-button whitespace-nowrap font-semibold',
    'transition-colors duration-200 ease-out-soft',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
    'disabled:pointer-events-none disabled:opacity-40',
  ].join(' '),
  {
    variants: {
      variant: {
        // The lit gradient primary. `.aurora-btn` pins its own #fff text, so it
        // stays legible on the accent fill in both themes.
        primary: 'aurora-btn',
        // The inverted high-emphasis CTA. Never `bg-white text-black`.
        contrast: 'btn-contrast',
        secondary: 'bg-white/[0.07] text-white hover:bg-white/[0.10] active:bg-white/[0.12]',
        outline: 'border border-white/10 text-white hover:border-white/20 hover:bg-white/[0.04]',
        ghost: 'bg-transparent text-white/70 hover:text-white active:bg-white/[0.06]',
        danger: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/20 active:bg-rose-500/25',
        link: 'gap-1.5 p-0 text-white/70 underline underline-offset-4 hover:text-white',
        none: '',
      },
      size: {
        // 48px is the house touch target (pilot/controls.tsx TAP).
        default: 'min-h-[44px] px-4 py-2.5 text-[15px]',
        sm: 'min-h-[34px] px-3 py-1.5 text-[12px]',
        touch: 'min-h-[48px] px-4 py-3 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-7',
        none: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    iconLeft?: React.ReactNode
    iconRight?: React.ReactNode
    /**
     * The work this button started is still running.
     *
     * This is the rung the system was missing. Pressable has owned the pending
     * choreography since it was written, but it is a whole tactile body with a
     * press state machine and haptics, so most surfaces did not adopt it and
     * hand-rolled `disabled={saving}` plus a spinning icon instead. Roughly 174
     * of them, each deciding for itself whether to swap the icon, change the
     * label, dim the text, or do nothing visible at all.
     *
     * So the flat button underneath gets the same honest rail Pressable paints:
     * an indeterminate light along the bottom edge, content dimmed so the state
     * is unambiguous, `aria-busy` for anyone not looking at it, and pointer
     * events off so the second click cannot land. One prop, no restructuring.
     *
     * It deliberately does NOT set `disabled`. A disabled button is removed
     * from the tab order, which moves keyboard focus somewhere arbitrary the
     * moment work begins and again when it ends. `aria-disabled` keeps the
     * button focusable and announced while making it inert.
     */
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  iconLeft,
  iconRight,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        // Dim every direct child except the rail. Done as a variant rather than
        // a wrapper span so the Slottable contract (and therefore `asChild`) is
        // untouched, and because `display: contents` cannot take an opacity.
        loading && 'relative overflow-hidden pointer-events-none [&>*:not([data-busy-rail])]:opacity-60',
      )}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {iconLeft}
      <Slottable>{children}</Slottable>
      {iconRight}
      {loading && (
        <span data-busy-rail className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
          <span className="block h-full w-1/3 animate-indeterminate bg-current opacity-70" />
        </span>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
