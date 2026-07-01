import React, { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  ariaLabel?: string
}

// Right-side overlay panel for detail views. Unlike an inline detail section,
// the underlying list never unmounts or reflows, so scroll position survives
// opening and closing.
export function SlideOver({ open, onClose, children, ariaLabel = 'Detail' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={ariaLabel}
        className="fixed right-0 top-0 bottom-0 z-50 w-[480px] max-w-[92vw] overflow-y-auto bg-base border-l border-white/10 animate-fade-in"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-base/95 backdrop-blur border-b border-white/[0.06]">
          <span className="text-[11px] uppercase tracking-[0.16em] text-violet-300/85">Detail</span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white/85 inline-flex items-center gap-1 text-[12px]"
            aria-label="Close detail"
          >
            <X size={14} /> Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </>
  )
}
