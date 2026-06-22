import React, { useState, useEffect, lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/shared/Toast'
import { DesktopSidebar } from './components/DesktopSidebar'
import { BottomNav } from './components/BottomNav'
import { CommandPalette } from './components/CommandPalette'
import { AgentsProvider } from './contexts/AgentsContext'
import { PendingFlagModal } from './components/PendingFlagModal'
import { QuickCaptureIdea } from './components/QuickCaptureIdea'
import { IdeaCaptureModal, isInboxEnabled } from './components/inbox/IdeaCaptureModal'
import { CaptureSpeedDial } from './components/CaptureSpeedDial'
import { WeeklyFocusTakeover } from './components/objectives/WeeklyFocusTakeover'
import { FocusRitual } from './components/home/FocusRitual'
import { isFocusRitualEnabled } from './lib/homeV2'
import { useHashRoute } from './hooks/useHashRoute'
import { MobileTabSkeleton, BoardSkeleton } from './components/shared/Skeleton'

/**
 * Route surfaces are code-split: each tab is its own chunk, fetched on demand,
 * so the initial load ships only the shell + the first tab instead of all 22
 * surfaces. The Suspense fallback is the SAME calm skeleton language as
 * first-paint data loading, so a cold chunk fetch and a cold data fetch look
 * identical — one continuous settle, never a flash of nothing.
 *
 * The shell (sidebar, bottom nav, command palette, capture, modals) stays eager
 * because it's always on screen or latency-sensitive (⌘K must open instantly).
 */
const DesktopHome = lazy(() => import('./components/desktop/DesktopHome').then(m => ({ default: m.DesktopHome })))
const DesktopToday = lazy(() => import('./components/desktop/DesktopToday').then(m => ({ default: m.DesktopToday })))
const DesktopLeads = lazy(() => import('./components/desktop/DesktopLeads').then(m => ({ default: m.DesktopLeads })))
const DesktopLeadsRE = lazy(() => import('./components/desktop/DesktopLeadsRE').then(m => ({ default: m.DesktopLeadsRE })))
const DesktopOrg = lazy(() => import('./components/desktop/DesktopOrg').then(m => ({ default: m.DesktopOrg })))
const DesktopExec = lazy(() => import('./components/desktop/DesktopExec').then(m => ({ default: m.DesktopExec })))
const DesktopFlows = lazy(() => import('./components/desktop/DesktopFlows').then(m => ({ default: m.DesktopFlows })))
const DesktopCustomers = lazy(() => import('./components/desktop/DesktopCustomers').then(m => ({ default: m.DesktopCustomers })))
const DesktopGuests = lazy(() => import('./components/desktop/DesktopGuests').then(m => ({ default: m.DesktopGuests })))
const DesktopContent = lazy(() => import('./components/desktop/DesktopContent').then(m => ({ default: m.DesktopContent })))
const SystemsPanel = lazy(() => import('./components/SystemsPanel').then(m => ({ default: m.SystemsPanel })))
const MobileHome = lazy(() => import('./components/mobile/MobileHome').then(m => ({ default: m.MobileHome })))
const MobileToday = lazy(() => import('./components/mobile/MobileToday').then(m => ({ default: m.MobileToday })))
const MobileLeads = lazy(() => import('./components/mobile/MobileLeads').then(m => ({ default: m.MobileLeads })))
const MobileLeadsRE = lazy(() => import('./components/mobile/MobileLeadsRE').then(m => ({ default: m.MobileLeadsRE })))
const MobileIntel = lazy(() => import('./components/mobile/MobileIntel').then(m => ({ default: m.MobileIntel })))
const MobileOrg = lazy(() => import('./components/mobile/MobileOrg').then(m => ({ default: m.MobileOrg })))
const MobileFlows = lazy(() => import('./components/mobile/MobileFlows').then(m => ({ default: m.MobileFlows })))
const MobileSystems = lazy(() => import('./components/mobile/MobileSystems').then(m => ({ default: m.MobileSystems })))
const MobileCustomers = lazy(() => import('./components/mobile/MobileCustomers').then(m => ({ default: m.MobileCustomers })))
const MobileGuests = lazy(() => import('./components/mobile/MobileGuests').then(m => ({ default: m.MobileGuests })))
const MobileContent = lazy(() => import('./components/mobile/MobileContent').then(m => ({ default: m.MobileContent })))
const ContentComposer = lazy(() => import('./components/content/ContentComposer').then(m => ({ default: m.ContentComposer })))

type TabId = 'home' | 'today' | 'leads' | 'relationships' | 'customers' | 'guests' | 'content' | 'org' | 'exec' | 'workflows' | 'systems'
const VALID_TABS: TabId[] = ['home', 'today', 'leads', 'relationships', 'customers', 'guests', 'content', 'org', 'exec', 'workflows', 'systems']

/** Calm chunk-load fallback for a mobile route (single-focus, one column). */
function MobileRouteFallback() {
  return (
    <div className="px-5 pt-7 pb-5 h-[calc(100dvh/var(--z,1))]">
      <MobileTabSkeleton />
    </div>
  )
}

/** Calm chunk-load fallback for a desktop route (structural breadth). */
function DesktopRouteFallback() {
  return <BoardSkeleton lanes={3} cardsPerLane={3} />
}

/**
 * Mobile vs desktop layout selection.
 *
 * We key off the *pointer type*, not the pixel width. A coarse primary pointer
 * means a touch device (phone / tablet) — and crucially it is zoom-invariant:
 * browser/page zoom changes `innerWidth` but never the pointer media, so a phone
 * always gets the native mobile layout and never flips to the desktop shell when
 * the user pinches or changes the browser zoom. The width check is only a
 * fallback for desktop browsers dragged to a narrow window.
 */
function detectIsMobile() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return coarsePointer || window.innerWidth < 900
}

