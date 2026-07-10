import React, { useState, useMemo } from 'react'
import { Mail, FileText, Mic, UserPlus, Target, ShieldAlert, Sparkles, Newspaper, Inbox, AlertOctagon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../../hooks/useRealtimeDecisionsWaiting'
import { FeedCard, FeedRow, EmptyState } from '../mobile/primitives'
import { SkeletonRow } from '../shared/Skeleton'
import { DetailSheet } from '../mobile/DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { buildDecisionActions } from '../../lib/decisionActions'
import { splitDecisions, minutesToZero } from '../../lib/decisionKinds'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

const KIND_ICON: Record<DecisionRow['kind'], typeof Mail> = {
  task: Mail, guest: Mic, idea: FileText, lead: UserPlus, visibility: Target, correction: ShieldAlert, skill_proposal: Sparkles, content_decision: Newspaper, inbox_returned: Inbox, vera_gap: AlertOctagon,
}
const KIND_LABEL: Record<DecisionRow['kind'], string> = {
  task: 'Task', guest: 'Guest', idea: 'Idea', lead: 'Lead', visibility: 'Visibility', correction: 'Correction', skill_proposal: 'Skill', content_decision: 'Content call', inbox_returned: 'Returned', vera_gap: 'Persistent gap',
}
const KIND_TO_TABLE: Record<DecisionRow['kind'], string> = {
  task: 'tasks', guest: 'guests', idea: 'content_ideas', lead: 'leads', visibility: 'visibility_targets', correction: 'corrections', skill_proposal: 'skill_proposals', content_decision: 'content_decisions', inbox_returned: 'tasks_inbox', vera_gap: 'vera_gaps',
}
// Muted, from the shared token palette (not raw neon), so the legend reads as one
// calm family rather than a rainbow. Kinds still differ, just quietly.
const KIND_DOT: Record<DecisionRow['kind'], string> = {
  task: 'bg-pod-growth', guest: 'bg-status-blocked', idea: 'bg-status-needsYou',
  lead: 'bg-status-active', visibility: 'bg-pod-ops', correction: 'bg-status-blocked', skill_proposal: 'bg-pod-growth', content_decision: 'bg-status-needsYou', inbox_returned: 'bg-pod-growth', vera_gap: 'bg-status-blocked',
}
/**
 * "Your decisions" is the finishable anchor of Home. The count includes ONLY
 * typed, only-Krish rulings (splitDecisions); pipeline pools surface as queue
 * chips that open each tab's triage deck instead of inflating the number.
 * Tapping a row opens a DetailSheet whose buttons are the row's kind-correct
 * one-tap actions (promote / draft email / confirm / greenlight / apply /
 * close concept ...) via the shared buildDecisionActions registry, with
 * haptic + toast confirmation. The full inbox lives on Today.
 */
export function DecisionsInbox({
  onNavigate,
  limit = 6,
}: {
  onNavigate?: NavigateFn
  limit?: number
}) {
  const { decisions: allRows, loading } = useRealtimeDecisionsWaiting()
  const { toast } = useToast()
  const h = useHaptics()

  const [open, setOpen] = useState<DecisionRow | null>(null)
  const [resolved, setResolved] = useState<Record<string, any> | null>(null)

  // Q1 split: rows the badge counts (typed rulings) vs pipeline pools that
  // batch-review in their own tab's triage deck. Filter per-consumer; the
  // hook's module cache stays unfiltered for every other reader.
  const { decisions, queues } = useMemo(() => splitDecisions(allRows), [allRows])

  const visible = decisions.slice(0, limit)
  const toZero = minutesToZero(decisions)

  const select = async (d: DecisionRow) => {
    h.select()
    // Seed the sheet from the row immediately; hydrate with the full source row
    // so field-gated actions (email, concept_id, deep_enriched_at) are accurate.
    setResolved({ ...d.meta, id: d.id, agent: d.agent, status: d.status, title: d.title, description: d.description })
    setOpen(d)
    const { data } = await supabase
      .from(KIND_TO_TABLE[d.kind])
      .select('*')
      .eq('id', d.id)
      .maybeSingle()
    if (data) setResolved({ ...(data as Record<string, any>), agent: d.agent })
  }

  const close = () => { setOpen(null); setResolved(null) }

  const actions = open && resolved
    ? buildDecisionActions(open.kind, resolved, {
        navigate: onNavigate,
        toast,
        haptics: h,
        onDone: close,
      })
    : []

  return (
    <section id="decisions-inbox" className="scroll-mt-4">
      <FeedCard
        title={`Your decisions · ${decisions.length}`}
        action={decisions.length > 0 ? (
          // The finishable cue: this list is a sitting, not a state of being.
          <span className="text-[11px] text-emerald-300/80 tabular-nums whitespace-nowrap">
            about {toZero} {toZero === 1 ? 'minute' : 'minutes'} to zero
          </span>
        ) : undefined}
      >
        {/* QUEUES: pipeline pools with their own rhythm. Always visible, even
            at decision zero, so batch work stays reachable without inflating
            the decision count. */}
        {queues.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 py-3">
            {queues.map(q => (
              <button
                key={q.kind}
                type="button"
                onClick={() => { h.tap(); onNavigate?.(q.tab) }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.07] hover:text-white/90 transition-colors"
                title={`Open the ${q.label} triage deck`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${KIND_DOT[q.kind]}`} />
                <span>{q.label}</span>
                <span className="tabular-nums font-semibold text-white/85">{q.count}</span>
                <span className="text-white/40">· triage deck</span>
              </button>
            ))}
          </div>
        )}
        {loading && decisions.length === 0 ? (
          // Promise the exact shape that's about to arrive: feed rows, not a
          // "Loading" line, so the inbox settles into live data.
          <div className="divide-y divide-white/[0.06]" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState label="Nothing is waiting on you. That is the system working." />
        ) : (
          visible.map(d => {
            const Icon = KIND_ICON[d.kind] || Mail
            const priorityChip =
              d.priority === 'overdue' ? 'Overdue'
              : d.priority === 'urgent' ? 'Urgent'
              : d.priority === 'high' ? 'High'
              : null
            return (
              <FeedRow
                key={`${d.kind}-${d.id}`}
                dotColor={KIND_DOT[d.kind]}
                title={d.title}
                detail={d.description ?? undefined}
                onClick={() => select(d)}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-white/45">
                      <Icon size={11} /> {KIND_LABEL[d.kind]}
                    </span>
                    {priorityChip && (
                      <span className={`text-[10px] uppercase tracking-[0.1em] ${d.priority === 'overdue' || d.priority === 'high' ? 'text-status-blocked' : 'text-status-needsYou'}`}>
                        {priorityChip}
                      </span>
                    )}
                  </div>
                }
              />
            )
          })
        )}
      </FeedCard>

      <DetailSheet
        open={open != null}
        onClose={close}
        eyebrow={open ? KIND_LABEL[open.kind] : ''}
        title={open?.title || ''}
        agent={resolved?.agent || open?.agent}
        status={resolved?.status || open?.status}
        body={composeBody(resolved)}
        actions={actions}
      />
    </section>
  )
}

function composeBody(row: Record<string, any> | null): string | undefined {
  if (!row) return undefined
  const parts = [
    row.description || row.why_relevant || row.thesis || row.notes || null,
    row.primary_tension ? `Tension: ${row.primary_tension}` : null,
    row.next_step ? `Next step: ${row.next_step}` : null,
    row.pitch_draft ? `Pitch: ${row.pitch_draft}` : null,
    row.angle ? `Angle: ${row.angle}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join('\n\n') : undefined
}
