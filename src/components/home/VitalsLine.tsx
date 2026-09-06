import React, { useState } from 'react'
import { ArrowRight } from '@/lib/icons'
import { useScorecard, type ScorecardCol } from '../../hooks/useScorecard'
import { useShipSummary } from '../../hooks/usePilot'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { splitDecisions } from '../../lib/decisionKinds'
import { useHaptics } from '../../hooks/useHaptics'
import { Modal } from '../shared/Modal'
import { SlideOver } from '../shared/SlideOver'
import { Skeleton } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { LogShipForm } from '../pilot/LogShipForm'
import { Eyebrow } from '../shared/Eyebrow'
import { ScorecardPanel } from './ScorecardPanel'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * The one quiet line on Home is now the scorecard (job 2, keep him honest):
 * totals to date over the day 90 target for approaches sent, calls taken,
 * paid rooms and pieces published, then the current week's unasked build
 * hours, then the one-tap Log and the decisions waiting. MRR left this line
 * for Growth and Subscriptions: under the ikigai the number Home has to keep
 * in front of him is how many people he approached, not the run rate.
 *
 * Full (desktop) shows all five cells; compact (phone) shows Sent and Paid,
 * because the band shares a row with the identity mark and must never wrap. Every scorecard cell opens the twelve week table (ScorecardPanel)
 * in a SlideOver.
 *
 * Rendering is NEUTRAL unconditionally, carried over from the ship ledger
 * (docs/PILOT-LAYER.md). There is no branch anywhere in this file that
 * changes colour, weight, or copy based on how any number looks: 0/25 renders
 * exactly as calmly as 25/25, and 6h unasked exactly as calmly as 0h. The
 * scorecard's job is to keep him honest, and a line that flinches at a bad
 * week teaches him to stop looking at it. Do not add one.
 *
 * Unasked hours are an estimate from commits and the panel says so; the line
 * keeps the 'h' and nothing else.
 */
export function VitalsLine({ onNavigate, compact = false }: { onNavigate?: NavigateFn; compact?: boolean }) {
  const { current, targets, totals, loading: cardLoading, refresh: refreshCard } = useScorecard()
  const { summary, refresh } = useShipSummary()
  const { decisions } = useRealtimeDecisionsWaiting()
  const waiting = splitDecisions(decisions).decisions.length
  const h = useHaptics()
  const [logging, setLogging] = useState(false)
  const [panel, setPanel] = useState(false)
  const showBars = useDeferredPending(cardLoading)

  const lastThree = summary?.last_ten.slice(0, 3) ?? []

  const ratio = (col: ScorecardCol) => `${totals[col]}/${targets[col]}`
  const cells: { key: ScorecardCol; label: string; value: string; full: boolean }[] = [
    { key: 'approaches_sent', label: 'Sent', value: ratio('approaches_sent'), full: false },
    { key: 'calls_taken', label: 'Calls', value: ratio('calls_taken'), full: true },
    { key: 'paid_rooms', label: 'Paid', value: ratio('paid_rooms'), full: false },
    { key: 'pieces_published', label: 'Published', value: ratio('pieces_published'), full: true },
    // Unasked hours stay off the phone band: with the identity mark beside it
    // the band has under 240px, and a fifth cell forced it to scroll. The
    // number is one tap away in the panel, and the tripwire has the banner.
    { key: 'unasked_hours', label: 'Unasked', value: `${current?.unasked_hours ?? 0}h`, full: true },
  ]
  const shown = compact ? cells.filter(c => !c.full) : cells

  const openPanel = () => { h.select(); setPanel(true) }

  return (
    // Compact (phone) is a fixed band that can NEVER wrap: wrapping is exactly
    // how an earlier fourth item ended up alone on a second line. Every cell is
    // nowrap. The band shares its row with the identity mark, which leaves it
    // under 240px on a phone, so it scrolls sideways (scrollbar hidden) rather
    // than clipping the Waiting cell out of reach or folding. Vertical
    // overflow stays at zero, which is what the home-noscroll spec pins.
    <div className={`flex items-center ${compact ? 'flex-nowrap gap-x-2 min-h-[28px] overflow-x-auto overflow-y-hidden scrollbar-hide' : 'flex-nowrap gap-x-4 min-h-[34px]'}`}>
      {shown.map((c, i) => (
        <React.Fragment key={c.key}>
          {!compact && i > 0 && <span className="w-px h-3.5 bg-white/[0.08] shrink-0" aria-hidden />}
          <button
            type="button"
            onClick={openPanel}
            aria-label={`${c.label} ${c.value}, open the scorecard`}
            className={`inline-flex items-baseline min-w-0 shrink-0 whitespace-nowrap ${compact ? 'gap-1' : 'gap-2'}`}
          >
            <Eyebrow>{c.label}</Eyebrow>
            {cardLoading
              ? <Skeleton quiet={!showBars} h={14} w={compact ? 28 : 40} r={4} />
              : <span className={`font-mono tabular-nums ${compact ? 'text-label' : 'text-ui'} text-white/90 whitespace-nowrap`}>{c.value}</span>}
          </button>
        </React.Fragment>
      ))}

      {!compact && <span className="w-px h-3.5 bg-white/[0.08] shrink-0" aria-hidden />}

      {/* The ship log, one tap. The ledger facts live inside the modal. */}
      <button
        type="button"
        onClick={() => { h.tap(); setLogging(true) }}
        className={`shrink-0 min-h-[28px] ${compact ? 'px-1.5' : 'px-2'} rounded-md text-micro text-white/55 hover:text-white/90 border border-white/[0.08] hover:border-white/20 transition-colors`}
      >
        Log
      </button>

      {!compact && <span className="w-px h-3.5 bg-white/[0.08] shrink-0" aria-hidden />}

      {/* The queue count. The list itself lives on OS, Queue. */}
      <button
        type="button"
        data-testid="vitals-waiting"
        onClick={() => { h.select(); onNavigate?.('os', { sub: 'queue' }) }}
        className={`inline-flex items-baseline min-w-0 shrink-0 whitespace-nowrap group ${compact ? 'gap-1' : 'gap-2'}`}
      >
        <Eyebrow>Waiting</Eyebrow>
        <span className={`font-mono tabular-nums ${compact ? 'text-label' : 'text-ui'} text-white/90 whitespace-nowrap inline-flex items-center gap-1`}>
          {waiting}
          <ArrowRight size={12} className="text-white/35 group-hover:text-white/75 transition-colors" />
        </span>
      </button>

      {/* The twelve week table, one tap from any cell. */}
      <SlideOver open={panel} onClose={() => setPanel(false)} ariaLabel="Scorecard" label="Scorecard">
        {panel && <ScorecardPanel />}
      </SlideOver>

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
              {summary != null && (
                <span>{summary.this_week} this week</span>
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
              onLogged={() => { setLogging(false); refresh(); refreshCard() }}
              onCancel={() => setLogging(false)}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
