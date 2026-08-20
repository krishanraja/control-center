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

/**
 * A single shimmering block. Uses the global `.skeleton` sweep.
 *
 * `quiet` holds the same box with no fill and no sweep. That distinction
 * matters wherever a placeholder is reserving space rather than announcing a
 * wait: the space has to exist from the first frame or the content below it
 * gets shoved when data lands, but the shimmer must not appear until the wait
 * has actually earned it, or a 60ms cache hit flashes a placeholder. Reserve
 * immediately, shimmer on the deferred flag:
 *
 *   const waiting = useDeferredPending(loading)
 *   <Skeleton quiet={!waiting} h={62} />
 */
export function Skeleton({
  w = '100%',
  h = 14,
  r = 8,
  quiet = false,
  className = '',
}: { w?: Dim; h?: Dim; r?: number; quiet?: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      className={`${quiet ? '' : 'skeleton'} ${className}`}
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
 * The drop-in loading placeholder for any list/feed content area — the world-class
 * replacement for a bare "Loading…" line. It reserves the space the real rows will
 * occupy (so data settles in place instead of shifting layout) and reveals with the
 * shared `animate-rise`. `card` matches spaced card lists (GuestCard/ContentCard);
 * the default matches divided feed rows.
 */
export function SkeletonList({ rows = 3, card = true }: { rows?: number; card?: boolean }) {
  if (card) {
    return (
      <div className="space-y-2 animate-rise" aria-busy="true" role="status" aria-label="Loading">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2.5">
            <Skeleton h={14} w="72%" r={6} />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="divide-y divide-white/[0.06] animate-rise" aria-busy="true" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
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

/**
 * A detail surface arriving: a sheet, a right pane, or a full-screen editor.
 *
 * These were the app's remaining silent gaps. The composer and the brief editor
 * are full-screen takeovers reached by deep link behind `fallback={null}`, so
 * they arrived out of a blank screen; the composer then showed a bare unlabelled
 * spinner on top of that. A detail surface has a very recognisable anatomy —
 * a title, a couple of meta lines, a body, an action row — so restoring that
 * shape means the real thing settles into place instead of replacing a void.
 */
export function SkeletonDetail({ full = false }: { full?: boolean }) {
  return (
    <div
      // `full` sizes off --z, not inset-0. The mobile shell renders inside a
      // `zoom: 1.2` wrapper and publishes --z, and a fixed element there does
      // not resolve inset-0 against the zoomed box. Every other full-screen
      // surface in this app divides by --z for the same reason.
      className={`animate-rise space-y-5 ${full ? 'fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-[90] bg-base px-6 py-8 overflow-hidden' : 'p-6'}`}
      aria-busy="true"
    >
      <LoadingAnnounce />
      <div className="space-y-2.5">
        <Skeleton h={12} w={90} r={5} />
        <Skeleton h={24} w="62%" r={8} />
      </div>
      <div className="flex gap-2">
        <Skeleton h={22} w={78} r={11} />
        <Skeleton h={22} w={64} r={11} />
        <Skeleton h={22} w={92} r={11} />
      </div>
      <div className="space-y-3 pt-1">
        <SkeletonText lines={3} />
        <SkeletonText lines={4} />
        <SkeletonText lines={2} />
      </div>
      <div className="flex gap-2.5 pt-2">
        <Skeleton h={40} w={132} r={14} />
        <Skeleton h={40} w={104} r={14} />
      </div>
    </div>
  )
}

/**
 * Home, arriving as one page.
 *
 * Home is the landing route and had no loading gate at all. It composes about
 * fifteen independently-loading children, six of which returned null while they
 * waited, so the page assembled itself in public: a banner appeared, then the
 * spine pushed everything down, then the ladder pushed it down again. Every
 * cold load was a sequence of small shoves.
 *
 * So the whole page gets one placeholder in its real proportions, and the
 * children stop being individually responsible for the first paint.
 */
export function HomeSkeleton({ narrow = false }: { narrow?: boolean }) {
  if (narrow) {
    return (
      <div className="flex flex-col gap-4 animate-rise" aria-busy="true">
        <LoadingAnnounce />
        {/* ship ledger + due tests */}
        <Skeleton h={64} r={18} />
        {/* the altitude spine: three stacked hero cards */}
        {[0, 1, 2].map(i => <Skeleton key={i} h={104} r={20} />)}
        {/* the goal ladder */}
        <Skeleton h={132} r={20} />
        {/* the day */}
        <Skeleton h={88} r={18} />
        {/* action inbox */}
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
            <Skeleton h={10} w={132} r={4} />
          </div>
          <div className="divide-y divide-white/[0.06]">
            {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="animate-rise" aria-busy="true">
      <LoadingAnnounce />
      {/* glance: the five-second answer, three figures across */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[0, 1, 2].map(i => <Skeleton key={i} h={92} r={18} />)}
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)' }}>
        <div className="flex flex-col gap-5">
          <Skeleton h={120} r={20} />
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <Skeleton h={10} w={124} r={4} />
            </div>
            <div className="divide-y divide-white/[0.06]">
              {[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map(i => (
            <SkeletonLane key={i} index={i} cards={1} />
          ))}
        </div>
      </div>
    </div>
  )
}
