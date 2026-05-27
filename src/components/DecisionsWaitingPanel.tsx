import React, { useMemo, useState } from 'react'
import { Mail, FileText, Mic, UserPlus, Target, ShieldAlert, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../hooks/useRealtimeDecisionsWaiting'
import { navigateDecision } from '../lib/routeDecision'
import { useHaptics } from '../hooks/useHaptics'
import { useFocusFiltered } from '../hooks/useFocusFiltered'
import { useDailyFocus } from '../hooks/useDailyFocus'

const KIND_ICON: Record<DecisionRow['kind'], typeof Mail> = {
  task: Mail,
  guest: Mic,
  idea: FileText,
  lead: UserPlus,
  visibility: Target,
  correction: ShieldAlert,
}

const KIND_LABEL: Record<DecisionRow['kind'], string> = {
  task: 'Task',
  guest: 'Guest',
  idea: 'Idea',
  lead: 'Lead',
  visibility: 'Visibility',
  correction: 'Correction',
}

const KIND_ORDER: DecisionRow['kind'][] = ['correction', 'task', 'idea', 'lead', 'guest', 'visibility']

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  /**
   * When set, show only the top N rows (Home preview mode).
   * Omit to render every waiting decision (Today inbox mode).
   */
  limit?: number
  /**
   * When false, the kind chips are inert counters (Home preview).
   * When true, they filter the list (Today inbox).
   */
  filterable?: boolean
}

