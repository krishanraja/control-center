import React, { lazy, Suspense } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { isUiV2 } from '../../lib/uiV2'
import { BoardSkeleton, MobileTabSkeleton, DeferredFallback } from '../shared/Skeleton'
import { SegmentedNav } from '../shared/SegmentedNav'

// People: the one tab for every human pipeline. Pipeline (leads), Network
// (contacts), and Visibility (guests + targets) share the same UI grammar
// (triage board + swipe deck) over different tables, so they render here as
// lanes behind one nav entry instead of three. The lane components are the
// existing tab components, untouched; each stays its own lazy chunk.

const DesktopLeads = lazy(() => import('../desktop/DesktopLeads').then(m => ({ default: m.DesktopLeads })))
const DesktopLeadsRE = lazy(() => import('../desktop/DesktopLeadsRE').then(m => ({ default: m.DesktopLeadsRE })))
// UI v2 Network: one server-ranked surface for both device classes. The old
// lane keeps its own chunk so the flag can be flipped back without a rebuild.
const NetworkTab = lazy(() => import('../network/NetworkTab').then(m => ({ default: m.NetworkTab })))
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

/**
 * Infer the lane from deep-link params when none is set explicitly.
 * Network is the default: the 10k-contact network is what the tab is opened
 * for day to day; Pipeline and Visibility are the lanes you go to on purpose
 * (and their deep links still land directly).
 */
function inferLane(params: Record<string, string>): PeopleLane {
  const lane = params.lane as PeopleLane | undefined
  if (lane === 'pipeline' || lane === 'network' || lane === 'visibility') return lane
  if (params.guest || params.target) return 'visibility'
  if (params.lead) return 'pipeline'
  return 'network'
}

export function PeopleTab({ narrow, params, onNavigate }: Props) {
  const lane = inferLane(params)
  const setLane = (next: PeopleLane) => onNavigate('people', { lane: next })
  const clearDetail = () => onNavigate('people', { lane })

  // Krish: "in light mode the pipeline/network/visibility buttons in the top
  // right of the people tab are not visible and they are too far in the
  // corner/out of sight for very important buttons."
  //
  // Two bugs, both fixed and both now the shared control's problem rather than
  // this file's. (1) `bg-black/70` was the one colour here that is NOT theme
  // remapped: tailwind.config maps `white` to --fg so it flips to ink in light
  // mode, but `black` stays black, giving ink text on a black pill, invisible on
  // paper. The segmented variant uses the `base` token, which flips. (2) A fixed
  // pill in the top-right corner is the worst position on a phone, furthest from
  // the thumb and easy to miss, so it is a full-width segmented control in the
  // normal flow.
  const switcher = (
    <SegmentedNav<PeopleLane>
      segments={LANES}
      value={lane}
      onChange={setLane}
      label="People lanes"
      variant={narrow ? 'segmented' : 'bordered'}
      className={narrow ? 'mb-3 shrink-0' : 'mb-4'}
      testIdPrefix="people-lane"
    />
  )

  const fallback = (
    <DeferredFallback>
      {narrow
        ? <div className="px-5 pt-7 pb-5"><MobileTabSkeleton /></div>
        : <BoardSkeleton lanes={3} cardsPerLane={3} />}
    </DeferredFallback>
  )

  const body = (
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
          {isUiV2()
            ? <NetworkTab narrow={narrow} />
            : narrow ? <MobileLeadsRE onNavigate={onNavigate} /> : <DesktopLeadsRE onNavigate={onNavigate} />}
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
  )

  // Narrow: same column contract as OsTab — the lane switcher and the lane's
  // MobileShell share one viewport-height column so the shell fits under the
  // switcher instead of overflowing the zoom root's clip box.
  if (narrow) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {switcher}
        <div className="flex-1 min-h-0">{body}</div>
      </div>
    )
  }

  return (
    <>
      {switcher}
      {body}
    </>
  )
}
