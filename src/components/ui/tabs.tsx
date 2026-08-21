import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned to the segmented control the app already
// uses (see people/PeopleTab.tsx). Worth having as a primitive: there are only
// two `role="tablist"` elements in the entire repo, and the pill nav is
// hand-rolled separately in GrowthTab, ContentV2Tab, OsTab and PeopleTab, each
// with its own keyboard behaviour (or none). Radix gives arrow-key roving focus
// for free.
const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex gap-1 rounded-xl border border-white/10 bg-base/80 p-1 backdrop-blur', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex min-h-[38px] flex-1 items-center justify-center rounded-lg px-3 text-label font-semibold',
        'whitespace-nowrap transition-colors',
        'text-white/55 hover:text-white/80',
        'data-[state=active]:bg-white/15 data-[state=active]:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('focus-visible:outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
