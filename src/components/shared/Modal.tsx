import React from 'react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogSrTitle,
} from '@/components/ui/dialog'

// The house modal.
//
// Before this, eleven surfaces each hand-rolled `<div className="fixed inset-0
// ...">` with their own scrim, their own centring and their own close button.
// Nine of them had no dialog role, so a screen reader never announced them, Tab
// walked out into the page behind, and the body kept scrolling. Rather than
// give each one its own fix, they share this.
//
// It is deliberately a thin wrapper: it owns the shell (scrim, position,
// labelling, dismissal) and nothing about the content. Every converted surface
// keeps its existing body markup exactly as it was.

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** Announced to assistive tech, and rendered as the heading unless hideTitle. */
  title: string
  description?: string
  /** Keep the title for screen readers but do not render it. For surfaces that
   *  already draw their own header. */
  hideTitle?: boolean
  /**
   * `responsive` (default) is a sheet on a phone and a centred card on the desk.
   * `center` is centred everywhere. `full` is an edge-to-edge working surface.
   */
  variant?: 'responsive' | 'center' | 'full'
  /**
   * False for a decision the operator must actually make. Escape, the scrim and
   * the close affordance all stop working, which is the point: PendingFlagModal
   * exists precisely so a flagged agent cannot be waved away.
   */
  dismissible?: boolean
  className?: string
  /** Scrim override. Some surfaces dim with the theme base rather than black. */
  overlayClassName?: string
  children: React.ReactNode
}

export function Modal({
  open, onClose, title, description, hideTitle,
  variant = 'responsive', dismissible = true, className, overlayClassName, children,
}: ModalProps) {
  const position = variant === 'center' ? 'center' : variant === 'full' ? 'center' : 'responsive'
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && dismissible) onClose() }}>
      <DialogContent
        position={position}
        showClose={dismissible}
        overlayClassName={overlayClassName}
        className={[
          variant === 'full'
            ? 'h-[calc(100dvh/var(--z,1))] w-[calc(100vw/var(--z,1))] max-w-none translate-x-0 translate-y-0 left-0 top-0 rounded-none border-0 p-0'
            : '',
          className || '',
        ].filter(Boolean).join(' ')}
        // An undismissable modal must not be closable by the two routes Radix
        // gives away for free.
        onEscapeKeyDown={e => { if (!dismissible) e.preventDefault() }}
        onPointerDownOutside={e => { if (!dismissible) e.preventDefault() }}
        onInteractOutside={e => { if (!dismissible) e.preventDefault() }}
      >
        {hideTitle
          ? <DialogSrTitle>{title}</DialogSrTitle>
          : <DialogTitle className="mb-1 pr-6">{title}</DialogTitle>}
        {description && <DialogDescription className="mb-3">{description}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  )
}
