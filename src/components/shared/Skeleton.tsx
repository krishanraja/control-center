import React from 'react'
import { staggerDelay, useReducedMotion } from './motion'

/**
 * Skeletons — a promise of the exact thing about to appear, never a spinner.
 *
 * The shape itself carries the device intent:
 *  • MobileTabSkeleton  — one hero, one column. On a phone you arrive to make a
 *    single decision, so the placeholder is single-focus and vertical.
 *  • BoardSkeleton      — a hero spine over staggered lanes. At a desk you arrive
 *    to orchestrate breadth, so the placeholder restores the whole board's
 *    architecture, lane by lane.
 *
 * Both fade to real content; nothing pops in from blank.
 */

type Dim = string | number

/** A single shimmering block. Uses the global `.skeleton` sweep. */
export function Skeleton({
  w = '100%',
  h = 14,
  r = 8,
  className = '',
}: { w?: Dim; h?: Dim; r?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={`skeleton ${className}`}
      style={{ width: w, height: h, borderRadius: r }}
    />
  )
}

/** A few staggered text lines — the last one short, like real prose. */
export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={11} w={i === lines - 1 ? '55%' : '100%'} r={6} />
      ))}
    </div>
  )
}

/** A screen-reader-only, polite "loading" announcement to pair with visuals. */
function LoadingAnnounce({ label = 'Loading' }: { label?: string }) {
  return <span className="sr-only" role="status" aria-live="polite">{label}…</span>
}

/** A single feed-row placeholder — matches FeedRow's anatomy (dot + 2 lines). */
export function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-5 py-4" style={{ minHeight: 76 }}>
      <Skeleton w={10} h={10} r={5} className="mt-1.5 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton h={14} w="78%" r={6} />
        <Skeleton h={11} w="48%" r={6} />
      </div>
    </div>
  )
}

/**
 * Mobile: the single-focus tab placeholder. Mirrors the real anatomy —
 * a breathing hero, a 3-up stat row, then a feed — so the transition to live
 * data is a settle, not a relayout.
 */
export function MobileTabSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5 animate-rise" aria-busy="true">
      <LoadingAnnounce />
      <Skeleton h={152} r={24} />
      <div className="flex gap-3">
        {[0, 1, 2].map(i => (
          <Skeleton key={i} h={100} r={16} className="flex-1" />
        ))}
      </div>
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
          <Skeleton h={10} w={120} r={4} />
        </div>
        <div className="divide-y divide-white/[0.06]">
          {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    </div>
  )
}

function SkeletonLane({ index, cards }: { index: number; cards: number }) {
  const reduced = useReducedMotion()
  return (
    <div className="flex flex-col gap-3 animate-rise" style={staggerDelay(index, 70, reduced)}>
      <div className="flex items-center justify-between">
        <Skeleton h={12} w="44%" r={5} />
        <Skeleton h={12} w={22} r={5} />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 space-y-2.5">
          <Skeleton h={13} w="82%" r={6} />
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  )
}

/**
 * Desktop: the structural board placeholder. A hero spine sits above N lanes
 * that shimmer in with a gentle left-to-right stagger — the breadth of the
 * workspace assembling itself, which is exactly what a desk session is for.
 */
export function BoardSkeleton({
  lanes = 3,
  cardsPerLane = 3,
  hero = true,
}: { lanes?: number; cardsPerLane?: number; hero?: boolean }) {
  return (
    <div className="animate-rise" aria-busy="true">
      <LoadingAnnounce />
      {hero && <Skeleton h={96} r={20} className="mb-6" />}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: `repeat(${lanes}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: lanes }).map((_, i) => (
          <SkeletonLane key={i} index={i} cards={cardsPerLane} />
        ))}
      </div>
    </div>
  )
}
