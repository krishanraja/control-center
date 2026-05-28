import React, { useEffect, useState } from 'react'
import { Plus, X, Inbox, Sparkles } from 'lucide-react'
import { IdeaCaptureModal, isInboxEnabled } from './inbox/IdeaCaptureModal'
import { ContentIdeaModal } from './QuickCaptureIdea'
import { useHaptics } from '../hooks/useHaptics'

/**
 * Mobile capture FAB. One button at rest; tap to expand into Task (→
 * tasks_inbox, Sonnet routes) and Idea (→ content_ideas, Cleo enriches).
 * Desktop uses the ⌘J / ⌘I keyboard shortcuts + the QuickCaptureIdea pill;
 * this component is mobile-only.
 */
export function CaptureSpeedDial() {
  const h = useHaptics()
  const [dialOpen, setDialOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)

  useEffect(() => {
    if (!dialOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDialOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialOpen])

  const openTask = () => { h.select(); setDialOpen(false); setTaskOpen(true) }
  const openIdea = () => { h.select(); setDialOpen(false); setIdeaOpen(true) }

  const inboxEnabled = isInboxEnabled()

  return (
    <>
      <div className="md:hidden">
        {dialOpen && (
          <button
            type="button"
            aria-label="Close capture menu"
            onClick={() => setDialOpen(false)}
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] transition-opacity"
          />
        )}

        {/* Sub-actions — only mount while open so they can transition in cleanly. */}
        {dialOpen && (
          <div
            className="fixed right-4 z-40 flex flex-col items-end gap-3"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 164px)' }}
          >
            {inboxEnabled && (
              <SubAction
                label="Task"
                hint="Sonnet routes to the right agent"
                color="violet"
                icon={<Inbox size={20} />}
                onClick={openTask}
              />
            )}
            <SubAction
              label="Idea"
              hint="Cleo enriches + dedupes"
              color="rose"
              icon={<Sparkles size={20} />}
              onClick={openIdea}
            />
          </div>
        )}

        <button
          type="button"
          aria-label={dialOpen ? 'Close capture menu' : 'Capture'}
          aria-expanded={dialOpen}
          onClick={() => { h.select(); setDialOpen(o => !o) }}
          className={`fixed right-4 z-40 w-14 h-14 rounded-full shadow-2xl border inline-flex items-center justify-center text-white transition-colors ${
            dialOpen
              ? 'bg-white/15 border-white/30 backdrop-blur'
              : 'bg-violet-500/90 hover:bg-violet-500 border-violet-300/40'
          }`}
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
        >
          <span
            className="inline-flex items-center justify-center transition-transform duration-200"
            style={{ transform: dialOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
          >
            <Plus size={22} strokeWidth={2.5} />
          </span>
        </button>
      </div>

      <IdeaCaptureModal open={taskOpen} onClose={() => setTaskOpen(false)} source="mobile" />
      <ContentIdeaModal open={ideaOpen} onClose={() => setIdeaOpen(false)} />
    </>
  )
}

function SubAction({
  label, hint, color, icon, onClick,
}: {
  label: string
  hint: string
  color: 'violet' | 'rose'
  icon: React.ReactNode
  onClick: () => void
}) {
  const colorMap = {
    violet: 'bg-violet-500/90 border-violet-300/40 text-white',
    rose:   'bg-rose-500/90 border-rose-300/40 text-white',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 active:scale-95 transition-transform"
    >
      <div className="flex flex-col items-end">
        <span className="text-[14px] font-semibold text-white leading-tight">{label}</span>
        <span className="text-[11px] text-white/60 leading-tight">{hint}</span>
      </div>
      <span className={`w-12 h-12 rounded-full border shadow-xl inline-flex items-center justify-center ${colorMap[color]}`}>
        {icon}
      </span>
    </button>
  )
}
