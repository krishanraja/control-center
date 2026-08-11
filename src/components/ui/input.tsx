import * as React from 'react'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned to the INPUT_CLS pattern already in
// growth/atoms.tsx. Relume's version leans on `border-scheme-border` and
// `bg-scheme-background`; both are aliased onto the Aurora channels in
// tailwind.config.js, but the house look wants the faint white wash, so that is
// written explicitly here.
//
// The 16px floor on coarse pointers is enforced globally in index.css
// (`input, select, textarea { font-size: 16px !important }`) to stop iOS
// zooming on focus. Do not fight it with a smaller text-[13px] here and expect
// it to win on a phone.
// The ref forwards to the <input>, not to the wrapper. Callers that own a
// clear button need to put focus back in the field afterwards, and a ref to a
// div cannot do that.
const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & {
    icon?: React.ReactNode
    iconPosition?: 'left' | 'right'
  }
>(function Input({ className, type, icon, iconPosition = 'left', ...props }, ref) {
  return (
    <div className="relative flex w-full items-center">
      {icon && iconPosition === 'left' && (
        <div className="pointer-events-none absolute left-3 flex text-white/35">{icon}</div>
      )}
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          'flex w-full rounded-form border border-white/10 bg-white/[0.03] text-[13px] text-white',
          'min-h-[38px] px-3 py-2 transition-colors',
          'placeholder:text-white/30',
          'focus:outline-none focus:ring-1 focus:ring-violet-400/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          icon && (iconPosition === 'left' ? 'pl-9' : 'pr-9'),
          className,
        )}
        {...props}
      />
      {icon && iconPosition === 'right' && (
        <div className="pointer-events-none absolute right-3 flex text-white/35">{icon}</div>
      )}
    </div>
  )
})

export { Input }
