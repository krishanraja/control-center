import React from 'react'
import { SlideOver } from '../shared/SlideOver'
import { Eyebrow } from '../shared/Eyebrow'
import { useVentureRegistry } from '../../hooks/useVentureRegistry'
import { appDisplayLabel, appHealth, HEALTH_DOT, HEALTH_LABEL } from './FleetFunnelPanel'
import type { FleetFunnel } from '../../hooks/useFleetFunnel'

const dollars = (cents: number): string => `$${Math.round((cents || 0) / 100).toLocaleString('en-US')}`

/**
 * The funnel drill behind the KPI band's tile: per app, this week's window
 * (the tile's number) next to the all-time funnel, revenue and emit-health.
 * App labels come from venture_registry — the fleet list is data, not a
 * literal.
 */
export function FunnelSheet({ open, onClose, funnel }: {
  open: boolean
  onClose: () => void
  funnel: FleetFunnel | null
}) {
  const { ventures } = useVentureRegistry()
  const rows = funnel?.byApp || []

  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Funnel detail" label="Funnel · 7d">
      <div className="flex flex-col gap-5" data-testid="funnel-detail">
        {rows.length === 0 ? (
          <p className="text-body leading-relaxed text-white/45">
            No attributed traffic read yet. The Fleet funnel section shows which
            apps are wired to emit.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="px-1 pb-1"><Eyebrow>This week, by app</Eyebrow></div>
            {rows.map(r => {
              const health = appHealth(r)
              return (
                <div key={r.app} className="flex flex-col gap-1 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[health]}`} title={HEALTH_LABEL[health]} />
                    <span className="min-w-0 flex-1 truncate text-ui font-medium text-white/85">
                      {appDisplayLabel(r.app, ventures)}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-ui text-white/85">
                      {r.landed_7d.toLocaleString('en-US')}
                      <span className="text-white/40"> landed</span>
                    </span>
                  </div>
                  <p className="pl-[16px] text-label leading-snug text-white/40">
                    {r.purchased_7d > 0
                      ? `${r.purchased_7d} bought this week. `
                      : 'Nobody bought this week. '}
                    All time: {r.landed.toLocaleString('en-US')} landed → {r.purchased} bought, {dollars(r.gross_cents)} gross.
                  </p>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-label leading-relaxed text-white/35">
          Campaigns and emit-health live in the Fleet funnel section on the tab.
        </p>
      </div>
    </SlideOver>
  )
}
