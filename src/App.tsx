import React, { useState, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/shared/Toast'
import { DesktopSidebar } from './components/DesktopSidebar'
import { BottomNav } from './components/BottomNav'
import { SystemsPanel } from './components/SystemsPanel'
import { CommandPalette } from './components/CommandPalette'
import { DesktopHome } from './components/desktop/DesktopHome'
import { DesktopTriage } from './components/desktop/DesktopTriage'
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
import { MobileTriage } from './components/mobile/MobileTriage'
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

type TabId = 'home' | 'today' | 'triage' | 'leads' | 'relationships' | 'customers' | 'guests' | 'content' | 'org' | 'exec' | 'workflows' | 'systems'
const VALID_TABS: TabId[] = ['home', 'today', 'triage', 'leads', 'relationships', 'customers', 'guests', 'content', 'org', 'exec', 'workflows', 'systems']

/**
 * Mobile magnification. The native-feel mobile design was rendering ~25% too
 * small on real phones, so we scale the entire mobile shell up by this factor.
 * `zoom` is the one knob that grows everything uniformly — px and rem text,
 * icons, gaps, the BottomNav — without rewriting hundreds of utility classes.
 *
 * The catch: `zoom` does NOT change what `100dvh` resolves to (it always means
 * the real viewport), so a zoomed `100dvh` element would render 25% too tall
 * and break the no-scroll app-shell invariant. We anchor the single root at
 * `calc(100dvh / SCALE)` — which renders back to exactly one viewport — and the
 * mobile shells inherit height via `h-full` rather than re-anchoring to dvh.
 */
const MOBILE_SCALE = 1.25

function detectIsNarrow() {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 900
}

export default function App() {
  const { route, navigate } = useHashRoute()
  const rawTab = route.tab === 'execution' ? 'exec' : route.tab
  const tab: TabId = (VALID_TABS as string[]).includes(rawTab) ? (rawTab as TabId) : 'home'
  const [narrow, setNarrow] = useState(detectIsNarrow)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)

  useEffect(() => {
    const onResize = () => setNarrow(detectIsNarrow())
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
        <div
          className="overflow-hidden bg-[#0a0a0b] text-white flex flex-row"
          style={
            narrow
              ? { zoom: MOBILE_SCALE, height: `calc(100dvh / ${MOBILE_SCALE})` }
              : { height: '100dvh' }
          }
        >
          {!narrow && <DesktopSidebar active={tab} onChange={handleTab} />}
          {/* No-scroll app shell: the window never scrolls. main is a fixed,
              non-scrolling region; each tab owns its inner scroll — mobile via its
              h-[100dvh] MobileShell, desktop via a contained-scroll wrapper (or the
              Content tab's AppFrame). Chrome (sidebar / bottom nav) stays put. */}
          <main className="flex-1 min-w-0 overflow-hidden">
            {narrow ? (
              <>
                {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                {tab === 'triage'    && <ErrorBoundary label="Triage"><MobileTriage onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'leads'     && <ErrorBoundary label="Leads"><MobileLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'relationships' && <ErrorBoundary label="Leads"><MobileLeadsRE onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'customers' && <ErrorBoundary label="Customers"><MobileCustomers /></ErrorBoundary>}
                {tab === 'guests'    && <ErrorBoundary label="Visibility"><MobileGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'content'   && <ErrorBoundary label="Content"><MobileContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>}
                {tab === 'exec'      && <ErrorBoundary label="Intel"><MobileIntel /></ErrorBoundary>}
                {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrg /></ErrorBoundary>}
                {tab === 'workflows' && <ErrorBoundary label="Flows"><MobileFlows /></ErrorBoundary>}
                {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
              </>
            ) : tab === 'content' ? (
              <ErrorBoundary label="Content"><DesktopContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>
            ) : (
              <div className="h-full overflow-y-auto px-6 py-6">
                {tab === 'home'      && <ErrorBoundary label="Home"><DesktopHome onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday selectedTaskId={route.params.task || null} onSelectTask={(id) => navigate('today', id ? { task: id } : {})} lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                {tab === 'triage'    && <ErrorBoundary label="Triage"><DesktopTriage onNavigate={navigate} /></ErrorBoundary>}
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
