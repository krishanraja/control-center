import React, { useMemo } from 'react'
import { Mail, FileText, Mic, UserPlus, Target, ExternalLink } from 'lucide-react'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../hooks/useRealtimeDecisionsWaiting'

const KIND_ICON: Record<DecisionRow['kind'], typeof Mail> = {
  task: Mail,
  guest: Mic,
  idea: FileText,
  lead: UserPlus,
  visibility: Target,
}

const KIND_LABEL: Record<DecisionRow['kind'], string> = {
  task: 'Task',
  guest: 'Guest',
  idea: 'Idea',
  lead: 'Lead',
  visibility: 'Visibility',
}

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  limit?: number
}

export function DecisionsWaitingPanel({ onNavigate, limit = 8 }: Props) {
  const { decisions, loading } = useRealtimeDecisionsWaiting()

  const byKind = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of decisions) counts[d.kind] = (counts[d.kind] || 0) + 1
    return counts
  }, [decisions])

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

  const top = decisions.slice(0, limit)

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <header className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75">Decisions Waiting</h2>
          <span className="text-[11px] text-white/45 tabular-nums">{decisions.length}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/45">
          {(['task','idea','lead','guest','visibility'] as DecisionRow['kind'][]).map(k => (
            <span key={k} className="tabular-nums">{KIND_LABEL[k]} {byKind[k] || 0}</span>
          ))}
        </div>
      </header>

      <div className="divide-y divide-white/[0.04]">
        {top.length === 0 ? (
          <p className="text-[12px] text-white/40 py-3 text-center">Inbox zero. Nothing waiting.</p>
        ) : top.map(d => {
          const Icon = KIND_ICON[d.kind] || Mail
          return (
            <div key={`${d.kind}-${d.id}`} className="flex items-start gap-3 py-2.5">
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
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-1 flex-shrink-0"
                >
                  Open <ExternalLink size={10} />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate?.(d.source_table === 'tasks' ? 'today' : d.source_table.replace('_targets', ''))}
                  className="text-[11px] text-white/45 hover:text-white/85 flex-shrink-0"
                >
                  View
                </button>
              )}
            </div>
          )
        })}
      </div>

      {decisions.length > limit && (
        <div className="mt-3 text-center">
          <span className="text-[11px] text-white/45">+ {decisions.length - limit} more</span>
        </div>
      )}
    </section>
  )
}
