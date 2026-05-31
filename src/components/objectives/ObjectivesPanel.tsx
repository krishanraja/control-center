import React, { useState } from 'react'
import { Target, ChevronRight, ChevronDown, AlertTriangle, Loader2 } from 'lucide-react'
import { useObjectives, type Objective } from '../../hooks/useObjectives'
import { useObjectiveTree } from '../../hooks/useObjectiveTree'
import { MilestoneCalibrator } from './MilestoneCalibrator'
import { NominationTray } from './NominationTray'

// The objective layer surface on Home.
//   1. Soft-cap warning when active count is over 10.
//   2. Marcus nominations tray (only renders when present).
//   3. Active objectives strip: one row per objective. Click expands an
//      inline MilestoneCalibrator. The first active objective by priority
//      doubles as the deep-work block: its next non-done milestone is
//      shown as the committed deep-work for today.
//
// Realtime: a single shared channel covers both goals and milestones; see
// useObjectives.ts (one connection per browser session, ADR-002 pattern).
export function ObjectivesPanel({
  variant = 'desktop',
  collapsible = false,
}: {
  variant?: 'desktop' | 'mobile'
  /** When true, render a one-line summary card that expands into the full panel
   *  on tap (mobile Home — keeps the week from eating the top of every open). */
  collapsible?: boolean
}) {
  const { active, nominations, active_count, soft_cap, loading } = useObjectives()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(collapsible)

  if (collapsible && collapsed && active.length > 0) {
    return (
      <ObjectivesSummary
        firstActiveId={active[0].id}
        firstActiveTitle={active[0].title}
        activeCount={active_count}
        nominationCount={nominations.length}
        onExpand={() => setCollapsed(false)}
      />
    )
  }

  if (loading && active.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
        <div className="text-[12px] text-white/45 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" />
          Loading objectives...
        </div>
      </section>
    )
  }

  if (active.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
        <header className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-violet-300" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Objectives</h2>
        </header>
        <p className="text-[12px] text-white/50">
          No active portfolio objectives yet. Declare one to give the OS a multi-week unlock to chase.
        </p>
        <NominationTray />
      </section>
    )
  }

  const overCap = active_count > soft_cap
  const firstActive = active[0]

  return (
    <section className="space-y-3">
      <NominationTray />

      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.04] to-transparent p-4 md:p-5">
        <header className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-violet-300" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
              Portfolio objectives
            </h2>
            <span className="text-[10px] text-white/40 tabular-nums">
              {active_count} active
            </span>
          </div>
          {overCap && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/85 font-semibold">
              <AlertTriangle size={10} />
              Over soft cap ({soft_cap})
            </span>
          )}
        </header>

        {firstActive && (
          <DeepWorkBlock objectiveId={firstActive.id} variant={variant} />
        )}

        <ul className={`mt-4 space-y-1.5 ${variant === 'mobile' ? '' : ''}`}>
          {active.map(o => (
            <ObjectiveRow
              key={o.id}
              objective={o}
              expanded={expandedId === o.id}
              onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

// Collapsed summary for mobile Home: the deep-work milestone (or top objective)
// on one line, with active + proposed counts. Tap expands to the full panel.
function ObjectivesSummary({
  firstActiveId, firstActiveTitle, activeCount, nominationCount, onExpand,
}: {
  firstActiveId: string
  firstActiveTitle: string
  activeCount: number
  nominationCount: number
  onExpand: () => void
}) {
  const { tree } = useObjectiveTree(firstActiveId)
  const milestones = tree?.milestones || []
  const deepWork =
    milestones.find(m => m.status === 'active') ||
    milestones.find(m => m.status === 'accepted')
  const headline = deepWork?.title || firstActiveTitle

  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full text-left rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-4 active:bg-violet-500/[0.10] transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Target size={13} className="text-violet-300" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200/80">This week</span>
        <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-white/45 tabular-nums">
          {activeCount} active
          {nominationCount > 0 && (
            <span className="rounded-full bg-amber-400/15 text-amber-300 px-1.5 py-0.5">{nominationCount} proposed</span>
          )}
          <ChevronRight size={12} className="text-white/40" />
        </span>
      </div>
      <p className="text-[14px] font-semibold text-white leading-snug line-clamp-2">{headline}</p>
      {tree?.objective && deepWork && (
        <p className="text-[10px] text-white/45 mt-1">
          Ladders up to: <span className="text-white/65">{tree.objective.title}</span>
        </p>
      )}
    </button>
  )
}

function ObjectiveRow({
  objective, expanded, onToggle,
}: {
  objective: Objective
  expanded: boolean
  onToggle: () => void
}) {
  // Lightweight per-row tree fetch only when expanded, so the strip stays cheap.
  const { tree } = useObjectiveTree(expanded ? objective.id : null)
  const milestones = tree?.milestones || []
  const done = milestones.filter(m => m.status === 'done').length
  const total = milestones.filter(m => m.status !== 'dropped').length
  const next = milestones.find(m => m.status === 'active') || milestones.find(m => m.status === 'accepted') || milestones.find(m => m.status === 'proposed')

  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/[0.02]"
      >
        {expanded ? <ChevronDown size={12} className="text-white/45 flex-shrink-0" /> : <ChevronRight size={12} className="text-white/45 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{objective.title}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/45">
            {objective.venture && <span className="uppercase tracking-[0.12em]">{objective.venture}</span>}
            {objective.objective_kind && <span>· {objective.objective_kind}</span>}
            {objective.is_auto && <span className="text-emerald-300/70">· auto</span>}
            {expanded && total > 0 && (
              <span className="tabular-nums">· {done}/{total} milestones done</span>
            )}
            {!expanded && next && (
              <span className="truncate">
                · next: <span className="text-white/65">{next.title}</span>
              </span>
            )}
          </div>
        </div>
        {typeof objective.priority === 'number' && (
          <span className="flex-shrink-0 text-[10px] text-white/35 tabular-nums">P{objective.priority}</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04] p-2">
          <MilestoneCalibrator goalId={objective.id} />
        </div>
      )}
    </li>
  )
}

// Deep-work block: a single visually distinct card surfacing the current
// week-sized chunk of the highest-priority objective. This is the thing
// Krish protects three hours for, kept separate from the tactical
// top_three picks so neither crowds the other.
function DeepWorkBlock({ objectiveId, variant }: { objectiveId: string; variant: 'desktop' | 'mobile' }) {
  const { tree, loading } = useObjectiveTree(objectiveId)
  if (loading || !tree) return null
  const candidate =
    (tree.milestones || []).find(m => m.status === 'active') ||
    (tree.milestones || []).find(m => m.status === 'accepted') ||
    null

  if (!candidate) {
    return (
      <div className="rounded-lg border border-violet-500/15 bg-violet-500/[0.04] px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200/75 font-semibold mb-1">
          Deep-work block
        </p>
        <p className="text-[12px] text-white/55">
          No accepted milestone for {tree.objective?.title || 'this objective'}. Expand the row below and accept one of Marcus's proposals.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.08] px-3 py-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200 font-semibold">
          Deep-work block
        </p>
        <span className="text-[10px] text-violet-200/55 italic">
          Protect {typeof candidate.est_deep_work_hours === 'number' ? `${candidate.est_deep_work_hours}h` : '3h'} today
        </span>
      </div>
      <p className="text-[14px] font-semibold text-white leading-snug">{candidate.title}</p>
      {candidate.description && variant === 'desktop' && (
        <p className="text-[11px] text-white/55 leading-snug mt-1 line-clamp-2">{candidate.description}</p>
      )}
      {tree.objective && (
        <p className="text-[10px] text-white/45 mt-1.5">
          Ladders up to: <span className="text-white/65">{tree.objective.title}</span>
        </p>
      )}
    </div>
  )
}
