import type { DecisionRow } from '../hooks/useRealtimeDecisionsWaiting'

// Wave 2, rule Q1 (locked 2026-07-10): the "Your decisions" badge counts ONLY
// typed, only-Krish rulings. Pipeline pools are QUEUES: batch work with its own
// rhythm, opened via each tab's triage deck, never inflating the number.
// This is what makes O-1 ("decisions_waiting under 10") a real, finishable
// contract instead of a 171-row fiction.

export const DECISION_KINDS: DecisionRow['kind'][] = [
  'content_decision', // the weekly content queue (brief, shifts, graduations)
  'correction',       // Vera's learning-loop approvals
  'skill_proposal',   // induced skills awaiting adoption
  'task',             // sign-offs and unblocks routed to Krish
  'idea',             // pieces in review awaiting his read (non-pool, review-only)
  'inbox_returned',   // tasks_inbox items that came back needing him
  'vera_gap',         // persistent gaps escalated after 2+ cycles
  'sequence_approval', // a proposed nurture/frame sequence — one strategic ruling
] as const

export const QUEUE_KINDS: Array<{ kind: DecisionRow['kind']; label: string; tab: string }> = [
  { kind: 'lead', label: 'Pipeline', tab: 'leads' },
  { kind: 'visibility', label: 'Visibility', tab: 'guests' },
  { kind: 'guest', label: 'Guests', tab: 'guests' },
  // Queued nurture sends are batch work with their own rhythm (L1 all sends,
  // L2 1-in-10 samples) — a queue chip into the Growth deck, never badge noise.
  { kind: 'send_sample', label: 'Sends', tab: 'acquisition' },
]

const DECISION_SET = new Set<string>(DECISION_KINDS)
const QUEUE_SET = new Set<string>(QUEUE_KINDS.map(q => q.kind))

export interface SplitDecisions {
  decisions: DecisionRow[]
  queues: Array<{ kind: DecisionRow['kind']; label: string; tab: string; count: number }>
}

export function splitDecisions(rows: DecisionRow[]): SplitDecisions {
  const decisions = rows.filter(r => DECISION_SET.has(r.kind))
  const counts = new Map<string, number>()
  for (const r of rows) if (QUEUE_SET.has(r.kind)) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
  const queues = QUEUE_KINDS
    .map(q => ({ ...q, count: counts.get(q.kind) ?? 0 }))
    .filter(q => q.count > 0)
  return { decisions, queues }
}

// "About N minutes to zero": a sitting, not a state of being. Rulings with
// inline actions run ~30-45s; ones that open a surface (brief, task detail)
// run longer. Deliberately coarse; floor of 1 so a non-empty queue never
// claims zero minutes.
const HEAVY_KINDS = new Set<string>(['idea', 'inbox_returned'])
export function minutesToZero(decisions: DecisionRow[]): number {
  if (!decisions.length) return 0
  const mins = decisions.reduce((acc, d) => {
    if (d.kind === 'content_decision' && (d.meta as Record<string, unknown>)?.decision_kind === 'brief_review') return acc + 5
    return acc + (HEAVY_KINDS.has(d.kind) ? 2 : 0.75)
  }, 0)
  return Math.max(1, Math.round(mins))
}
