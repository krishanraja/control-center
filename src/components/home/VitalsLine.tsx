import React, { useState } from 'react'
import { ArrowRight, Compass } from 'lucide-react'
import { useRevenueAttribution } from '../../hooks/useRevenueAttribution'
import { useShipSummary } from '../../hooks/usePilot'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { splitDecisions } from '../../lib/decisionKinds'
import { formatMrr } from '../../lib/mrrDisplay'
import { useHaptics } from '../../hooks/useHaptics'
import { Modal } from '../shared/Modal'
import { Skeleton } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { LogShipForm } from '../pilot/LogShipForm'
import { Eyebrow } from '../shared/Eyebrow'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * The one quiet vitals line on Home: MRR · ships this week (with the one-tap
 * Log) · decisions waiting · the door into Focus. Numbers in mono, labels in
 * the house eyebrow; nothing here asks anything — the queue count links out to
 * OS → Queue and Focus links to the operator's own hub.
 *
 * The ship ledger's non-negotiables carry over from ShipLedgerCard
 * (docs/PILOT-LAYER.md): rendering is NEUTRAL unconditionally. There is no
 * branch anywhere in this file that changes colour, weight, or copy based on
 * how any number looks — a six-day gap renders exactly as calmly as a six-ship
 * week, and a falling MRR exactly as calmly as a rising one. Do not add one.
 * The Log modal keeps the ledger facts (days since last, return rate, last
 * three) one tap away, so compressing the card lost no information.
 */
export function VitalsLine({ onNavigate, compact = false }: { onNavigate?: NavigateFn; compact?: boolean }) {
  const { liveMrr, mrrDelta7d, loading: revLoading } = useRevenueAttribution()
  const { summary, loading: shipsLoading, refresh } = useShipSummary()
  const { decisions } = useRealtimeDecisionsWaiting()
  const waiting = splitDecisions(decisions).decisions.length
  const h = useHaptics()
  const [logging, setLogging] = useState(false)
  const showBars = useDeferredPending(revLoading || shipsLoading)

  const delta = Math.round(mrrDelta7d)
  const lastThree = summary?.last_ten.slice(0, 3) ?? []

  return (
    <div className={`flex items-center flex-wrap ${compact ? 'gap-x-3.5 gap-y-1 min-h-[28px]' : 'gap-x-5 gap-y-1.5 min-h-[34px]'}`}>
      {/* MRR — a fact, not a mood. */}
      <span className="inline-flex items-baseline gap-2 min-w-0">
        <Eyebrow>MRR</Eyebrow>
        {revLoading
          ? <Skeleton quiet={!showBars} h={14} w={56} r={4} />
          : (
            <span className="font-mono tabular-nums text-ui text-white/90 whitespace-nowrap">
              {formatMrr(Number.isFinite(liveMrr) ? liveMrr : 0)}
              {!compact && <span className="ml-1.5 text-micro text-white/40">{delta >= 0 ? '+' : ''}{(Number.isFinite(delta) ? delta : 0).toLocaleString()}/wk</span>}
            </span>
          )}
      </span>

      <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />

      {/* Ships — the pilot ledger, compressed. Always neutral. */}
      <span className="inline-flex items-baseline gap-2 min-w-0">
        <Eyebrow>Ships</Eyebrow>
        {shipsLoading
          ? <Skeleton quiet={!showBars} h={14} w={72} r={4} />
          : (
            <span className="font-mono tabular-nums text-ui text-white/90 whitespace-nowrap">
              {summary?.this_week ?? 0}
              {!compact && <span className="ml-1.5 font-sans text-micro text-white/40">this week</span>}
            </span>
          )}
        <button
          type="button"
          onClick={() => { h.tap(); setLogging(true) }}
          className="min-h-[28px] px-2 rounded-md text-micro text-white/55 hover:text-white/90 border border-white/[0.08] hover:border-white/20 transition-colors"
        >
          Log
        </button>
      </span>

      <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />

      {/* The queue count. The list itself lives on OS → Queue. */}
      <button
        type="button"
        data-testid="vitals-waiting"
        onClick={() => { h.select(); onNavigate?.('os', { sub: 'queue' }) }}
        className="inline-flex items-baseline gap-2 min-w-0 group"
      >
        <Eyebrow>Waiting</Eyebrow>
        <span className="font-mono tabular-nums text-ui text-white/90 whitespace-nowrap inline-flex items-center gap-1">
          {waiting}
          <ArrowRight size={12} className="text-white/35 group-hover:text-white/75 transition-colors" />
        </span>
      </button>

      <span className="w-px h-3.5 bg-white/[0.08]" aria-hidden />

      {/* Home's door into Focus & Purpose (docs/FOCUS-PURPOSE.md). Deliberately
          the ONLY item on this line carrying no number: the hub's doctrine is
          that nothing about the operator is ever counted back at him from
          ambient chrome, so a "3 asks this week" here would break the feature
          it points at. A doorway, not a vital. It sits last because the check-in
          and the anxious-day auto-route are the primary ways in; this is the
          one that works on an ordinary day. */}
      <button
        type="button"
        data-testid="vitals-focus"
        onClick={() => { h.select(); onNavigate?.('focus') }}
        className="inline-flex items-center gap-1.5 min-w-0 group"
      >
        <Compass size={12} className="text-white/35 group-hover:text-white/75 transition-colors" aria-hidden />
        <span className="text-ui text-white/90 whitespace-nowrap">Focus</span>
      </button>

      {/* The ship log, one tap away, ledger facts included. */}
      {logging && (
        <Modal
          open
          onClose={() => setLogging(false)}
          title="Log a ship"
          hideTitle
          overlayClassName="bg-black/60 backdrop-blur-sm"
          className="sm:max-w-md p-4"
        >
          <div className="mb-3">
            <Eyebrow>Ship ledger</Eyebrow>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-label text-white/50">
              <span>
                {summary?.days_since_last == null
                  ? 'No ships logged yet'
                  : `${summary.days_since_last} ${summary.days_since_last === 1 ? 'day' : 'days'} since last ship`}
              </span>
              {summary?.return_rate != null && (
                <span>Return rate {summary.return_rate} {summary.return_rate === 1 ? 'day' : 'days'}</span>
              )}
            </div>
            {lastThree.length > 0 && (
              <div className="mt-2.5 flex flex-col gap-1">
                {lastThree.map(ship => (
                  <div key={ship.id} className="flex items-baseline gap-2 text-label">
                    <span className="text-white/35 w-[42px] shrink-0">
                      {new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', day: 'numeric', month: 'short' }).format(new Date(ship.occurred_at))}
                    </span>
                    <span className="text-white/60 truncate">{ship.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-3 border-t border-white/[0.06]">
            <LogShipForm
              onLogged={() => { setLogging(false); refresh() }}
              onCancel={() => setLogging(false)}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
