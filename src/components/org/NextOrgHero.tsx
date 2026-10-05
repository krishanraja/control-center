import { useMemo } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock } from '@/lib/icons'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { InlineActions } from '../InlineActions'
import { orgMove } from '../../lib/surfaceMoves'
import type { PendingCorrection } from '../../hooks/usePendingCorrections'
import type { DecisionRow } from '../../hooks/useRealtimeDecisionsWaiting'

// Org's one move (rules in src/lib/surfaceMoves.ts `orgMove`).
//
// Since the OS Queue was removed (2026-10-04), every ruling an agent is waiting
// on routes here (src/lib/routeDecision.ts sends task, returned-capture and
// persistent-gap rulings to OS > Org), but the tab never showed them: Home's
// waiting count pointed at a page that led with Vera's brief corrections and
// "Roster is tight". The hero now leads with the ruling, answers a task ruling
// in place (Approve / Reject, the verdict lands where the press was), then a
// correction, then the agent whose runs fail most.

/** The ruling kinds that live on OS > Org (routeDecision). */
export const ORG_RULING_KINDS = new Set(['task', 'inbox_returned', 'vera_gap'])

export function orgRulings(waiting: DecisionRow[]): DecisionRow[] {
  return waiting.filter(d => ORG_RULING_KINDS.has(d.kind))
}

interface Props {
  corrections: PendingCorrection[]
  agentCount: number
  /** Fresh rulings owned by an agent (`orgRulings(useWaitingDecisions().waiting)`). */
  rulings?: DecisionRow[]
  /** Agents with open work right now. */
  working?: number
  failing?: { agent: string; errors: number; of: number } | null
  onReview?: (correction: PendingCorrection) => void
  /** Select an agent by id or name (its page holds the work). */
  onOpenAgent?: (agent: string) => void
  narrow?: boolean
}

export function NextOrgHero({ corrections, agentCount, rulings = [], working = 0, failing = null, onReview, onOpenAgent, narrow }: Props) {
  const move = useMemo(() => orgMove({
    corrections: corrections.map(c => ({
      id: c.id, agent: c.agent_id, reason: c.pattern_reason_code,
      downvotes: Array.isArray(c.consumed_feedback_ids) ? c.consumed_feedback_ids.length : 0,
    })),
    rulings: rulings.map(r => ({ id: r.id, kind: r.kind, title: r.title, agent: r.agent, detail: r.description })),
    agentCount, working, failing,
  }), [corrections, rulings, agentCount, working, failing])

  const ruling = move.kind === 'ruling' ? rulings[0] : null
  const onAct = move.kind === 'correction' ? () => corrections[0] && onReview?.(corrections[0])
    : move.kind === 'ruling' ? () => ruling && onOpenAgent?.(ruling.agent)
    : move.kind === 'failing' ? () => failing && onOpenAgent?.(failing.agent)
    : undefined

  return (
    <DoThisNextHero
      testId="org-move"
      stackAction={narrow}
      narrow={narrow}
      descriptor={{
        headline: move.headline,
        sub: move.sub,
        actionLabel: move.actionLabel,
        icon: move.kind === 'ruling' ? <Clock size={16} className="text-amber-300" />
          : move.kind === 'correction' ? <AlertTriangle size={16} className="text-amber-300" />
          : move.kind === 'failing' ? <Activity size={16} className="text-sky-300" />
          : <CheckCircle2 size={16} className="text-emerald-400/80" />,
        tone: move.tone,
        clear: move.clear,
      }}
      onAct={onAct}
      why={move.why}
      // A task ruling is answered right here; anything else opens its agent.
      actionSlot={ruling && ruling.kind === 'task'
        ? <div className="flex-shrink-0"><InlineActions taskId={ruling.id} agent={ruling.agent} /></div>
        : undefined}
    />
  )
}
