import { Mail, FileText, Mic, UserPlus, Target, ShieldAlert, Sparkles, Newspaper, Inbox, AlertOctagon, Layers, MailCheck, TrendingDown } from 'lucide-react'
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
  'growth_stall',     // a growth line flatlined; 3 drafted moves attached
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
// Kind presentation maps, shared by the Home DecisionsInbox and the
// clear-the-queue DecisionDeck so a kind renders identically in both.
export const KIND_ICON: Record<DecisionRow['kind'], typeof Mail> = {
  task: Mail, guest: Mic, idea: FileText, lead: UserPlus, visibility: Target, correction: ShieldAlert, skill_proposal: Sparkles, content_decision: Newspaper, inbox_returned: Inbox, vera_gap: AlertOctagon, sequence_approval: Layers, send_sample: MailCheck, growth_stall: TrendingDown,
}
export const KIND_LABEL: Record<DecisionRow['kind'], string> = {
  task: 'Task', guest: 'Guest', idea: 'Idea', lead: 'Lead', visibility: 'Visibility', correction: 'Correction', skill_proposal: 'Skill', content_decision: 'Content call', inbox_returned: 'Returned', vera_gap: 'Persistent gap', sequence_approval: 'Sequence', send_sample: 'Send', growth_stall: 'Stall',
}
export const KIND_TO_TABLE: Record<DecisionRow['kind'], string> = {
  task: 'tasks', guest: 'guests', idea: 'content_ideas', lead: 'leads', visibility: 'visibility_targets', correction: 'corrections', skill_proposal: 'skill_proposals', content_decision: 'content_decisions', inbox_returned: 'tasks_inbox', vera_gap: 'vera_gaps', sequence_approval: 'acquisition_sequences', send_sample: 'acquisition_sends', growth_stall: 'growth_stalls',
}
// Muted, from the shared token palette (not raw neon), so the legend reads as
// one calm family rather than a rainbow. Kinds still differ, just quietly.
export const KIND_DOT: Record<DecisionRow['kind'], string> = {
  task: 'bg-pod-growth', guest: 'bg-status-blocked', idea: 'bg-status-needsYou',
  lead: 'bg-status-active', visibility: 'bg-pod-ops', correction: 'bg-status-blocked', skill_proposal: 'bg-pod-growth', content_decision: 'bg-status-needsYou', inbox_returned: 'bg-pod-growth', vera_gap: 'bg-status-blocked',
  sequence_approval: 'bg-pod-growth', send_sample: 'bg-status-needsYou', growth_stall: 'bg-status-blocked',
}

const HEAVY_KINDS = new Set<string>(['idea', 'inbox_returned'])
export function minutesToZero(decisions: DecisionRow[]): number {
  if (!decisions.length) return 0
  const mins = decisions.reduce((acc, d) => {
    if (d.kind === 'content_decision' && (d.meta as Record<string, unknown>)?.decision_kind === 'brief_review') return acc + 5
    return acc + (HEAVY_KINDS.has(d.kind) ? 2 : 0.75)
  }, 0)
  return Math.max(1, Math.round(mins))
}