export default function App() {
  const { route, navigate } = useHashRoute()
  const rawTab = route.tab === 'execution' ? 'exec' : route.tab
  const tab: TabId = (VALID_TABS as string[]).includes(rawTab) ? (rawTab as TabId) : 'home'
  const [narrow, setNarrow] = useState(detectIsMobile)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)

  useEffect(() => {
    const onResize = () => setNarrow(detectIsMobile())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && isInboxEnabled()) {
        e.preventDefault()
        setInboxOpen(o => !o)
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
        setInboxOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleTab = (id: string) => {
    const normalised = id === 'execution' ? 'exec' : id
    navigate(normalised)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <ToastProvider>
      <AgentsProvider>
        <div className="h-[100dvh] overflow-hidden bg-[#0a0a0b] text-white flex flex-row">
          {!narrow && <DesktopSidebar active={tab} onChange={handleTab} />}
          {/* No-scroll app shell: the window never scrolls. main is a fixed,
              non-scrolling region; each tab owns its inner scroll — mobile via its
              h-[100dvh] MobileShell, desktop via a contained-scroll wrapper (or the
              Content tab's AppFrame). Chrome (sidebar / bottom nav) stays put. */}
          <main className="flex-1 min-w-0 overflow-hidden">
            {narrow ? (
              // Mobile zoom: render the whole mobile experience 20% larger than
              // design size. `zoom` scales px + rem uniformly (this codebase uses
              // many px-literal sizes, so a rem bump alone would be patchy). The
              // wrapper is compensated to the viewport (width/height ÷ 1.2) so the
              // zoomed box still fits exactly, and it publishes `--z` so the
              // fixed-viewport shells and full-screen sheets inside can divide
              // their own 100dvh/100vw by the same factor. The BottomNav sits
              // OUTSIDE this wrapper, so it stays at native size.
              <div
                className="mobile-zoom-root"
                style={{ zoom: 1.2, width: 'calc(100vw / 1.2)', height: 'calc(100dvh / 1.2)', '--z': '1.2' } as React.CSSProperties}
              >
                <Suspense fallback={<MobileRouteFallback />}>
                  {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                  {tab === 'leads'     && <ErrorBoundary label="Leads"><MobileLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'relationships' && <ErrorBoundary label="Leads"><MobileLeadsRE onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'customers' && <ErrorBoundary label="Customers"><MobileCustomers /></ErrorBoundary>}
                  {tab === 'guests'    && <ErrorBoundary label="Visibility"><MobileGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'content'   && <ErrorBoundary label="Content"><MobileContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>}
                  {tab === 'exec'      && <ErrorBoundary label="Intel"><MobileIntel /></ErrorBoundary>}
                  {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrg /></ErrorBoundary>}
                  {tab === 'workflows' && <ErrorBoundary label="Flows"><MobileFlows /></ErrorBoundary>}
                  {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
                </Suspense>
              </div>
            ) : tab === 'content' ? (
              <Suspense fallback={<div className="p-6"><BoardSkeleton lanes={3} cardsPerLane={3} /></div>}>
                <ErrorBoundary label="Content"><DesktopContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>
              </Suspense>
            ) : (
              <div className="h-full overflow-y-auto px-6 py-6">
                <Suspense fallback={<DesktopRouteFallback />}>
                  {tab === 'home'      && <ErrorBoundary label="Home"><DesktopHome onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday selectedTaskId={route.params.task || null} onSelectTask={(id) => navigate('today', id ? { task: id } : {})} lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                  {tab === 'leads'     && <ErrorBoundary label="Leads"><DesktopLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'relationships' && <ErrorBoundary label="Leads"><DesktopLeadsRE onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'customers' && <ErrorBoundary label="Customers"><DesktopCustomers /></ErrorBoundary>}
                  {tab === 'guests'    && <ErrorBoundary label="Visibility"><DesktopGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'org'       && <ErrorBoundary label="Org"><DesktopOrg /></ErrorBoundary>}
                  {tab === 'exec'      && <ErrorBoundary label="Intel"><DesktopExec /></ErrorBoundary>}
                  {tab === 'workflows' && <ErrorBoundary label="Flows"><DesktopFlows /></ErrorBoundary>}
                  {tab === 'systems'   && <ErrorBoundary label="Systems"><SystemsPanel /></ErrorBoundary>}
                </Suspense>
              </div>
            )}
          </main>
          {narrow && <BottomNav active={tab} onChange={handleTab} />}
          {/* Full-screen content composer — owns the screen for one piece when an
              idea is deep-linked on the Content tab. Esc / back clears the param. */}
          {tab === 'content' && route.params.idea && (
            <ErrorBoundary label="Composer">
              <Suspense fallback={null}>
                <ContentComposer
                  ideaId={route.params.idea}
                  narrow={narrow}
                  onClose={() => navigate('content')}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onTab={handleTab} />
          <PendingFlagModal />
          <QuickCaptureIdea />
          <IdeaCaptureModal open={inboxOpen} onClose={() => setInboxOpen(false)} />
          <CaptureSpeedDial />
          {/* Focus Ritual (unified): one guided stepper across portfolio / week /
              today, mounted once so it z-stacks above both shells. It subsumes the
              standalone WeeklyFocusTakeover, so the two are mutually exclusive. */}
          {isFocusRitualEnabled() ? (
            <FocusRitual narrow={narrow} tab={tab} onNavigate={navigate} />
          ) : (
            <WeeklyFocusTakeover narrow={narrow} tab={tab} />
          )}
        </div>
      </AgentsProvider>
    </ToastProvider>
  )
}
