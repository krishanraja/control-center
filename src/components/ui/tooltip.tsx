import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

function zoomRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return (document.querySelector('.mobile-zoom-root') as HTMLElement | null) ?? undefined
}

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({
  className,
  sideOffset = 5,
  container,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & { container?: HTMLElement }) {
  return (
    <TooltipPrimitive.Portal container={container ?? zoomRoot()}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'surface z-50 max-w-[16rem] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug text-white/80 animate-fade-in',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
