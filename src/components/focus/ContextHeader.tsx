import React from 'react'
import { Sun } from '@/lib/icons'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'

// CONTEXT phase of the daily spine. A compact three-line frame drawn from
// Marcus's daily brief, sitting directly above the commit picker. Priming +
// chunking + anchoring: read the bet, the customer, and the anti-action,
// anchored by yesterday's MRR delta, then pick your 3. Renders only when a
// brief exists; otherwise the picker leads.
export function ContextHeader() {
  const { intel } = useHomeIntelligence()
  const brief = intel.daily_brief
  if (!brief) return null

  const delta = brief.yesterday_mrr_delta_usd ?? 0
  const deltaColor = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-white/55'

  return (
    <section
      className="tab-content rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 min-w-0"
      aria-label="Today's frame from Marcus"
    >
      <header className="flex items-center gap-2 mb-2">
        <Sun size={13} className="text-violet-300 flex-shrink-0" />
        <h2 className="text-micro font-bold uppercase tracking-[0.14em] text-white/55">
          Before you pick, the frame
        </h2>
        {delta !== 0 && (
          <span className={`ml-auto text-label font-semibold tabular-nums ${deltaColor}`}>
            {delta > 0 ? '+' : ''}${Math.round(delta).toLocaleString()} MRR
          </span>
        )}
      </header>
      <div className="space-y-1">
        {brief.one_bet && (
          <p className="text-label text-white/80 leading-snug break-words">
            <span className="text-violet-300/80 font-semibold">Bet · </span>{brief.one_bet}
          </p>
        )}
        {brief.one_customer && (
          <p className="text-label text-white/80 leading-snug break-words">
            <span className="text-emerald-300/80 font-semibold">Talk to · </span>{brief.one_customer}
          </p>
        )}
        {brief.one_anti_action && (
          <p className="text-label text-red-200/75 leading-snug break-words">
            <span className="text-red-300/80 font-semibold">Don't · </span>{brief.one_anti_action}
          </p>
        )}
        {!brief.one_bet && brief.body && (
          <p className="text-label text-white/70 leading-snug whitespace-pre-wrap break-words">
            {brief.body}
          </p>
        )}
      </div>
    </section>
  )
}
