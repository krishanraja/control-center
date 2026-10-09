import { useMemo } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock } from '@/lib/icons'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { InlineActions } from '../InlineActions'
import { orgMove } from '../../lib/surfaceMoves'
import { Working } from '../shared/Working'
import type { PendingCorrection } from '../../hooks/usePendingCorrections'
import type { PendingPromotion } from '../../hooks/usePendingPromotions'
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
  /** Rung changes the weekly review proposed (ADR-030, phase 4), answered here. */
  promotions?: PendingPromotion[]
  onRulePromotion?: (p: PendingPromotion, verdict: 'accepted' | 'rejected') => Promise<boolean> | boolean
  /** The promotion whose verdict is in flight, if any. */
  rulingPromotion?: string | null
}

const RULE_BTN = 'tap-44 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-label font-semibold transition-colors disabled:opacity-50'

export function NextOrgHero({ corrections, agentCount, rulings = [], working = 0, failing = null, onReview, onOpenAgent, narrow, promotions = [], onRulePromotion, rulingPromotion = null }: Props) {
  const move = useMemo(() => orgMove({
    corrections: corrections.map(c => ({
      id: c.id, agent: c.agent_id, reason: c.pattern_reason_code,
      downvotes: Array.isArray(c.consumed_feedback_ids) ? c.consumed_feedback_ids.length : 0,
    })),
    rulings: rulings.map(r => ({ id: r.id, kind: r.kind, title: r.title, agent: r.agent, detail: r.description })),
    agentCount, working, failing,
    promotions: promotions.map(p => ({ id: p.id, surface: p.surface, label: p.label, from: p.from, to: p.to, reason: p.reason })),
  }), [corrections, rulings, agentCount, working, failing, promotions])

  const ruling = move.kind === 'ruling' ? rulings[0] : null
  const promotion = move.kind === 'promotion' ? promotions[0] : null
  // A rung change is answered right here: Approve moves the ladder (within the
  // surface's max_rung, never to autonomous), Reject keeps it proposing.
  const promotionSlot = promotion && onRulePromotion ? (
    <div className="flex flex-shrink-0 items-center gap-2" data-testid="org-move-promotion">
      <button
        type="button"
        data-testid="org-promotion-approve"
        disabled={rulingPromotion === promotion.id}
        onClick={() => { void onRulePromotion(promotion, 'accepted') }}
        className={`${RULE_BTN} border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30`}
      >
        {rulingPromotion === promotion.id ? <Working size={12} /> : null}
        Approve
      </button>
      <button
        type="button"
        data-testid="org-promotion-reject"
        disabled={rulingPromotion === promotion.id}
        onClick={() => { void onRulePromotion(promotion, 'rejected') }}
        className={`${RULE_BTN} border-white/10 text-ink-muted hover:bg-white/[0.05] hover:text-ink`}
      >
        Reject
      </button>
    </div>
  ) : undefined
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
        icon: move.kind === 'ruling' || move.kind === 'promotion' ? <Clock size={16} className="text-amber-300" />
          : move.kind === 'correction' ? <AlertTriangle size={16} className="text-amber-300" />
          : move.kind === 'failing' ? <Activity size={16} className="text-sky-300" />
          : <CheckCircle2 size={16} className="text-emerald-400/80" />,
        tone: move.tone,
        clear: move.clear,
      }}
      onAct={onAct}
      why={move.why}
      // A task ruling and a rung change are answered right here; anything
      // else opens its agent.
      actionSlot={ruling && ruling.kind === 'task'
        ? <div className="flex-shrink-0"><InlineActions taskId={ruling.id} agent={ruling.agent} /></div>
        : promotionSlot}
    />
  )
}
