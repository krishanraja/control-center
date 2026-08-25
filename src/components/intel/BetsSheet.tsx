import React, { useMemo } from 'react'
import { SlideOver } from '../shared/SlideOver'
import { Eyebrow } from '../shared/Eyebrow'
import { BetCard } from '../BetCard'
import { useBets, isOverdue, type BetRow } from '../../hooks/useBets'

const MS_PER_DAY = 86_400_000

function daysLeft(bet: BetRow): number {
  const deadline = new Date(bet.started_at).getTime() + bet.time_box_days * MS_PER_DAY
  return Math.ceil((deadline - Date.now()) / MS_PER_DAY)
}

/**
 * The bets drill behind the KPI band's tile: every live bet with its full
 * Won/Lost/Extend actions (BetCard reused unchanged), overdue ones first so
 * the decision that is already late is the first thing on screen. Replaces
 * the old collapsed BetsStrip — the tile carries the count, this carries the
 * work.
 */
export function BetsSheet({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const { live, overdueLive, hitRates, loading } = useBets()

  // Overdue first (most overdue first), then soonest deadline.
  const ordered = useMemo(() => {
    const overdue = [...overdueLive].sort((a, b) => daysLeft(a) - daysLeft(b))
    const rest = live.filter(b => !isOverdue(b)).sort((a, b) => daysLeft(a) - daysLeft(b))
    return [...overdue, ...rest]
  }, [live, overdueLive])

  const overall = hitRates.find(r => r.kind === 'all')

  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Bets detail" label="Bets">
      <div className="flex flex-col gap-4" data-testid="bets-detail">
        {!loading && ordered.length === 0 && (
          <p className="text-body leading-relaxed text-white/45">
            No live bets. Promote a signal, or add one from a hypothesis you
            want to hold yourself to.
          </p>
        )}

        {ordered.length > 0 && (
          <>
            <div className="px-1">
              <Eyebrow>
                {overdueLive.length > 0
                  ? `${ordered.length} live · ${overdueLive.length} overdue — decide`
                  : `${ordered.length} live`}
              </Eyebrow>
            </div>
            <div className="flex flex-col gap-3">
              {ordered.map(b => (
                <BetCard key={b.id} bet={b} forceDecide={isOverdue(b)} />
              ))}
            </div>
          </>
        )}

        {overall && overall.total > 0 && (
          <p className="text-label leading-relaxed text-white/40">
            Last 90 days: {overall.won} won, {overall.lost} lost —
            a {overall.pct.toFixed(0)}% hit-rate.
          </p>
        )}
      </div>
    </SlideOver>
  )
}
