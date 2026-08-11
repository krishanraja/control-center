import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned. Relume's card is a flat bordered box; the
// house material is `.surface` from index.css (lit top edge + raised obsidian at
// night, opaque near-white by day), so the variants map onto that instead of
// re-inventing the recipe with utilities.
const cardVariants = cva('overflow-hidden rounded-card', {
  variants: {
    variant: {
      surface: 'surface',
      raised: 'surface-2',
      glass: 'glass-card',
      outline: 'border border-white/10 bg-transparent',
    },
  },
  defaultVariants: { variant: 'surface' },
})

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1 p-4 pb-0', className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-[14px] font-semibold leading-tight text-white', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-description" className={cn('text-[12px] text-white/55', className)} {...props} />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-4', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center gap-2 p-4 pt-0', className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
