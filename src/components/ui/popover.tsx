import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

// @radix-ui/react-popover has been in package.json since the Radix chunk was
// added to vite.config.ts, and imported nowhere. This is the first use.
// Portals into the mobile zoom root for the reason documented in ui/dialog.tsx.
function zoomRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return (document.querySelector('.mobile-zoom-root') as HTMLElement | null) ?? undefined
}

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 6,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { container?: HTMLElement }) {
  return (
    <PopoverPrimitive.Portal container={container ?? zoomRoot()}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'surface z-50 w-64 rounded-card p-3 text-[13px] text-white/75 animate-scale-in focus:outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
