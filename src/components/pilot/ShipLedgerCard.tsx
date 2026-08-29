import React, { useState } from 'react'
import { Skeleton } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { useShipSummary } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { LogShipForm } from './LogShipForm'

// The ledger, as facts. Ships this week, days since the last one, the last
// three, and the return rate.
//
// Styling is neutral unconditionally. There is no branch anywhere in this file
// that changes colour, weight, or copy based on how the numbers look: a six-day
// gap renders exactly as calmly as a six-ship week. That is the point, and it is
// the thing most likely to get "improved" later. Do not add one.

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York', day: 'numeric', month: 'short',
  }).format(d)
}

export function ShipLedgerCard({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { summary, loading, refresh } = useShipSummary()
  const [logging, setLogging] = useState(false)
  const h = useHaptics()
  const waiting = useDeferredPending(loading)

  // The ledger always resolves to a summary, so a null here was a card-sized
  // hole that filled in after everything below had already settled into it.
  if (loading) {
    return (
      <Skeleton
        quiet={!waiting}
        h={variant === 'mobile' ? 116 : 132}
        r={16}
        className="border border-white/[0.06]"
      />
    )
  }
  // Genuinely nothing to show: no ledger, no card. Distinct from loading.
  if (!summary) return null

  const lastThree = summary.last_ten.slice(0, 3)
  const compact = variant === 'mobile'

  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className={`font-display ${compact ? 'text-display' : 'text-display'} leading-none text-ink`}>
            {summary.this_week}
          </span>
          <span className="text-label text-ink-muted">
            {summary.this_week === 1 ? 'ship this week' : 'ships this week'}
          </span>
        </div>
        {!logging && (
          <button
            type="button"
            onPointerDown={() => h.tap()}
            onClick={() => setLogging(true)}
            className="min-h-[44px] px-4 rounded-xl text-body bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.09] hover:text-ink transition-all active:scale-95 touch-manipulation shrink-0"
          >
            Log a ship
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-label text-ink-faint">
        <span>
          {summary.days_since_last === null
            ? 'No ships logged yet'
            : `${summary.days_since_last} ${summary.days_since_last === 1 ? 'day' : 'days'} since last ship`}
        </span>
        {summary.return_rate !== null && (
          <span>Return rate {summary.return_rate} {summary.return_rate === 1 ? 'day' : 'days'}</span>
        )}
      </div>

      {logging && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <LogShipForm
            onLogged={() => { setLogging(false); refresh() }}
            onCancel={() => setLogging(false)}
          />
        </div>
      )}

      {!logging && lastThree.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-col gap-1.5">
          {lastThree.map(ship => (
            <div key={ship.id} className="flex items-baseline gap-2 text-label">
              <span className="text-ink-faint w-[42px] shrink-0">{formatWhen(ship.occurred_at)}</span>
              <span className="text-ink-muted truncate">{ship.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
