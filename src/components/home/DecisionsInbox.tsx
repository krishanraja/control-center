import React, { useState, useMemo } from 'react'
import { Mail, FileText, Mic, UserPlus, Target, ShieldAlert, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../../hooks/useRealtimeDecisionsWaiting'
import { FeedCard, FeedRow, EmptyState } from '../mobile/primitives'
import { DetailSheet } from '../mobile/DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { buildDecisionActions } from '../../lib/decisionActions'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

const KIND_ICON: Record<DecisionRow['kind'], typeof Mail> = {
  task: Mail, guest: Mic, idea: FileText, lead: UserPlus, visibility: Target, correction: ShieldAlert, skill_proposal: Sparkles,
}
const KIND_LABEL: Record<DecisionRow['kind'], string> = {
  task: 'Task', guest: 'Guest', idea: 'Idea', lead: 'Lead', visibility: 'Visibility', correction: 'Correction', skill_proposal: 'Skill',
}
const KIND_TO_TABLE: Record<DecisionRow['kind'], string> = {
  task: 'tasks', guest: 'guests', idea: 'content_ideas', lead: 'leads', visibility: 'visibility_targets', correction: 'corrections', skill_proposal: 'skill_proposals',
}
const KIND_DOT: Record<DecisionRow['kind'], string> = {
  task: 'bg-violet-400', guest: 'bg-rose-400', idea: 'bg-rose-300',
  lead: 'bg-emerald-400', visibility: 'bg-amber-400', correction: 'bg-red-400', skill_proposal: 'bg-violet-400',
}
// Which tab's focused queue each kind batch-reviews into.
const KIND_TO_TAB: Record<DecisionRow['kind'], string> = {
  task: 'today', guest: 'guests', idea: 'content', lead: 'leads', visibility: 'guests', correction: 'org', skill_proposal: 'org',
}
const KIND_LABEL_PLURAL: Record<DecisionRow['kind'], string> = {
  task: 'Tasks', guest: 'Guests', idea: 'Ideas', lead: 'Leads', visibility: 'Visibility', correction: 'Corrections', skill_proposal: 'Skills',
}

/**
 * "Waiting on you" — the action centerpiece of Home. Lists the highest-priority
 * decisions_waiting rows; tapping one opens a DetailSheet whose buttons are the
 * row's kind-correct one-tap actions (promote / draft email / confirm /
 * greenlight / apply / close concept …) via the shared buildDecisionActions
 * registry, with haptic + toast confirmation. The full inbox lives on Today.
 */
export function DecisionsInbox({
  onNavigate,
  limit = 6,
}: {
  onNavigate?: NavigateFn
  limit?: number
}) {
  const { decisions, loading } = useRealtimeDecisionsWaiting()
  const { toast } = useToast()
  const h = useHaptics()

  const [open, setOpen] = useState<DecisionRow | null>(null)
  const [resolved, setResolved] = useState<Record<string, any> | null>(null)

  const visible = decisions.slice(0, limit)
  const more = Math.max(0, decisions.length - visible.length)

  // Composition of the whole queue by kind, biggest first. The visible top-N is
  // priority-sorted and tends to be monotone (one kind dominates), which hides
  // how much of everything else is waiting — these chips restore that picture
  // and double as a one-tap batch-review entry into each kind's queue.
  const kindCounts = useMemo(() => {
    const counts = new Map<DecisionRow['kind'], number>()
    for (const d of decisions) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1)
    return [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
  }, [decisions])

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
      <FeedCard title={`Waiting on you · ${decisions.length}`}>
        {loading && decisions.length === 0 ? (
          <EmptyState label="Loading…" />
        ) : visible.length === 0 ? (
          <EmptyState label="Inbox zero. Nothing waiting on you." />
        ) : (
          <>
            {kindCounts.length > 1 && (
              <div className="flex flex-wrap gap-1.5 px-1 pb-2.5 mb-1 border-b border-white/[0.05]">
                {kindCounts.map(({ kind, count }) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => { h.tap(); onNavigate?.(KIND_TO_TAB[kind]) }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.07] hover:text-white/90 transition-colors"
                    title={`Review ${count} ${count === 1 ? KIND_LABEL[kind] : KIND_LABEL_PLURAL[kind]}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${KIND_DOT[kind]}`} />
                    <span className="tabular-nums font-semibold text-white/85">{count}</span>
                    {count === 1 ? KIND_LABEL[kind] : KIND_LABEL_PLURAL[kind]}
                  </button>
                ))}
              </div>
            )}
            {visible.map(d => {
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
                        <span className={`text-[10px] uppercase tracking-[0.1em] ${d.priority === 'overdue' || d.priority === 'high' ? 'text-rose-300' : 'text-amber-300'}`}>
                          {priorityChip}
                        </span>
                      )}
                    </div>
                  }
                />
              )
            })}
            {more > 0 && (
              <button
                type="button"
                onClick={() => { h.tap(); onNavigate?.('triage') }}
                className="w-full text-center py-3 text-[13px] text-violet-300/80 active:text-violet-200"
              >
                +{more} more in Triage
              </button>
            )}
          </>
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
