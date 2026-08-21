import React, { useMemo, useState } from 'react'
import { Target, ChevronRight } from '@/lib/icons'
import { useBets, isOverdue, type BetRow } from '../../hooks/useBets'
import { BetCard } from '../BetCard'

const MS_PER_DAY = 86_400_000

function daysLeft(bet: BetRow): number {
  const deadline = new Date(bet.started_at).getTime() + bet.time_box_days * MS_PER_DAY
  return Math.ceil((deadline - Date.now()) / MS_PER_DAY)
}

/**
 * Compact Home strip replacing the standalone Bets tab: one line of live
 * state, expanding to the top bets with their full Won/Lost/Extend actions
 * (BetCard reused unchanged). The bets table, APIs, and n8n consumers
 * (marcus-daily-brief, krish-focus-calibrator) are untouched.
 */
export function BetsStrip() {
  const { live, overdueLive, hitRates, loading } = useBets()
  const [open, setOpen] = useState(false)

  // Overdue first (oldest first), then soonest deadline.
  const ordered = useMemo(() => {
    const overdue = [...overdueLive].sort((a, b) => daysLeft(a) - daysLeft(b))
    const rest = live.filter(b => !isOverdue(b)).sort((a, b) => daysLeft(a) - daysLeft(b))
    return [...overdue, ...rest]
  }, [live, overdueLive])

  // Deliberately silent while loading, and deliberately NOT a skeleton. This
  // strip is absent whenever there are no live bets, which is often, so
  // reserving space for it would shove the ambient fold around to announce
  // something that may never arrive. Split from the empty case so the two
  // reasons stay distinguishable.
  if (loading) return null
  if (live.length === 0) return null

  const soonest = ordered.find(b => !isOverdue(b))
  const overall = hitRates.find(r => r.kind === 'all')
  const bits: string[] = []
  if (overdueLive.length > 0) bits.push(`${overdueLive.length} overdue — decide`)
  if (soonest) {
    const d = daysLeft(soonest)
    bits.push(d <= 0 ? 'time-box ends today' : `next time-box in ${d}d`)
  }
  if (overall && overall.total > 0) bits.push(`${overall.pct.toFixed(0)}% hit-rate 90d`)

  return (
    <div className={`rounded-xl border ${overdueLive.length > 0 ? 'border-rose-500/20 bg-rose-500/[0.03]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <ChevronRight
          size={11}
          className={`text-white/40 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Target size={12} className={overdueLive.length > 0 ? 'text-rose-300' : 'text-white/45'} />
        <span className="text-micro font-semibold text-white/70 uppercase tracking-[0.14em]">
          Bets ({live.length} live)
        </span>
        <span className="text-micro text-white/40 truncate">{bits.join(' · ')}</span>
      </button>

      {open && (
        <div className="border-t border-white/[0.05] p-3 space-y-3">
          {ordered.slice(0, 3).map(b => (
            <BetCard key={b.id} bet={b} forceDecide={isOverdue(b)} />
          ))}
          {ordered.length > 3 && (
            <p className="text-micro text-white/35 text-center">+{ordered.length - 3} more live</p>
          )}
        </div>
      )}
    </div>
  )
}
