import React from 'react'

interface Props {
  /** Top card only: live horizontal drag offset, in px. */
  dx?: number
  /** Finger/mouse actively dragging (disables the settle transition). */
  dragging?: boolean
  /** Mid fly-out animation. */
  flyout?: boolean
  /** Stack depth (0 = top). Cards behind render scaled + offset. */
  depth?: number
  /** Ghost label shown when swiping LEFT (the −1/reject side). */
  leftLabel?: string
  /** Ghost label shown when swiping RIGHT (the +1/accept side). */
  rightLabel?: string
  bind?: React.HTMLAttributes<HTMLDivElement>
  onClick?: () => void
  ariaLabel?: string
  children: React.ReactNode
}

/**
 * SwipeCard — the source-agnostic card shell extracted from TriageCard. It owns
 * the pile geometry (drag transform + rotate on the top card, scale/offset on the
 * cards behind) and the red/green drag ghosts; the body is whatever the caller
 * renders as children. The TOP card is the only interactive one — it receives
 * `bind` and the drag transform; deeper cards are inert scenery.
 */
export function SwipeCard({
  dx = 0, dragging, flyout, depth = 0,
  leftLabel = 'Drop', rightLabel = 'Keep',
  bind, onClick, ariaLabel, children,
}: Props) {
  const isTop = depth === 0
  const rot = isTop ? dx * 0.035 : 0
  const transform = isTop
    ? `translateX(${dx}px) rotate(${rot}deg)`
    : `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`
  const transition = dragging ? 'none' : 'transform 280ms cubic-bezier(0.2,0.8,0.2,1), opacity 280ms ease'
  const opacity = flyout ? 0 : 1

  const leftGhost = Math.max(0, Math.min(-dx / 110, 1))
  const rightGhost = Math.max(0, Math.min(dx / 110, 1))

  return (
    <div
      {...(isTop ? bind : {})}
      onClick={isTop ? onClick : undefined}
      role={isTop ? 'group' : undefined}
      aria-label={isTop ? ariaLabel : undefined}
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
        {isTop && (
          <>
            <div
              className="absolute top-5 left-5 z-10 px-3 py-1.5 rounded-lg border-2 border-rose-400/80 text-rose-300 text-[15px] font-bold uppercase tracking-wider rotate-[-12deg] pointer-events-none"
              style={{ opacity: leftGhost }}
            >
              {leftLabel}
            </div>
            <div
              className="absolute top-5 right-5 z-10 px-3 py-1.5 rounded-lg border-2 border-emerald-400/80 text-emerald-300 text-[15px] font-bold uppercase tracking-wider rotate-[12deg] pointer-events-none"
              style={{ opacity: rightGhost }}
            >
              {rightLabel}
            </div>
          </>
        )}
        {children}
      </div>
    </div>
  )
}
