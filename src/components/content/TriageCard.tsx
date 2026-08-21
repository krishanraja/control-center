import React from 'react'
import { ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { WhyBadge } from '../shared/WhyBadge'

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
  // Krish: "the animation doesnt have me feel like the card is swiping away,
  // even though the next card does appear."
  // Cause: opacity went 1 -> 0 over 280ms IN PARALLEL with the 280ms travel, so
  // the card dissolved in place and was already invisible by the time it had
  // moved any meaningful distance. A throw you cannot see is just a disappear.
  // Fix: the card keeps its opacity while it travels and only fades over the
  // last third, it rotates harder as it goes so it reads as thrown rather than
  // slid, and it accelerates out (ease-in) instead of easing to a polite stop.
  const rot = isTop ? dx * (flyout ? 0.055 : 0.035) : 0
  const transform = isTop
    ? `translateX(${dx}px) rotate(${rot}deg)`
    : `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`
  const transition = dragging
    ? 'none'
    : flyout
      // travel is the whole point, so it gets the full duration and an
      // accelerating curve; the fade is delayed until the card is mostly gone
      ? 'transform 340ms cubic-bezier(0.32,0,0.67,0), opacity 120ms ease 220ms'
      : 'transform 280ms cubic-bezier(0.2,0.8,0.2,1), opacity 280ms ease'
  const opacity = flyout ? 0 : 1

  const dropGhost = Math.max(0, Math.min(-dx / 110, 1))
  const rightGhost = Math.max(0, Math.min(dx / 110, 1))
  const thesis = (i.thesis || '').trim()
  const draft = (i.body || '').trim()
  // The angle (thesis) is the case for the piece — what makes it worth advancing.
  // Show it up top as the rationale; fall back to the draft body when there's no
  // thesis so the card is never blank.
  const why = thesis || draft
  const context = thesis ? draft : ''
  const hasDraft = !!draft

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
      <div className="relative h-full rounded-3xl border border-white/[0.10] bg-base shadow-2xl shadow-black/40 p-5 flex flex-col overflow-hidden">
        {/* Drag ghosts — only meaningful on the top card. */}
        {isTop && (
          <>
            <div
              className="absolute top-5 left-5 px-3 py-1.5 rounded-lg border-2 border-rose-400/80 text-rose-300 text-ui font-bold uppercase tracking-wider rotate-[-12deg] pointer-events-none"
              style={{ opacity: dropGhost }}
            >
              Drop
            </div>
            <div
              className="absolute top-5 right-5 px-3 py-1.5 rounded-lg border-2 border-emerald-400/80 text-emerald-300 text-ui font-bold uppercase tracking-wider rotate-[12deg] pointer-events-none"
              style={{ opacity: rightGhost }}
            >
              {rightIntent === 'open' ? 'Open' : rightLabel}
            </div>
          </>
        )}

        {/* Only the top card renders content; cards behind stay blank scenery so
            their text can never bleed through if the panel surface is translucent. */}
        {isTop && (
        <>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] font-semibold ${STATE_TONE[i.state] || 'bg-white/[0.08] text-white/65'}`}>
            {STATE_LABEL[i.state] || i.state}
          </span>
          {i.lane && (
            <span className="text-micro uppercase tracking-[0.14em] text-white/40">{i.lane.replace(/_/g, ' ')}</span>
          )}
          {typeof i.brand_fit_score === 'number' && (
            <span className="text-micro px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">Fit {i.brand_fit_score}</span>
          )}
          {hasDraft && <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200/80">draft</span>}
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-micro text-white/35 tabular-nums">
              {i.updated_at && formatDistanceToNow(new Date(i.updated_at), { addSuffix: true })}
            </span>
            <WhyBadge table="content_ideas" row={i} />
          </span>
        </div>

        <p className="text-title font-semibold text-white leading-snug">{i.idea}</p>

        <div className="mt-3 overflow-hidden flex-1 min-h-0">
          {why ? (
            <>
              <p className="text-body text-white/75 leading-relaxed">
                <span className="text-violet-300/80 font-medium">{thesis ? 'Angle: ' : ''}</span>
                {why.slice(0, 320)}{why.length > 320 ? '…' : ''}
              </p>
              {context && (
                <p className="text-label text-white/45 leading-relaxed mt-2">
                  <span className="text-white/35">Draft: </span>{context.slice(0, 200)}{context.length > 200 ? '…' : ''}
                </p>
              )}
            </>
          ) : (
            <p className="text-label text-amber-200/70">No draft or thesis yet — raw seed. Swipe right to research it.</p>
          )}
        </div>

        {(i.draft_link || i.source_url) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] flex-shrink-0">
            {i.draft_link && (
              <a href={i.draft_link} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}
                className="text-micro text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">
                Draft <ExternalLink size={10} />
              </a>
            )}
            {i.source_url && (
              <a href={i.source_url} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}
                className="text-micro text-white/45 hover:text-white/70 inline-flex items-center gap-1">
                Source <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}
