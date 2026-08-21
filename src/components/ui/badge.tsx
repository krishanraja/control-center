import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned. Relume's default badge is a filled
// `neutral-lightest` chip; the house grammar (shared/StatusPill.tsx) is a
// neutral pill that carries colour only in a dot or in the text, never as a
// background wash. `docs/DESIGN_SYSTEM.md`: colour is reserved for meaning.
//
// FOREGROUNDS USE SHADE 200, NOT 300. In tailwind.config.js only 50/100/200 of
// the accent ramps map to the --ac-* channels that flip between themes; 300 and
// up are fixed hexes tuned for the dark surface (amber-300 is #dcc08a). A 300
// foreground looks correct in dark mode and washes out to nearly illegible on
// the light paper background. Caught in a light-mode screenshot, not in review.
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-badge px-2 py-[0.175rem] text-micro font-semibold leading-[1.5]',
  {
    variants: {
      variant: {
        default: 'border border-white/10 bg-white/[0.05] text-white/70',
        solid: 'border border-white/15 bg-white/[0.10] text-white',
        outline: 'border border-white/15 bg-transparent text-white/70',
        accent: 'border border-violet-400/30 bg-violet-500/15 text-violet-100',
        success: 'border border-emerald-400/25 bg-emerald-500/12 text-emerald-200',
        warning: 'border border-amber-400/25 bg-amber-500/12 text-amber-200',
        danger: 'border border-rose-400/25 bg-rose-500/12 text-rose-200',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
