import React from 'react'
import { Bot, User } from 'lucide-react'
import type { OwnerSplit as OwnerSplitT, AgentContribution } from '../../hooks/useObjectiveTree'

// The OS-vs-you line. Answers Krish's question — "what of this can the OS do
// automatically vs what requires me?" — at a glance.
//
// Prefers the per-milestone owner_split (Marcus's explicit breakdown). Falls back
// to the objective's contributing agents when a milestone hasn't been split yet,
// so there's always an "OS drives" line even before Marcus backfills owner_split.

export function OwnerSplit({
  ownerSplit,
  contributions,
  autoPct,
  compact = false,
}: {
  ownerSplit?: OwnerSplitT | null
  contributions?: AgentContribution[]
  autoPct?: number | null
  compact?: boolean
}) {
  const os = ownerSplit?.os && ownerSplit.os.length > 0 ? ownerSplit.os : null
  const krish = ownerSplit?.krish && ownerSplit.krish.length > 0 ? ownerSplit.krish : null
  const fallbackAgents = !os && contributions && contributions.length > 0 ? contributions : null

  if (!os && !krish && !fallbackAgents && (autoPct == null)) return null

  const osText = os
    ? os.map(o => `${cap(o.agent)} (${o.does})`).join(' · ')
    : fallbackAgents
      ? fallbackAgents.map(c => cap(c.agent_id)).join(', ')
      : null

  return (
    <div className={`flex flex-col gap-1 ${compact ? 'text-[10px]' : 'text-[11px]'} leading-snug`}>
      {osText && (
        <div className="flex items-start gap-1.5">
          <Bot size={compact ? 10 : 11} className="text-emerald-300/80 mt-[1px] flex-shrink-0" />
          <span className="text-white/55">
            <span className="text-emerald-300/85 font-semibold">OS drives</span>
            {typeof autoPct === 'number' ? <span className="text-emerald-300/60"> (~{autoPct}%)</span> : null}
            : <span className="text-white/70">{osText}</span>
          </span>
        </div>
      )}
      {krish && (
        <div className="flex items-start gap-1.5">
          <User size={compact ? 10 : 11} className="text-amber-300/80 mt-[1px] flex-shrink-0" />
          <span className="text-white/55">
            <span className="text-amber-300/85 font-semibold">You</span>: <span className="text-white/70">{krish.join(' · ')}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
