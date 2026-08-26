import React from 'react'
import { ChevronRight, Radar } from '@/lib/icons'
import { IconTile } from '../shared/IconTile'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * Home's door into the Business Intelligence console (OS → Intel): the
 * internal head space — money, APIs, funnel, bets, Marcus's read. Same
 * doorway language as FocusDoor's pill — a tile, a word, a chevron, never a
 * number (an unread count here would put a demand on the operator's
 * attention, which ambient chrome must not do). External market signals are
 * a different head space and never live behind this door; they surface as
 * the conditional SignalCards row when something fresh is hot.
 *
 * One sanctioned exception (Krish's explicit call, 2026-08-25): a status dot
 * — still never a number — when a connection is broken (rose) or money needs
 * a look: low credits, an annual renewal closing in, or spend ballooning
 * (amber). The dot says "open me", the console says why.
 */
export function IntelDoor({ onOpen, alert = null }: {
  onOpen: () => void
  alert?: 'amber' | 'rose' | null
}) {
  const h = useHaptics()
  return (
    <button
      type="button"
      data-testid="intel-door"
      onClick={() => { h.select(); onOpen() }}
      className="group relative flex shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.98]"
    >
      <IconTile icon={Radar} size="sm" />
      <span className="text-ui font-semibold leading-none text-white/90">Intel</span>
      <ChevronRight size={14} className="text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
      {alert && (
        <>
          <span
            data-testid="intel-door-dot"
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full animate-pulse ${alert === 'rose' ? 'bg-rose-500' : 'bg-amber-400'}`}
            aria-hidden
          />
          <span className="sr-only">{alert === 'rose' ? 'a connection is broken' : 'money needs a look'}</span>
        </>
      )}
    </button>
  )
}
