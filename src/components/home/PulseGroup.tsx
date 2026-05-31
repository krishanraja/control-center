import React, { useState } from 'react'
import { ChevronRight, Activity } from 'lucide-react'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * Collapsible "Pulse" group for the glanceable-but-not-actionable surfaces
 * (MRR detail, room previews, momentum, streaks, retro, signals). Keeps passive
 * context from interleaving with the daily action loop. Default collapsed on
 * mobile, open on desktop.
 */
export function PulseGroup({
  defaultOpen,
  children,
}: {
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const h = useHaptics()
  const [open, setOpen] = useState(!!defaultOpen)

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
        {!open && <span className="ml-auto text-[11px] text-white/35">money · pipeline · momentum</span>}
      </button>
      {open && (
        <div className="border-t border-white/[0.06] p-3 flex flex-col gap-4">
          {children}
        </div>
      )}
    </section>
  )
}
