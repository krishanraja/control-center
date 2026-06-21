import React, { useState, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/shared/Toast'
import { DesktopSidebar } from './components/DesktopSidebar'
import { BottomNav } from './components/BottomNav'
import { SystemsPanel } from './components/SystemsPanel'
import { CommandPalette } from './components/CommandPalette'
import { DesktopHome } from './components/desktop/DesktopHome'
import { DesktopToday } from './components/desktop/DesktopToday'
import { DesktopLeads } from './components/desktop/DesktopLeads'
import { DesktopLeadsRE } from './components/desktop/DesktopLeadsRE'
import { DesktopOrg } from './components/desktop/DesktopOrg'
import { DesktopExec } from './components/desktop/DesktopExec'
import { DesktopFlows } from './components/desktop/DesktopFlows'
import { DesktopCustomers } from './components/desktop/DesktopCustomers'
import { DesktopGuests } from './components/desktop/DesktopGuests'
import { DesktopContent } from './components/desktop/DesktopContent'
import { MobileHome } from './components/mobile/MobileHome'
import { MobileToday } from './components/mobile/MobileToday'
import { MobileLeads } from './components/mobile/MobileLeads'
import { MobileLeadsRE } from './components/mobile/MobileLeadsRE'
import { MobileIntel } from './components/mobile/MobileIntel'
import { MobileOrg } from './components/mobile/MobileOrg'
import { MobileFlows } from './components/mobile/MobileFlows'
import { MobileSystems } from './components/mobile/MobileSystems'
import { MobileCustomers } from './components/mobile/MobileCustomers'
import { MobileGuests } from './components/mobile/MobileGuests'
import { MobileContent } from './components/mobile/MobileContent'
import { ContentComposer } from './components/content/ContentComposer'
import { AgentsProvider } from './contexts/AgentsContext'
import { PendingFlagModal } from './components/PendingFlagModal'
import { QuickCaptureIdea } from './components/QuickCaptureIdea'
import { IdeaCaptureModal, isInboxEnabled } from './components/inbox/IdeaCaptureModal'
import { CaptureSpeedDial } from './components/CaptureSpeedDial'
import { WeeklyFocusTakeover } from './components/objectives/WeeklyFocusTakeover'
import { FocusRitual } from './components/home/FocusRitual'
import { isFocusRitualEnabled } from './lib/homeV2'
import { useHashRoute } from './hooks/useHashRoute'

type TabId = 'home' | 'today' | 'leads' | 'relationships' | 'customers' | 'guests' | 'content' | 'org' | 'exec' | 'workflows' | 'systems'
const VALID_TABS: TabId[] = ['home', 'today', 'leads', 'relationships', 'customers', 'guests', 'content', 'org', 'exec', 'workflows', 'systems']

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
              </div>
            ) : tab === 'content' ? (
              <ErrorBoundary label="Content"><DesktopContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>
            ) : (
              <div className="h-full overflow-y-auto px-6 py-6">
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
              </div>
            )}
          </main>
          {narrow && <BottomNav active={tab} onChange={handleTab} />}
          {/* Full-screen content composer — owns the screen for one piece when an
              idea is deep-linked on the Content tab. Esc / back clears the param. */}
          {tab === 'content' && route.params.idea && (
            <ErrorBoundary label="Composer">
              <ContentComposer
                ideaId={route.params.idea}
                narrow={narrow}
                onClose={() => navigate('content')}
              />
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
