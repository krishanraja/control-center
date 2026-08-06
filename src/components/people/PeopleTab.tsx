import React, { lazy, Suspense } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { BoardSkeleton, MobileTabSkeleton } from '../shared/Skeleton'

// People: the one tab for every human pipeline. Pipeline (leads), Network
// (contacts), and Visibility (guests + targets) share the same UI grammar
// (triage board + swipe deck) over different tables, so they render here as
// lanes behind one nav entry instead of three. The lane components are the
// existing tab components, untouched; each stays its own lazy chunk.

const DesktopLeads = lazy(() => import('../desktop/DesktopLeads').then(m => ({ default: m.DesktopLeads })))
const DesktopLeadsRE = lazy(() => import('../desktop/DesktopLeadsRE').then(m => ({ default: m.DesktopLeadsRE })))
const DesktopGuests = lazy(() => import('../desktop/DesktopGuests').then(m => ({ default: m.DesktopGuests })))
const MobileLeads = lazy(() => import('../mobile/MobileLeads').then(m => ({ default: m.MobileLeads })))
const MobileLeadsRE = lazy(() => import('../mobile/MobileLeadsRE').then(m => ({ default: m.MobileLeadsRE })))
const MobileGuests = lazy(() => import('../mobile/MobileGuests').then(m => ({ default: m.MobileGuests })))

export type PeopleLane = 'pipeline' | 'network' | 'visibility'

const LANES: Array<{ id: PeopleLane; label: string }> = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'network', label: 'Network' },
  { id: 'visibility', label: 'Visibility' },
]

interface Props {
  narrow: boolean
  params: Record<string, string>
  onNavigate: (tab: string, params?: Record<string, string>) => void
}

/** Infer the lane from deep-link params when none is set explicitly. */
function inferLane(params: Record<string, string>): PeopleLane {
  const lane = params.lane as PeopleLane | undefined
  if (lane === 'pipeline' || lane === 'network' || lane === 'visibility') return lane
  if (params.guest || params.target) return 'visibility'
  if (params.lead) return 'pipeline'
  return 'pipeline'
}

export function PeopleTab({ narrow, params, onNavigate }: Props) {
  const lane = inferLane(params)
  const setLane = (next: PeopleLane) => onNavigate('people', { lane: next })
  const clearDetail = () => onNavigate('people', { lane })

  const switcher = (
    <div
      role="tablist"
      aria-label="People lanes"
      // Krish: "in light mode the pipeline/network/visibility buttons in the top
      // right of the people tab are not visible and they are too far in the
      // corner/out of sight for very important buttons."
      //
      // TWO bugs. (1) `bg-black/70` is the only colour here that is NOT theme
      // remapped: tailwind.config maps `white` to --fg so it flips to ink in
      // light mode, but `black` stays black. Result: ink text on a black pill,
      // invisible on paper. Uses the `base` token now, which flips. (2) A fixed
      // pill in the top-right corner is the worst position on a phone: furthest
      // from the thumb and easy to miss. It is now a full-width segmented
      // control in the normal flow, where the lane switch is legible and
      // reachable.
      className={narrow
        ? 'flex gap-1 mb-3 rounded-xl border border-white/10 bg-base/80 backdrop-blur p-1'
        : 'flex gap-1 mb-4'}
    >
      {LANES.map(l => (
        <button
          key={l.id}
          role="tab"
          aria-selected={lane === l.id}
          onClick={() => setLane(l.id)}
          className={narrow
            // flex-1 so the three lanes split the width evenly and each is a
            // real tap target rather than a 10px pill.
            ? `flex-1 min-h-[38px] rounded-lg text-[12px] font-semibold transition-colors ${
                lane === l.id ? 'bg-white/15 text-white' : 'text-white/55'}`
            : `px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                lane === l.id
                  ? 'border-white/20 bg-white/[0.08] text-white'
                  : 'border-white/[0.06] text-white/45 hover:text-white/75 hover:border-white/15'
              }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )

  const fallback = narrow
    ? <div className="px-5 pt-7 pb-5"><MobileTabSkeleton /></div>
    : <BoardSkeleton lanes={3} cardsPerLane={3} />

  return (
    <>
      {switcher}
      <Suspense fallback={fallback}>
        {lane === 'pipeline' && (
          <ErrorBoundary label="Pipeline">
            {narrow
              ? <MobileLeads leadId={params.lead || null} onClearDetail={clearDetail} onNavigate={onNavigate} />
              : <DesktopLeads leadId={params.lead || null} onClearDetail={clearDetail} onNavigate={onNavigate} />}
          </ErrorBoundary>
        )}
        {lane === 'network' && (
          <ErrorBoundary label="Network">
            {narrow ? <MobileLeadsRE onNavigate={onNavigate} /> : <DesktopLeadsRE onNavigate={onNavigate} />}
          </ErrorBoundary>
        )}
        {lane === 'visibility' && (
          <ErrorBoundary label="Visibility">
            {narrow
              ? <MobileGuests guestId={params.guest || null} targetId={params.target || null} onClearDetail={clearDetail} onNavigate={onNavigate} />
              : <DesktopGuests guestId={params.guest || null} targetId={params.target || null} onClearDetail={clearDetail} onNavigate={onNavigate} />}
          </ErrorBoundary>
        )}
      </Suspense>
    </>
  )
}
