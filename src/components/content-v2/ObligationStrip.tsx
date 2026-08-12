import { useState } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { DecisionCard } from './DecisionCard'
import { Pending } from '../shared/Pending'

// What is actually waiting on you, above the rooms rather than inside one.
//
// This is the surviving half of the retired "This Week" room. The room framing
// was wrong twice over: it promised a weekly horizon the data did not keep
// (274 of 323 ideas had no expiry, so the room was really "everything since
// May"), and it put obligations behind a click. An obligation you have to
// navigate to is one you can forget about by staying on another tab.
//
// So obligations are ambient now. When there are none, this renders a single
// honest line rather than an empty card, because "nothing is waiting" is real
// information and worth saying.

export function ObligationStrip({ v2 }: { v2: ReturnType<typeof useContentV2> }) {
  const { brief, decisions, loading } = v2
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (d: ContentDecisionRow, fn: () => Promise<void>) => {
    setBusy(d.id)
    try { await fn() } finally { setBusy(null) }
  }

  // Never render the "nothing waiting" line while the answer is still loading:
  // a false statement that gets corrected later is worse than a spinner.
  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <Pending label="Checking what needs you" />
      </div>
    )
  }

  const hasBrief = Boolean(brief)
  if (decisions.length === 0 && !hasBrief) {
    return (
      <p className="text-[12px] text-white/40 px-1">
        Nothing is waiting on you. That is the system working, not an empty screen.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {hasBrief && (
        <button
          type="button"
          onClick={() => { if (brief) window.location.hash = `#/content?brief=${brief.week}` }}
          className="text-left rounded-xl border border-sky-400/25 bg-sky-400/[0.05] px-4 py-3 hover:bg-sky-400/[0.08] transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-sky-400/15 text-sky-300 px-2.5 py-1">Weekly brief</span>
            <span className="rounded-full bg-white/[0.06] text-white/55 px-2.5 py-1">{brief!.week}</span>
            {brief!.sections?.stance ? (
              <span className="rounded-full bg-amber-400/10 text-amber-300 px-2.5 py-1">
                {brief!.sections.stance}
              </span>
            ) : null}
          </div>
          <p className="text-[13px] text-white/80 mt-1.5">
            {brief!.title || 'This week, assembled'}
          </p>
        </button>
      )}

      {decisions.length > 0 && (
        <div className="flex flex-col gap-2">
          {decisions.map(d => (
            <DecisionCard
              key={d.id}
              decision={d}
              v2={v2}
              busy={busy === d.id}
              onAct={fn => act(d, fn)}
              onOpenBrief={() => { if (brief) window.location.hash = `#/content?brief=${brief.week}` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
