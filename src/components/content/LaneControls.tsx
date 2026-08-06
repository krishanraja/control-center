import React from 'react'
import type { ContentIdeaRow, ContentLane } from '../../hooks/useRealtimeContentIdeas'
import { LANES, LANE_BY_SLUG, computeLaneCadence, normalizeLane, STATUS_DOT, type CadenceStatus } from '../../lib/contentLanes'
import { useHaptics } from '../../hooks/useHaptics'

export type LaneFilter = ContentLane | 'all'

function nowMs(): number {
  // Date.now is fine in the browser; isolated here so tests can stub if needed.
  return Date.now()
}

/** Segmented control: All + the brand lanes, each with a cadence status dot and active count. */
export function LaneToggle({
  value,
  onChange,
  ideas,
}: {
  value: LaneFilter
  onChange: (l: LaneFilter) => void
  ideas: ContentIdeaRow[]
}) {
  const h = useHaptics()
  const now = nowMs()
  // normalizeLane so rows carrying a retired lane value (Techonomic, folded into
  // MYMU on 2026-08-06) still count against the lane they now live in.
  const activeCount = (lane: ContentLane) =>
    ideas.filter(i => normalizeLane(i.lane) === lane && i.state !== 'dropped' && i.state !== 'published').length

  const base =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-colors'
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
      <button
        type="button"
        onClick={() => { h.tap(); onChange('all') }}
        className={`${base} ${value === 'all' ? 'btn-contrast border-white' : 'border-white/10 text-white/65 hover:bg-white/[0.06]'}`}
      >
        All
      </button>
      {LANES.map(l => {
        const cad = computeLaneCadence(l.slug, ideas, now)
        const active = value === l.slug
        return (
          <button
            key={l.slug}
            type="button"
            onClick={() => { h.tap(); onChange(l.slug) }}
            className={`${base} ${active ? l.activeBg : 'border-white/10 text-white/65 hover:bg-white/[0.06]'}`}
            title={`${l.label} — ${l.cadenceLabel}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[cad.status]}`} />
            {l.label}
            <span className="tabular-nums opacity-60">{activeCount(l.slug)}</span>
          </button>
        )
      })}
    </div>
  )
}

const STATUS_COPY: Record<CadenceStatus, (d: number | null) => string> = {
  overdue: d => (d != null ? `Overdue by ${Math.abs(d)}d` : 'Overdue'),
  due_soon: d => (d != null ? `Due in ${d}d` : 'Due soon'),
  on_pace: d => (d != null ? `On pace · next in ${d}d` : 'On pace'),
  no_data: () => 'Nothing published yet — start the first one',
}

const STATUS_TEXT: Record<CadenceStatus, string> = {
  overdue: 'text-rose-300',
  due_soon: 'text-amber-300',
  on_pace: 'text-emerald-300',
  no_data: 'text-white/45',
}

/** The commitment bar for a single selected lane: cadence, last shipped, next due. */
export function CadenceBar({ lane, ideas }: { lane: ContentLane; ideas: ContentIdeaRow[] }) {
  // A lane that no longer exists (Techonomic, retired 2026-08-06) must not blank
  // the tab, so a stale selection renders nothing instead of throwing.
  const def = LANE_BY_SLUG[lane]
  const cad = computeLaneCadence(lane, ideas, nowMs())
  if (!def) return null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-2.5">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[cad.status]}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[13px] font-semibold ${def.accent}`}>{def.label}</span>
          <span className="text-[11px] text-white/40">· {def.cadenceLabel}</span>
          <span className={`text-[11px] font-medium ${STATUS_TEXT[cad.status]}`}>
            {STATUS_COPY[cad.status](cad.status === 'overdue' ? cad.daysUntilDue : cad.daysUntilDue)}
          </span>
        </div>
        <div className="text-[11px] text-white/45 mt-0.5">
          {cad.lastPublishedAt
            ? `Last shipped ${cad.daysSinceLast}d ago`
            : 'No published pieces yet'}
          <span className="text-white/25"> · {def.voice}</span>
        </div>
      </div>
    </div>
  )
}
