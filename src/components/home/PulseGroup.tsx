import React, { useState } from 'react'
import { ChevronRight, Activity } from 'lucide-react'
import { useHaptics } from '../../hooks/useHaptics'
import { useCapacity } from '../../contexts/PilotStateContext'

/**
 * The ambient fold: a collapsible group for the glanceable-but-not-actionable
 * surfaces (MRR detail, room previews, momentum, streaks, retro, signals).
 * Keeps passive context from interleaving with the daily action loop; the
 * collapsed summary line promises that nothing inside asks anything of you.
 *
 * Capacity-aware: on a depleted day the fold stays shut and says so plainly.
 * It is still one tap from open, because capacity may hide things but must
 * never take them away.
 */
export function PulseGroup({
  defaultOpen,
  summary,
  children,
}: {
  defaultOpen?: boolean
  summary?: string
  children: React.ReactNode
}) {
  const h = useHaptics()
  const capacity = useCapacity()
  // An explicit prop always wins; otherwise capacity decides.
  const [open, setOpen] = useState(defaultOpen ?? capacity.foldOpen)
  const line = summary ?? capacity.foldSummary

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      <button
        type="button"
        onClick={() => { h.select(); setOpen(o => !o) }}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 active:bg-white/[0.03] transition-colors"
      >
        <ChevronRight
          size={14}
          className={`text-white/40 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Activity size={13} className="text-blue-400" />
        <span className="text-[11px] uppercase tracking-[0.16em] text-white/55 font-semibold">Pulse</span>
        {!open && <span className="ml-auto min-w-0 truncate text-[11px] text-white/35">{line}</span>}
      </button>
      {open && (
        <div className="border-t border-white/[0.06] p-3 flex flex-col gap-4">
          {children}
        </div>
      )}
    </section>
  )
}