export function DecisionsWaitingPanel({ onNavigate, limit, filterable = false }: Props) {
  const { decisions, loading } = useRealtimeDecisionsWaiting()
  const [activeKind, setActiveKind] = useState<DecisionRow['kind'] | null>(null)
  const h = useHaptics()
  const { today: focusToday } = useDailyFocus()
  // Lane-tagged copy of the same list. When focus is calibrated, the panel
  // groups rows into 3 lanes (matching the 3 daily targets) + a Muted lane.
  // When no focus is set, this is a no-op pass-through.
  const focused = useFocusFiltered(decisions, 'decisions_waiting')
  const [mutedOpen, setMutedOpen] = useState(false)

  const byKind = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of decisions) counts[d.kind] = (counts[d.kind] || 0) + 1
    return counts
  }, [decisions])

  const filtered = useMemo(() => {
    if (!activeKind) return decisions
    return decisions.filter(d => d.kind === activeKind)
  }, [decisions, activeKind])

  const visible = typeof limit === 'number' ? filtered.slice(0, limit) : filtered

  if (loading && decisions.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">Decisions Waiting</h2>
          <span className="text-[11px] text-white/30">loading...</span>
        </header>
      </section>
    )
  }

  const openDecision = (d: DecisionRow) => {
    h.select()
    navigateDecision(onNavigate, d.kind, d.id)
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <header className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75">Decisions Waiting</h2>
          <span className="text-[11px] text-white/45 tabular-nums">{decisions.length}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
          {KIND_ORDER.map(k => {
            const count = byKind[k] || 0
            const active = activeKind === k
            const base = 'tabular-nums px-2 py-0.5 rounded-full border transition-colors'
            const inert = 'border-transparent text-white/45'
            const clickable = active
              ? 'border-violet-400/60 bg-violet-500/15 text-violet-100'
              : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white/85'
            return filterable ? (
              <button
                key={k}
                type="button"
                onClick={() => setActiveKind(active ? null : k)}
                className={`${base} ${clickable}`}
                aria-pressed={active}
              >
                {KIND_LABEL[k]} {count}
              </button>
            ) : (
              <span key={k} className={`${base} ${inert}`}>{KIND_LABEL[k]} {count}</span>
            )
          })}
          {filterable && activeKind && (
            <button
              type="button"
              onClick={() => setActiveKind(null)}
              className="text-[10px] text-white/40 hover:text-white/70 px-1"
            >
              clear
            </button>
          )}
        </div>
      </header>

      {focused.active && !activeKind ? (
        <div>
          {[1, 2, 3].map((laneN) => {
            const laneTargetText = focusToday?.[`target_${laneN}_text` as 'target_1_text' | 'target_2_text' | 'target_3_text'] || `Target ${laneN}`
            const laneRows = focused.items
              .filter(it => it.focus_target === laneN)
              .map(it => it.row)
              .filter(r => visible.includes(r))
            return (
              <div key={`lane-${laneN}`} className="border-t border-white/[0.04] first:border-t-0">
                <div className="flex items-baseline gap-2 pt-2 pb-1.5 px-1">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-violet-300 font-semibold">Lane {laneN}</span>
                  <span className="text-[11px] text-white/70 truncate">{laneTargetText}</span>
                  <span className="ml-auto text-[10px] text-white/40 tabular-nums">{laneRows.length}</span>
                </div>
                {laneRows.length === 0 ? (
                  <p className="text-[11px] text-white/40 py-1.5 px-1">Nothing in lane.</p>
                ) : laneRows.map(d => <DecisionRowItem key={`${d.kind}-${d.id}`} d={d} onOpen={openDecision} />)}
              </div>
            )
          })}
          {(() => {
            const muted = focused.items.filter(it => it.muted).map(it => it.row).filter(r => visible.includes(r))
            if (muted.length === 0) return null
            return (
              <div className="border-t border-white/[0.04] mt-1">
                <button
                  type="button"
                  onClick={() => setMutedOpen(v => !v)}
                  className="w-full flex items-center gap-2 py-2 px-1 text-[11px] text-white/45 hover:text-white/75"
                >
                  {mutedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <span>Muted</span>
                  <span className="tabular-nums">({muted.length})</span>
                </button>
                {mutedOpen && (
                  <div className="opacity-60">
                    {muted.map(d => <DecisionRowItem key={`m-${d.kind}-${d.id}`} d={d} onOpen={openDecision} />)}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {visible.length === 0 ? (
          <p className="text-[12px] text-white/40 py-3 text-center">
            {activeKind ? `No ${KIND_LABEL[activeKind].toLowerCase()} decisions waiting.` : 'Inbox zero. Nothing waiting.'}
          </p>
        ) : visible.map(d => {
          const Icon = KIND_ICON[d.kind] || Mail
          return (
            <button
              key={`${d.kind}-${d.id}`}
              type="button"
              onClick={() => openDecision(d)}
              className="w-full text-left flex items-start gap-3 py-2.5 hover:bg-white/[0.025] transition-colors px-1 -mx-1 rounded"
            >
              <Icon size={14} className="text-white/40 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-violet-300">{KIND_LABEL[d.kind]}</span>
                  <span className="text-[10px] text-white/35">{d.agent}</span>
                  {d.priority === 'high' && <span className="text-[10px] text-rose-300 uppercase tracking-wider">High</span>}
                  {d.priority === 'urgent' && <span className="text-[10px] text-amber-300 uppercase tracking-wider">Urgent</span>}
                  {d.priority === 'overdue' && <span className="text-[10px] text-rose-300 uppercase tracking-wider">Overdue</span>}
                </div>
                <p className="text-[13px] text-white/90 truncate">{d.title}</p>
                {d.description && (
                  <p className="text-[11px] text-white/55 line-clamp-1 mt-0.5">{d.description}</p>
                )}
              </div>
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-1 flex-shrink-0"
                >
                  Open <ExternalLink size={10} />
                </a>
              )}
            </button>
          )
        })}
        </div>
      )}

      {typeof limit === 'number' && filtered.length > limit && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => onNavigate?.('today')}
            className="text-[11px] text-violet-300/70 hover:text-violet-200"
          >
            + {filtered.length - limit} more in Today
          </button>
        </div>
      )}
    </section>
  )
}

function DecisionRowItem({ d, onOpen }: { d: DecisionRow; onOpen: (d: DecisionRow) => void }) {
  const Icon = KIND_ICON[d.kind] || Mail
  return (
    <button
      type="button"
      onClick={() => onOpen(d)}
      className="w-full text-left flex items-start gap-3 py-2 hover:bg-white/[0.025] transition-colors px-1 -mx-1 rounded"
    >
      <Icon size={14} className="text-white/40 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-violet-300">{KIND_LABEL[d.kind]}</span>
          <span className="text-[10px] text-white/35">{d.agent}</span>
          {d.priority === 'high'    && <span className="text-[10px] text-rose-300 uppercase tracking-wider">High</span>}
          {d.priority === 'urgent'  && <span className="text-[10px] text-amber-300 uppercase tracking-wider">Urgent</span>}
          {d.priority === 'overdue' && <span className="text-[10px] text-rose-300 uppercase tracking-wider">Overdue</span>}
        </div>
        <p className="text-[13px] text-white/90 truncate">{d.title}</p>
        {d.description && <p className="text-[11px] text-white/55 line-clamp-1 mt-0.5">{d.description}</p>}
      </div>
      {d.url && (
        <a href={d.url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
           className="text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-1 flex-shrink-0">
          Open <ExternalLink size={10} />
        </a>
      )}
    </button>
  )
}
