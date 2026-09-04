import * as React from 'react'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned to match Input.
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex w-full rounded-form border border-white/10 bg-sunk text-body text-strong',
        'min-h-[76px] p-3 transition-colors',
        'placeholder:text-ink-faint',
        'focus:outline-none focus:ring-1 focus:ring-violet-400/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
