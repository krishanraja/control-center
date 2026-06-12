import React from 'react'
import { ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'

const STATE_LABEL: Record<string, string> = {
  seeded: 'Seeded', researching: 'Researching', drafting: 'Drafting',
  review: 'Review', approved: 'Approved',
}

const STATE_TONE: Record<string, string> = {
  seeded: 'bg-white/[0.08] text-white/65',
  researching: 'bg-blue-500/15 text-blue-200',
  drafting: 'bg-violet-500/15 text-violet-200',
  review: 'bg-amber-500/15 text-amber-200',
  approved: 'bg-emerald-500/15 text-emerald-200',
}

interface Props {
  idea: ContentIdeaRow
  /** Top card only: live horizontal drag offset, in px. */
  dx?: number
  /** Whether the finger/mouse is actively dragging (disables the transition). */
  dragging?: boolean
  /** In a fly-out animation. */
  flyout?: boolean
  /** Stack depth (0 = top). Used to scale/offset the cards behind. */
  depth?: number
  /** What a RIGHT action does on this card: 'advance' or 'open' (human gate). */
  rightIntent?: 'advance' | 'open'
  /** Label shown in the green ghost when swiping right. */
  rightLabel?: string
  bind?: React.HTMLAttributes<HTMLDivElement>
  onClick?: () => void
}

/**
 * TriageCard — one piece of content as a swipeable card. The TOP card is the only
 * interactive one (receives `bind` + drag transform); cards behind render scaled
 * and offset to suggest the pile depth.
 */
export function TriageCard({
  idea: i, dx = 0, dragging, flyout, depth = 0, rightIntent = 'advance', rightLabel = 'Advance', bind, onClick,
}: Props) {
  const isTop = depth === 0
  const rot = isTop ? dx * 0.035 : 0
  const transform = isTop
    ? `translateX(${dx}px) rotate(${rot}deg)`
    : `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`
  const transition = dragging ? 'none' : 'transform 280ms cubic-bezier(0.2,0.8,0.2,1), opacity 280ms ease'
  const opacity = flyout ? 0 : 1

  const dropGhost = Math.max(0, Math.min(-dx / 110, 1))
  const rightGhost = Math.max(0, Math.min(dx / 110, 1))
  const body = (i.body || i.thesis || '').trim()

  return (
    <div
      {...(isTop ? bind : {})}
      onClick={isTop ? onClick : undefined}
      role={isTop ? 'group' : undefined}
      aria-label={isTop ? `Content idea: ${i.idea}` : undefined}
      className="absolute inset-0 select-none"
      style={{
        transform,
        transition,
        opacity,
        zIndex: 10 - depth,
        touchAction: isTop ? 'none' : undefined,
        cursor: isTop ? 'grab' : undefined,
        pointerEvents: isTop ? 'auto' : 'none',
      }}
    >
      <div className="relative h-full rounded-3xl border border-white/[0.10] bg-[#141417] shadow-2xl shadow-black/40 p-5 flex flex-col overflow-hidden">
        {/* Drag ghosts — only meaningful on the top card. */}
        {isTop && (
          <>
            <div
              className="absolute top-5 left-5 px-3 py-1.5 rounded-lg border-2 border-rose-400/80 text-rose-300 text-[15px] font-bold uppercase tracking-wider rotate-[-12deg] pointer-events-none"
              style={{ opacity: dropGhost }}
            >
              Drop
            </div>
            <div
              className="absolute top-5 right-5 px-3 py-1.5 rounded-lg border-2 border-emerald-400/80 text-emerald-300 text-[15px] font-bold uppercase tracking-wider rotate-[12deg] pointer-events-none"
              style={{ opacity: rightGhost }}
            >
              {rightIntent === 'open' ? 'Open' : rightLabel}
            </div>
          </>
        )}

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] font-semibold ${STATE_TONE[i.state] || 'bg-white/[0.08] text-white/65'}`}>
            {STATE_LABEL[i.state] || i.state}
          </span>
          {i.lane && (
            <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{i.lane.replace(/_/g, ' ')}</span>
          )}
          {typeof i.brand_fit_score === 'number' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {i.brand_fit_score}</span>
          )}
          {body && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200/80">draft</span>}
          <span className="ml-auto text-[10px] text-white/35 tabular-nums">
            {i.updated_at && formatDistanceToNow(new Date(i.updated_at), { addSuffix: true })}
          </span>
        </div>

        <p className="text-[19px] font-semibold text-white leading-snug">{i.idea}</p>

        {body && (
          <p className="text-[13px] text-white/60 leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
            {body.slice(0, 360)}{body.length > 360 ? '…' : ''}
          </p>
        )}
        {!body && (
          <p className="text-[12px] text-amber-200/70 mt-3 flex-1">No draft or thesis yet — raw seed.</p>
        )}

        {(i.draft_link || i.source_url) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] flex-shrink-0">
            {i.draft_link && (
              <a href={i.draft_link} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}
                className="text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">
                Draft <ExternalLink size={10} />
              </a>
            )}
            {i.source_url && (
              <a href={i.source_url} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}
                className="text-[11px] text-white/45 hover:text-white/70 inline-flex items-center gap-1">
                Source <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
