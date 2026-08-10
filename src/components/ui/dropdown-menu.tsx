import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned. Same portal-into-the-zoom-root rule as
// ui/dialog.tsx: on mobile the app renders inside `.mobile-zoom-root`, and a
// menu portalled to body would render at native scale next to a 1.2x trigger.
function zoomRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return (document.querySelector('.mobile-zoom-root') as HTMLElement | null) ?? undefined
}

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuSub = DropdownMenuPrimitive.Sub
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

function DropdownMenuContent({
  className,
  sideOffset = 6,
  container,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & { container?: HTMLElement }) {
  return (
    <DropdownMenuPrimitive.Portal container={container ?? zoomRoot()}>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'surface z-50 min-w-[9rem] overflow-hidden rounded-dropdown p-1 animate-scale-in',
          'focus:outline-none',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'relative flex min-h-[34px] cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 text-[13px]',
        'text-white/75 outline-none transition-colors',
        'focus:bg-white/[0.08] focus:text-white data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        'relative flex min-h-[34px] cursor-pointer select-none items-center rounded-lg py-1 pl-8 pr-2.5 text-[13px]',
        'text-white/75 outline-none transition-colors',
        'focus:bg-white/[0.08] focus:text-white data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check size={13} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn(
        'px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-white/[0.08]', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
}
