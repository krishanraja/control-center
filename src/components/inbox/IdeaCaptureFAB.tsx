import React, { useState } from 'react'
import { Inbox } from 'lucide-react'
import { IdeaCaptureModal, isInboxEnabled } from './IdeaCaptureModal'

// Phase 2: floating action button (mobile only). Tap to open IdeaCaptureModal.

export function IdeaCaptureFAB() {
  const [open, setOpen] = useState(false)
  if (!isInboxEnabled()) return null

  return (
    <>
      <button
        type="button"
        aria-label="Drop a task"
        onClick={() => setOpen(true)}
        className="md:hidden fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+148px)] z-30 w-14 h-14 rounded-full bg-violet-500/90 hover:bg-violet-500 border border-violet-300/40 shadow-2xl inline-flex items-center justify-center text-white"
      >
        <Inbox size={20} />
      </button>
      <IdeaCaptureModal open={open} onClose={() => setOpen(false)} source="mobile" />
    </>
  )
}
