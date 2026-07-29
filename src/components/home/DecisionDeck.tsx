import React, { useEffect, useMemo, useState } from 'react'
import { X, SkipForward } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../../hooks/useRealtimeDecisionsWaiting'
import { splitDecisions, KIND_ICON, KIND_LABEL, KIND_TO_TABLE, minutesToZero } from '../../lib/decisionKinds'
import { buildDecisionActions } from '../../lib/decisionActions'
import { useRulingPrompts } from './RulingPrompts'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import type { SheetAction } from '../mobile/DetailSheet'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Clear the queue: one ruling at a time over the typed decisions, the mobile
 * Today deck's grammar promoted to the one Home surface (both shells; desktop
 * renders the same card centered). Every card's buttons come from
 * buildDecisionActions, so a kind rules identically here, in the inbox sheet,
 * and on its own tab. Advancing is optimistic (a committed set) so a ruled
 * card leaves immediately; the realtime echo settles the truth.
 */
export function DecisionDeck({
  open,
  onClose,
  narrow,
  onNavigate,
  seedId,
}: {
  open: boolean
  onClose: () => void
  narrow: boolean
  onNavigate?: NavigateFn
  seedId?: string | null
}) {
  const { decisions: allRows } = useRealtimeDecisionsWaiting()
  const { toast } = useToast()
  const h = useHaptics()
  const { promptNote, promptDefer, overlay } = useRulingPrompts()
  const [committed, setCommitted] = useState<Set<string>>(() => new Set())
  const [resolved, setResolved] = useState<Record<string, any> | null>(null)

  const { decisions } = useMemo(() => splitDecisions(allRows), [allRows])
  const queue = useMemo(() => {
    const remaining = decisions.filter(d => !committed.has(`${d.kind}-${d.id}`))
    if (!seedId) return remaining
    // A deep-linked row leads the deck, then the normal order continues.
    const seeded = remaining.find(d => d.id === seedId)
    return seeded ? [seeded, ...remaining.filter(d => d !== seeded)] : remaining
  }, [decisions, committed, seedId])

  const current: DecisionRow | null = queue[0] || null
  const total = queue.length + committed.size
  const decided = committed.size

  // Hydrate the current card from its source table so field-gated actions
  // (email, concept_id, deep_enriched_at) are accurate. send_sample never
  // appears here (it is a queue kind), so no anon-RLS special case is needed.
  useEffect(() => {
    let cancelled = false
    if (!current) { setResolved(null); return }
    setResolved({ ...current.meta, id: current.id, agent: current.agent, status: current.status, title: current.title, description: current.description })
    supabase
      .from(KIND_TO_TABLE[current.kind])
      .select('*')
      .eq('id', current.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setResolved({ ...(data as Record<string, any>), agent: current.agent, title: current.title })
      })
    return () => { cancelled = true }
  }, [current?.kind, current?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const advance = () => {
    if (!current) return
    setCommitted(prev => { const n = new Set(prev); n.add(`${current.kind}-${current.id}`); return n })
  }

  const actions: SheetAction[] = current && resolved
    ? buildDecisionActions(current.kind, resolved, {
        navigate: onNavigate,
        toast,
        haptics: h,
        onDone: advance,
        promptNote,
        promptDefer,
      })
    : []

  const Icon = current ? KIND_ICON[current.kind] : null
  const toZero = minutesToZero(queue)

  const btnCls = (variant?: SheetAction['variant']) =>
    variant === 'primary' ? 'btn-contrast'
    : variant === 'danger' ? 'bg-red-400/15 text-red-300 border border-red-400/25'
    : 'bg-white/[0.06] text-white/75 border border-white/10'

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${narrow ? 'h-full flex flex-col' : 'sm:max-w-lg sm:mx-4'} `}>
        <div className={`relative bg-zinc-950 border border-white/10 ${narrow ? 'flex-1 flex flex-col rounded-none p-5 pt-6' : 'rounded-2xl p-6'} overflow-y-auto`}>
          {/* header: progress + close */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] text-white/45 tabular-nums">
              {total > 0 ? `${decided} of ${total} decided` : 'Queue clear'}
              {queue.length > 0 && <span className="text-emerald-300/80"> · about {toZero} min left</span>}
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-white/45 hover:text-white/85 hover:bg-white/[0.06]">
              <X size={16} />
            </button>
          </div>

          {/* progress bar */}
          {total > 0 && (
            <div className="h-1 rounded-full bg-white/[0.06] mb-5 overflow-hidden">
              <div className="h-full bg-emerald-400/70 rounded-full transition-all" style={{ width: `${(decided / total) * 100}%` }} />
            </div>
          )}

          {current ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-white/[0.06] text-white/60 uppercase tracking-[0.1em]">
                  {Icon && <Icon size={11} />} {KIND_LABEL[current.kind]}
                </span>
                {current.agent && (
                  <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold bg-white/[0.06] text-white/60 capitalize">
                    {current.agent}
                  </span>
                )}
                {(current.priority === 'overdue' || current.priority === 'urgent' || current.priority === 'high') && (
                  <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold bg-red-400/15 text-red-300 uppercase">
                    {current.priority}
                  </span>
                )}
              </div>
              <h3 className="text-[16.5px] font-bold text-white mt-3 leading-snug">{current.title}</h3>
              {composeDeckBody(resolved, current) && (
                <p className="text-[13px] text-white/60 mt-2 leading-relaxed whitespace-pre-line">
                  {composeDeckBody(resolved, current)}
                </p>
              )}

              {/* verbs */}
              <div className={`flex flex-col gap-2 ${narrow ? 'mt-auto pt-6' : 'mt-6'}`}>
                {actions.map(a => (
                  <button
                    key={a.label}
                    onClick={() => { h.heavy(); void a.onClick() }}
                    className={`w-full rounded-xl py-3.5 text-[13.5px] font-bold ${btnCls(a.variant)}`}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  onClick={() => { h.tap(); advance() }}
                  className="w-full rounded-xl py-2.5 text-[12px] text-white/40 hover:text-white/70 inline-flex items-center justify-center gap-1.5"
                >
                  <SkipForward size={12} /> Skip for now
                </button>
              </div>
            </>
          ) : (
            <div className="py-14 text-center">
              <div className="text-[15px] font-bold text-white/85">Queue clear.</div>
              <div className="text-[12px] text-white/45 mt-1">Nothing is waiting on you. That is the system working.</div>
              <button onClick={onClose} className="mt-6 px-4 py-2 rounded-xl text-[13px] font-semibold bg-white/[0.08] border border-white/10 text-white/85 hover:bg-white/[0.12]">
                Back to Home
              </button>
            </div>
          )}
        </div>
      </div>
      {overlay}
    </div>
  )
}

function composeDeckBody(row: Record<string, any> | null, d: DecisionRow): string | undefined {
  if (!row) return d.description ?? undefined
  const parts = [
    row.description || row.why_relevant || row.thesis || row.notes || d.description || null,
    row.primary_tension ? `Tension: ${row.primary_tension}` : null,
    row.next_step ? `Next step: ${row.next_step}` : null,
    row.pitch_draft ? `Pitch: ${row.pitch_draft}` : null,
    row.angle ? `Angle: ${row.angle}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join('\n\n') : undefined
}
