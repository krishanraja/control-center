import React, { useState, useMemo, useEffect } from 'react'
import { Mail, Layers as DeckIcon, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../../hooks/useRealtimeDecisionsWaiting'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { FeedCard, FeedRow, EmptyState } from '../mobile/primitives'
import { SkeletonRow } from '../shared/Skeleton'
import { DetailSheet } from '../mobile/DetailSheet'
import { BackburnerSection } from '../shared/BackburnerSection'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { buildDecisionActions } from '../../lib/decisionActions'
import {
  splitDecisions, minutesToZero,
  KIND_ICON, KIND_LABEL, KIND_TO_TABLE, KIND_DOT,
} from '../../lib/decisionKinds'
import { splitTaskQueue, STALE_DAYS } from '../../lib/taskQueue'
import { DecisionDeck } from './DecisionDeck'
import { useRulingPrompts } from './RulingPrompts'
import { isSimplifiedIA } from '../../lib/iaV3'
import { WhyBadge } from '../shared/WhyBadge'
import { whyForDecision } from '../../lib/servedSurfaces'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * "Your decisions" is the finishable anchor of Home. The count includes ONLY
 * typed, only-Krish rulings (splitDecisions); pipeline pools surface as queue
 * chips that open each tab's triage deck instead of inflating the number.
 * Tapping a row opens a DetailSheet whose buttons are the row's kind-correct
 * one-tap actions via the shared buildDecisionActions registry (now including
 * the old Today verbs: approve / send back with a note / defer). "Clear the
 * queue" opens the one-card DecisionDeck for a full sitting. The stale tail
 * and backburner (formerly Today's folds) collapse below.
 */
export function DecisionsInbox({
  onNavigate,
  limit = 5,
  deepTask = null,
  deepDecision = null,
}: {
  onNavigate?: NavigateFn
  limit?: number
  /** Deep-linked task id (legacy #/today?task=...) — opens the deck seeded to it. */
  deepTask?: string | null
  /** Deep-linked decision ref (legacy #/today?decision=kind:id). */
  deepDecision?: string | null
}) {
  const { decisions: allRows, loading } = useRealtimeDecisionsWaiting()
  const { toast } = useToast()
  const h = useHaptics()
  const { promptNote, promptDefer, overlay } = useRulingPrompts()

  const [open, setOpen] = useState<DecisionRow | null>(null)
  const [resolved, setResolved] = useState<Record<string, any> | null>(null)
  const [deckOpen, setDeckOpen] = useState(false)
  const [deckSeed, setDeckSeed] = useState<string | null>(null)
  const [narrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)

  // Legacy Today deep links land here under the simplified IA: seed the deck
  // to the referenced row so the old bookmark still opens the right ruling.
  useEffect(() => {
    const seed = deepTask || (deepDecision ? deepDecision.split(':').pop() || null : null)
    if (seed) { setDeckSeed(seed); setDeckOpen(true) }
  }, [deepTask, deepDecision])

  // Q1 split: rows the badge counts (typed rulings) vs pipeline pools that
  // batch-review in their own tab's triage deck. Filter per-consumer; the
  // hook's module cache stays unfiltered for every other reader.
  const { decisions, queues } = useMemo(() => splitDecisions(allRows), [allRows])

  const visible = decisions.slice(0, limit)
  const overflow = Math.max(0, decisions.length - visible.length)
  const toZero = minutesToZero(decisions)

  // The old Today folds, absorbed: stale no-progress rows + backburner.
  const { tasks: allTasks } = useRealtimeTasks()
  const { stale, buried } = useMemo(() => splitTaskQueue(allTasks), [allTasks])
  const buriedTasks = useMemo(
    () => buried.map(t => ({ id: t.id, title: t.title, buried_reason: (t as Record<string, any>).buried_reason ?? null })),
    [buried],
  )
  const [tailOpen, setTailOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const bulkStale = async (action: 'snooze_30d' | 'dismiss_superseded') => {
    if (bulkBusy || stale.length === 0) return
    setBulkBusy(true)
    try {
      const ids = stale.map(t => t.id)
      const r = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, notes: `Bulk: ${ids.length} stale (>${STALE_DAYS}d) items` }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`)
      toast(action === 'snooze_30d' ? `Snoozed ${ids.length} for 30 days.` : `Dismissed ${ids.length} stale items.`, 'success')
    } catch {
      toast('Bulk action failed. Try again.', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const select = async (d: DecisionRow) => {
    h.select()
    // Seed the sheet from the row immediately; hydrate with the full source row
    // so field-gated actions (email, concept_id, deep_enriched_at) are accurate.
    setResolved({ ...d.meta, id: d.id, agent: d.agent, status: d.status, title: d.title, description: d.description })
    setOpen(d)
    // acquisition_sends is deny-all for anon (bodies + PII) — the seeded view
    // row already carries everything the sheet's actions need, so skip the
    // hydration round-trip that would silently return nothing.
    if (d.kind === 'send_sample') return
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
        promptNote,
        promptDefer,
      })
    : []

  return (
    <section id="decisions-inbox" className="scroll-mt-4">
      <FeedCard
        title={`Your decisions · ${decisions.length}`}
        action={decisions.length > 0 ? (
          <div className="flex items-center gap-2">
            {/* The finishable cue: this list is a sitting, not a state of being. */}
            <span className="text-[11px] text-emerald-300/80 tabular-nums whitespace-nowrap hidden sm:inline">
              about {toZero} {toZero === 1 ? 'minute' : 'minutes'} to zero
            </span>
            <button
              type="button"
              onClick={() => { h.tap(); setDeckSeed(null); setDeckOpen(true) }}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-400/20 transition-colors whitespace-nowrap"
            >
              <DeckIcon size={11} /> Clear the queue
            </button>
          </div>
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
          <>
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
                        <span onClick={e => e.stopPropagation()}>
                          <WhyBadge why={whyForDecision(d)} label={KIND_LABEL[d.kind]?.toLowerCase() || 'item'} />
                        </span>
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
            })}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => { h.tap(); setDeckSeed(null); setDeckOpen(true) }}
                className="w-full px-5 py-2.5 text-[11px] text-white/45 hover:text-white/80 text-left transition-colors"
              >
                + {overflow} more · rule on them one at a time
              </button>
            )}
          </>
        )}
      </FeedCard>

      {/* THE TAIL: the old Today folds. Stale no-progress rows (bulk snooze /
          dismiss) and the backburner, collapsed so the queue owns the screen. */}
      {isSimplifiedIA() && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setTailOpen(v => !v)}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-white/35 hover:text-white/65 transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform ${tailOpen ? 'rotate-180' : ''}`} />
            {stale.length > 0 ? `Hidden · ${stale.length} stale (>${STALE_DAYS}d) · backburner` : 'Backburner'}
          </button>
          {tailOpen && (
            <div className="space-y-2 mt-1">
              {stale.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-white/50">{stale.length} items untouched for {STALE_DAYS}+ days with no progress.</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => bulkStale('snooze_30d')}
                        disabled={bulkBusy}
                        className="px-2.5 py-1 rounded-lg text-[11px] border border-white/10 text-white/60 hover:text-white/85 disabled:opacity-40"
                      >
                        Snooze all 30d
                      </button>
                      <button
                        onClick={() => bulkStale('dismiss_superseded')}
                        disabled={bulkBusy}
                        className="px-2.5 py-1 rounded-lg text-[11px] border border-red-400/20 text-red-300/80 hover:text-red-200 disabled:opacity-40"
                      >
                        Dismiss all
                      </button>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1 max-h-44 overflow-y-auto">
                    {stale.slice(0, 30).map(t => (
                      <li key={t.id} className="text-[11px] text-white/40 truncate">{t.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              <BackburnerSection
                table="tasks"
                items={buriedTasks}
                onRestored={() => { /* realtime echo refreshes the cache */ }}
              />
            </div>
          )}
        </div>
      )}

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

      <DecisionDeck
        open={deckOpen}
        onClose={() => { setDeckOpen(false); setDeckSeed(null) }}
        narrow={narrow}
        onNavigate={onNavigate}
        seedId={deckSeed}
      />

      {overlay}
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
