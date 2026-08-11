import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

// Vendored from Relume, re-skinned and taught two house rules Relume knows
// nothing about.
//
// 1. THE MOBILE ZOOM CONTRACT. App.tsx renders the whole mobile tree inside
//    `.mobile-zoom-root` (`zoom: 1.2`), which publishes `--z`. Radix portals to
//    document.body by default, which sits OUTSIDE that wrapper, so a dialog
//    would render at native scale against a 1.2x app. We portal into the zoom
//    root when it exists, and size against `calc(100dvh / var(--z, 1))` so the
//    box still fits the viewport. On desktop there is no zoom root and `--z` is
//    unset, so both fall back to plain body / 100dvh with no special-casing.
//
// 2. MOTION. Relume ships `data-[state=open]:animate-in fade-in-0`, which are
//    tailwindcss-animate classes this project does not install; they would
//    silently compile to nothing. The house keyframes in index.css are used
//    instead, and those are already switched off under prefers-reduced-motion.

/** The mobile zoom wrapper, when the mobile shell is mounted. */
function zoomRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return (document.querySelector('.mobile-zoom-root') as HTMLElement | null) ?? undefined
}

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-base/80 backdrop-blur-sm animate-fade-in',
        'h-[calc(100dvh/var(--z,1))] w-[calc(100vw/var(--z,1))]',
        className,
      )}
      {...props}
    />
  )
}

// Where the panel sits. `center` is the modal default; `right` backs
// shared/SlideOver and `bottom` backs mobile/BottomSheet, so those two keep
// their established shape while inheriting the focus trap, scroll lock,
// aria-modal and focus restoration that hand-rolled overlays do not have.
const POSITION: Record<'center' | 'right' | 'bottom' | 'responsive', string> = {
  // `surface` is applied by the variant, not baked into the base, so a caller
  // that brings its own material (the command palette) can drop it with a
  // `bg-transparent border-0` override and twMerge will resolve cleanly.
  center:
    'surface left-1/2 top-1/2 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 ' +
    'max-h-[calc(100dvh/var(--z,1)-2rem)] overflow-y-auto rounded-card p-5 animate-scale-in',
  right:
    'right-0 top-0 h-[calc(100dvh/var(--z,1))] w-[480px] max-w-[92vw] overflow-y-auto ' +
    'border-l border-white/10 bg-base animate-fade-in',
  bottom:
    'bottom-0 left-1/2 w-full max-w-xl -translate-x-1/2 rounded-t-[28px] ' +
    'border-t border-white/[0.08] bg-base shadow-2xl shadow-black/60 animate-sheet-up',
  // The shape most of this product's modals already had: a sheet rising from
  // the bottom edge on a phone, a centred card on the desk. Written once here
  // instead of as `flex items-end sm:items-center justify-center` repeated in
  // every overlay that wanted it.
  responsive:
    'surface inset-x-0 bottom-0 max-h-[calc(100dvh/var(--z,1)-2rem)] overflow-y-auto ' +
    'rounded-t-[28px] p-5 animate-sheet-up ' +
    'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,32rem)] ' +
    'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:animate-scale-in',
}

function DialogContent({
  className,
  children,
  showClose = true,
  container,
  overlayClassName,
  position = 'center',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean
  container?: HTMLElement
  overlayClassName?: string
  position?: keyof typeof POSITION
}) {
  return (
    <DialogPortal container={container ?? zoomRoot()}>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn('fixed z-50 focus:outline-none', POSITION[position], className)}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 rounded-lg p-1.5 text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            aria-label="Close"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1 pr-8', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-[16px] font-semibold tracking-tight text-white', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-[13px] leading-relaxed text-white/55', className)}
      {...props}
    />
  )
}

/** Screen-reader-only title. Radix requires a Title inside every Content for
 *  the dialog to be announced; surfaces whose design has no visible heading
 *  (a slide-over, a sheet) use this instead of shipping an unlabelled dialog. */
function DialogSrTitle({ children }: { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Title className="sr-only">{children}</DialogPrimitive.Title>
  )
}

export {
  Dialog,
  DialogSrTitle,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
