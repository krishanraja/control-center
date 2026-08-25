import React, { useMemo, useState } from 'react'
import { ChevronRight, Radar } from '@/lib/icons'
import { rankSignals, SignalSheet, URGENCY_DOT, urgencyChip } from '../intel/SignalSheet'
import { SignalsDrawer } from './SignalsDrawer'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { useHaptics } from '../../hooks/useHaptics'

const FRESH_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CARDS = 4

/**
 * External market intelligence on Home: present only when it has earned the
 * glass. When Marcus's digest is fresh and carries a high or critical
 * signal, this renders one swipeable row of cards — tap a card to act on it
 * (the same task-or-bet sheet as everywhere), or open the full condensed
 * feed in the signals drawer from the last card. A quiet week renders
 * nothing at all: the same conditional-presence contract as the critical
 * alert banner, because a dormant feed does not get to spend the canon's
 * space. Internal business intelligence lives on OS → Intel; these two head
 * spaces never share a surface.
 */
export function SignalCards() {
  const h = useHaptics()
  const { intel } = useHomeIntelligence()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const ranked = useMemo(() => rankSignals(intel.external_signals), [intel.external_signals])

  const fresh = intel.generated_at != null
    && Date.now() - Date.parse(intel.generated_at) < FRESH_MS
  const hot = ranked.filter(s => s.urgency === 'critical' || s.urgency === 'high')

  if (!fresh || hot.length === 0) return null

  return (
    <>
      <div
        role="region"
        aria-label="Fresh market signals"
        data-testid="signal-cards"
        className="flex shrink-0 snap-x snap-mandatory gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1"
      >
        {hot.slice(0, MAX_CARDS).map((s, i) => {
          const chip = urgencyChip(s.urgency, s.days_until)
          return (
            <button
              key={s.event_id || `${i}-${s.signal.slice(0, 24)}`}
              type="button"
              onClick={() => { h.select(); setOpenSignal(s) }}
              className="flex w-[82%] max-w-[320px] shrink-0 snap-start items-start gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.99]"
            >
              <span
                aria-hidden
                className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${s.urgency ? URGENCY_DOT[s.urgency] : 'bg-amber-400'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-label leading-snug text-white/85 line-clamp-2">{s.signal}</span>
                {chip && (
                  <span className="mt-0.5 block text-micro font-semibold tabular-nums text-white/40">{chip}</span>
                )}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          data-testid="signal-cards-all"
          onClick={() => { h.select(); setDrawerOpen(true) }}
          className="flex w-auto shrink-0 snap-start items-center gap-2 self-stretch rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 text-left transition-colors hover:bg-white/[0.05]"
        >
          <Radar size={13} className="shrink-0 text-white/40" aria-hidden />
          <span className="whitespace-nowrap text-label font-medium text-white/70">All signals</span>
          <ChevronRight size={13} className="shrink-0 text-white/30" aria-hidden />
        </button>
      </div>

      <SignalSheet signal={openSignal} onClose={() => setOpenSignal(null)} />
      <SignalsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
