import React, { useMemo, useState } from 'react'
import { ChevronRight } from '@/lib/icons'
import { SlideOver } from '../shared/SlideOver'
import { Eyebrow } from '../shared/Eyebrow'
import { Skeleton } from '../shared/Skeleton'
import { rankSignals } from '../intel/NextSignalHero'
import { SignalSheet, URGENCY_DOT, urgencyChip } from '../intel/SignalSheet'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { useSpend } from '../../hooks/useSpend'
import { useHaptics } from '../../hooks/useHaptics'
import { humanAge } from '../../lib/ageHelpers'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * The daily intel, one slide away from Home.
 *
 * Intel lives two levels deep (OS → Intel), which is the right home for its
 * charts, chat and feeds — and the wrong distance for the three things worth
 * knowing every day. This drawer carries exactly those three and nothing
 * else: Marcus's current headline, the one most urgent signal as a
 * do-this-next, and the top handful of signals ranked by urgency. Tapping a
 * signal opens the same sheet the Intel tab uses (task or bet, one tap);
 * everything heavier stays behind the one "Open Intel" row.
 *
 * Reads the canonical `useHomeIntelligence` singleton — no new channel, no
 * new parsing. Pilot rules hold: nothing here counts the operator, and no
 * chart watches him back.
 */
export function IntelDrawer({ open, onClose, onNavigate }: {
  open: boolean
  onClose: () => void
  onNavigate?: NavigateFn
}) {
  const h = useHaptics()
  const { intel, loading } = useHomeIntelligence()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  // No hero block in here: at drawer width the hero's clipped one-liner reads
  // worse than the same signal at the top of the list, where the title wraps
  // whole and the urgency chip says HIGH just as loudly.
  const list = useMemo(() => rankSignals(intel.external_signals).slice(0, 5), [intel.external_signals])

  const age = humanAge(intel.generated_at)
  const cold = loading && !intel.generated_at

  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Intel" label="Intel">
      <div className="flex flex-col gap-5">
        {cold ? (
          <div className="flex flex-col gap-2.5">
            <Skeleton h={20} w="85%" />
            <Skeleton h={44} r={12} />
            <Skeleton h={44} r={12} />
            <Skeleton h={44} r={12} />
          </div>
        ) : (
          <>
            {intel.summary?.headline && (
              <div>
                <p className="text-lede leading-snug text-white/90">{intel.summary.headline}</p>
                {age && (
                  <p className="mt-1 text-micro text-white/35">
                    {age === 'just now' ? 'Updated just now' : `Updated ${age} ago`}
                  </p>
                )}
              </div>
            )}

            {list.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="px-2 pb-1"><Eyebrow>Signals</Eyebrow></div>
                {list.map((s, i) => {
                  const chip = urgencyChip(s.urgency, s.days_until)
                  return (
                    <button
                      key={s.event_id || `${i}-${s.signal.slice(0, 24)}`}
                      type="button"
                      onClick={() => { h.select(); setOpenSignal(s) }}
                      className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                    >
                      <span
                        aria-hidden
                        className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${s.urgency ? URGENCY_DOT[s.urgency] : 'bg-white/25'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-ui leading-snug text-white/90 line-clamp-2">{s.signal}</span>
                        {s.relevance && (
                          <span className="mt-0.5 block text-label leading-snug text-white/45 line-clamp-2">{s.relevance}</span>
                        )}
                      </span>
                      {chip && (
                        <span className="shrink-0 pt-0.5 text-micro font-semibold tabular-nums text-white/50">{chip}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {list.length === 0 && !intel.summary?.headline && (
              <p className="text-body leading-relaxed text-white/45">
                Nothing new since the last read. Marcus runs Monday, Wednesday and Friday.
              </p>
            )}

            <SpendLine onGo={() => { h.select(); onClose(); onNavigate?.('os', { sub: 'intel' }) }} />

            <button
              type="button"
              onClick={() => { h.select(); onClose(); onNavigate?.('os', { sub: 'intel' }) }}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-ui font-medium text-white/85">Open Intel</span>
                <span className="mt-0.5 block text-label text-white/45">The scoreboard, Marcus's read, market signals and your bets.</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
            </button>
          </>
        )}
      </div>

      <SignalSheet signal={openSignal} onClose={() => setOpenSignal(null)} />
    </SlideOver>
  )
}

/**
 * One quiet money line above the Open Intel row: the month's burn and
 * whether any connection needs a hand. Lives in its own component so the
 * /api/spend fetch starts only when the drawer actually opens (the drawer's
 * content unmounts while closed), and renders nothing until there is a real
 * summary to show — a loading line here would outrank the signals.
 */
function SpendLine({ onGo }: { onGo: () => void }) {
  const { spend } = useSpend()
  if (!spend || spend.empty) return null
  const broken = spend.connections.broken
  const low = spend.connections.low
  const state = broken > 0
    ? `${broken} API${broken === 1 ? '' : 's'} broken`
    : low > 0
      ? `${low} running low`
      : 'connections ok'
  return (
    <button
      type="button"
      data-testid="drawer-spend-line"
      onClick={onGo}
      className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${broken > 0 ? 'bg-status-blocked' : low > 0 ? 'bg-status-needsYou' : 'bg-status-active'}`}
      />
      <span className="min-w-0 flex-1 truncate text-ui text-white/85">
        <span className="font-mono tabular-nums">${Math.round(spend.month_usd).toLocaleString('en-US')}</span>
        <span className="text-white/45"> this month · {state}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
    </button>
  )
}
