import React from 'react'
import { X } from '@/lib/icons'
import { Dialog, DialogContent, DialogSrTitle, DialogClose } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  ariaLabel?: string
}

// Right-side overlay panel for detail views. Unlike an inline detail section,
// the underlying list never unmounts or reflows, so scroll position survives
// opening and closing.
//
// Now on ui/dialog. The hand-rolled version had role="dialog" and an Escape
// listener and nothing else: no focus trap, so Tab walked straight out of the
// panel into the list behind it; no aria-modal, so a screen reader read the
// page underneath as still available; no scroll lock; and focus was never
// returned to whatever opened it. Radix supplies all four. The visual shape,
// the props and the call sites are unchanged.
export function SlideOver({ open, onClose, children, ariaLabel = 'Detail' }: Props) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent
        position="right"
        showClose={false}
        overlayClassName="bg-black/40"
        aria-label={ariaLabel}
      >
        <DialogSrTitle>{ariaLabel}</DialogSrTitle>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-base/95 px-4 py-2.5 backdrop-blur">
          <span className="text-micro uppercase tracking-[0.14em] text-violet-300/85">Detail</span>
          <DialogClose
            className="inline-flex items-center gap-1 text-label text-white/50 transition-colors hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded"
            aria-label="Close detail"
          >
            <X size={14} /> Close
          </DialogClose>
        </div>
        <div className="p-4">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
