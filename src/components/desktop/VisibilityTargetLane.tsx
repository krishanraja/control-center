import React from 'react'
import { ChevronRight } from 'lucide-react'
import { VisibilityTargetCard } from '../VisibilityTargetCard'
import type { VisibilityTargetRow, VisibilityTargetStatus } from '../../hooks/useVisibilityTargets'

interface Props {
  status: VisibilityTargetStatus
  title: string
  description: string
  targets: VisibilityTargetRow[]
  onOpen?: (id: string) => void
}

export function VisibilityTargetLane({ status, title, description, targets, onOpen }: Props) {
  const [collapsed, setCollapsed] = React.useState(status === 'dropped' || status === 'done')
  // CLO-009 (audit 2026-05-26): allow showing all rows when user clicks '+N more'.
  const [showAll, setShowAll] = React.useState(false)

  if (targets.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
        <header className="flex items-baseline justify-between mb-1">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{title}</h3>
          <span className="text-[10px] text-white/30 tabular-nums">0</span>
        </header>
        <p className="text-[11px] text-white/35">{description}</p>
      </section>
    )
  }

  const top = collapsed ? [] : (showAll ? targets : targets.slice(0, 6))
  const remaining = targets.length - top.length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]" data-status={status}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={12}
          className={`text-white/40 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75 truncate">
            {title}
          </h3>
          <p className="text-[11px] text-white/45 truncate">{description}</p>
        </div>
        <span className="text-[11px] tabular-nums text-white/55 flex-shrink-0">{targets.length}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-white/[0.05] p-3 space-y-2">
          {top.map(t => (
            <VisibilityTargetCard key={t.id} target={t} onOpen={onOpen} />
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full text-[11px] text-violet-300/80 hover:text-violet-200 text-center py-2 hover:bg-white/[0.025] rounded transition-colors"
            >
              Show {remaining} more
            </button>
          )}
        </div>
      )}
    </section>
  )
}
