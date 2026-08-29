import React, { lazy, Suspense } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { BoardSkeleton, MobileTabSkeleton, DeferredFallback } from '../shared/Skeleton'
import { SegmentedNav } from '../shared/SegmentedNav'

// OS: the back office behind one drawer entry. Queue (every typed ruling
// waiting on Krish — relocated from Home in the 2026-08-20 recompose), Org
// (agents + corrections), Intel (the Business Intelligence console — the
// KPI band, Marcus's read, signals and bets), Flows (workflows + Skill
// Forge), and Systems (health board) render as subtabs of one tab instead of
// five nav entries. Home links to the Queue via its vitals count; legacy
// #/today ruling deep links land here with their params intact.

const QueueSubtab = lazy(() => import('./queue/QueueSubtab').then(m => ({ default: m.QueueSubtab })))
const DesktopOrg = lazy(() => import('../desktop/DesktopOrg').then(m => ({ default: m.DesktopOrg })))
const BusinessIntelTab = lazy(() => import('../intel/BusinessIntelTab').then(m => ({ default: m.BusinessIntelTab })))
const DesktopFlows = lazy(() => import('../desktop/DesktopFlows').then(m => ({ default: m.DesktopFlows })))
const SystemsPanel = lazy(() => import('../SystemsPanel').then(m => ({ default: m.SystemsPanel })))
const MobileOrg = lazy(() => import('../mobile/MobileOrg').then(m => ({ default: m.MobileOrg })))
const MobileFlows = lazy(() => import('../mobile/MobileFlows').then(m => ({ default: m.MobileFlows })))
const MobileSystems = lazy(() => import('../mobile/MobileSystems').then(m => ({ default: m.MobileSystems })))

export type OsSub = 'queue' | 'org' | 'intel' | 'flows' | 'systems'

const SUBS: Array<{ id: OsSub; label: string }> = [
  { id: 'queue', label: 'Queue' },
  { id: 'org', label: 'Org' },
  { id: 'intel', label: 'Intel' },
  { id: 'flows', label: 'Flows' },
  { id: 'systems', label: 'Systems' },
]

interface Props {
  narrow: boolean
  params: Record<string, string>
  onNavigate: (tab: string, params?: Record<string, string>) => void
}

function inferSub(params: Record<string, string>): OsSub {
  // A correction / skill-proposal deep link always lands on Org; DesktopOrg's
  // own hash reader then scrolls the row into view (the alias layer preserves
  // the original ?correction= param in the hash).
  if (params.correction || params.skill_proposal) return 'org'
  // A ruling deep link (legacy #/today?task= / ?decision=) lands on the Queue,
  // which seeds the deck to the referenced row.
  if (params.task || params.decision) return 'queue'
  const sub = params.sub as OsSub | undefined
  if (sub === 'queue' || sub === 'org' || sub === 'intel' || sub === 'flows' || sub === 'systems') return sub
  return 'queue'
}

export function OsTab({ narrow, params, onNavigate }: Props) {
  const sub = inferSub(params)
  const setSub = (next: OsSub) => onNavigate('os', { sub: next })

  const switcher = (
    <SegmentedNav<OsSub>
      segments={SUBS}
      value={sub}
      onChange={setSub}
      label="OS sections"
      variant={narrow ? 'segmented' : 'bordered'}
      className={narrow ? 'mb-3 shrink-0' : 'mb-4'}
      testIdPrefix="os-sub"
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
      {sub === 'queue' && (
        <ErrorBoundary label="Queue">
          <QueueSubtab
            narrow={narrow}
            onNavigate={onNavigate}
            deepTask={params.task || null}
            deepDecision={params.decision || null}
          />
        </ErrorBoundary>
      )}
      {sub === 'org' && (
        <ErrorBoundary label="Org">{narrow ? <MobileOrg /> : <DesktopOrg />}</ErrorBoundary>
      )}
      {sub === 'intel' && (
        <ErrorBoundary label="Intel"><BusinessIntelTab narrow={narrow} /></ErrorBoundary>
      )}
      {sub === 'flows' && (
        <ErrorBoundary label="Flows">{narrow ? <MobileFlows /> : <DesktopFlows />}</ErrorBoundary>
      )}
      {sub === 'systems' && (
        <ErrorBoundary label="Systems">{narrow ? <MobileSystems /> : <SystemsPanel />}</ErrorBoundary>
      )}
    </Suspense>
  )

  // Narrow: the switcher and the subtab share one viewport-height column, so
  // the subtab's MobileShell (h-full) gets the height that remains under the
  // switcher instead of claiming a fresh full viewport and overflowing the
  // zoom root's clip box. Desktop keeps the plain flow (its scroll container
  // lives in App's shell).
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
