import React, { useState, useEffect, lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/shared/Toast'
import { AmbientField } from './components/shared/AmbientField'
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
import { PilotGate } from './components/pilot/PilotGate'
import { EveningShutdown } from './components/pilot/EveningShutdown'
import { isFocusRitualEnabled } from './lib/homeV2'
import { isSimplifiedIA } from './lib/iaV3'
import { VALID_TAB_IDS } from './lib/tabs'
import { useHashRoute } from './hooks/useHashRoute'
import { contentV2Enabled } from './lib/contentV2'
import { BOTTOM_NAV_PAD } from './components/mobile/primitives'
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
const DesktopAcquisition = lazy(() => import('./components/desktop/DesktopAcquisition').then(m => ({ default: m.DesktopAcquisition })))
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
const MobileAcquisition = lazy(() => import('./components/mobile/MobileAcquisition').then(m => ({ default: m.MobileAcquisition })))
const MobileGuests = lazy(() => import('./components/mobile/MobileGuests').then(m => ({ default: m.MobileGuests })))
const MobileContent = lazy(() => import('./components/mobile/MobileContent').then(m => ({ default: m.MobileContent })))
const ContentComposer = lazy(() => import('./components/content/ContentComposer').then(m => ({ default: m.ContentComposer })))
// Content Engine v2 (docs/CONTENT-ENGINE-V2-SPEC.md): the four-room Content tab
// + the weekly-brief editor. Both flag-gated; the legacy triage surfaces render
// untouched when VITE_CONTENT_V2_ENABLED is off.
const ContentV2Tab = lazy(() => import('./components/content-v2/ContentV2Tab').then(m => ({ default: m.ContentV2Tab })))
const BriefEditor = lazy(() => import('./components/content-v2/BriefEditor').then(m => ({ default: m.BriefEditor })))
// Simplified-IA wrapper tabs (VITE_IA_V3_ENABLED): People = Pipeline + Network +
// Visibility lanes; OS = Org + Intel + Flows + Systems subtabs.
const PeopleTab = lazy(() => import('./components/people/PeopleTab').then(m => ({ default: m.PeopleTab })))
const OsTab = lazy(() => import('./components/os/OsTab').then(m => ({ default: m.OsTab })))

// Tab validity derives from the registry (src/lib/tabs.ts VALID_TAB_IDS) so the
// old hand-maintained duplicate list can never drift from the sidebar again.

// Legacy-hash aliases under the simplified IA. Render-time only (the hash is
// never rewritten), so bookmarks, navigate('leads') call sites, and deep-link
// params all keep working: `#/org?correction=x` resolves to the OS tab with
// { sub: 'org', correction: 'x' }. Route params win over alias-injected ones.
const IA_ALIASES: Record<string, { tab: string; params?: Record<string, string> }> = {
  today: { tab: 'home' },
  leads: { tab: 'people', params: { lane: 'pipeline' } },
  relationships: { tab: 'people', params: { lane: 'network' } },
  guests: { tab: 'people', params: { lane: 'visibility' } },
  org: { tab: 'os', params: { sub: 'org' } },
  exec: { tab: 'os', params: { sub: 'intel' } },
  workflows: { tab: 'os', params: { sub: 'flows' } },
  systems: { tab: 'os', params: { sub: 'systems' } },
}

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
 * A genuinely wide viewport is ALWAYS the desktop command center — even on a
 * touch screen (touchscreen laptop, large tablet in landscape, touch monitor,
 * or a browser in touch-emulation). Keying purely off pointer type used to force
 * those devices into the mobile shell, which then stretched edge-to-edge across
 * a full-width display and lost the desktop's deep-work density. So the width
 * gate takes precedence: at ≥ 1024px we hand over the full command center.
 *
 * Below that, we fall back to the *pointer type*, not the pixel width. A coarse
 * primary pointer means a phone / small tablet, and the check stays zoom-
 * invariant: browser/page zoom changes `innerWidth` but never the pointer media,
 * so a phone never flips shells when the user pinches or changes zoom (its width
 * stays well under the gate either way).
 */
function detectIsMobile() {
  if (typeof window === 'undefined') return false
  // Desktop-class width wins outright, regardless of pointer type.
  if (window.innerWidth >= 1024) return false
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return coarsePointer || window.innerWidth < 900
}

export default function App() {
  const { route, navigate } = useHashRoute()
  const rawTab = route.tab === 'execution' ? 'exec' : route.tab
  const alias = isSimplifiedIA() ? IA_ALIASES[rawTab] : undefined
  const resolvedTab = alias?.tab ?? rawTab
  const tab = VALID_TAB_IDS.has(resolvedTab) ? resolvedTab : 'home'
  const params = alias?.params ? { ...alias.params, ...route.params } : route.params
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

  // A deep-linked brief editor or content composer takes over the whole screen
  // (mirrors the render conditions below). While one is open we suppress the
  // BottomNav so it can't overlap the overlay's own bars on mobile.
  const fullScreenOverlayOpen = tab === 'content'
    && Boolean(route.params.idea || (contentV2Enabled() && route.params.brief))

  return (
    <ToastProvider>
      <AgentsProvider>
        {/* PILOT LAYER: today's check-in gates the whole shell. On a red day the
            gate renders one action instead of this tree until something ships.
            It fails open, so an unreachable pilot route never locks the app. */}
        <PilotGate onIntent={(intent) => navigate(intent.tab)}>
        <div className="h-[100dvh] overflow-hidden text-ink flex flex-row">
          <AmbientField />
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
                  {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome onNavigate={navigate} deepTask={params.task || null} deepDecision={params.decision || null} /></ErrorBoundary>}
                  {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                  {tab === 'leads'     && <ErrorBoundary label="Leads"><MobileLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'relationships' && <ErrorBoundary label="Leads"><MobileLeadsRE onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'customers' && <ErrorBoundary label="Customers"><MobileCustomers /></ErrorBoundary>}
                  {tab === 'acquisition' && <ErrorBoundary label="Growth"><MobileAcquisition onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'guests'    && <ErrorBoundary label="Visibility"><MobileGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'content'   && (contentV2Enabled()
                    // Reserve BottomNav clearance (like every MobileShell tab) so
                    // the deck's thumb-zone actions and the room scroll tails are
                    // never hidden behind the fixed nav bar.
                    ? <ErrorBoundary label="Content"><div className={`px-5 pt-7 h-full flex flex-col overflow-hidden ${BOTTOM_NAV_PAD}`}><ContentV2Tab variant="mobile" /></div></ErrorBoundary>
                    : <ErrorBoundary label="Content"><MobileContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>)}
                  {tab === 'exec'      && <ErrorBoundary label="Intel"><MobileIntel /></ErrorBoundary>}
                  {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrg /></ErrorBoundary>}
                  {tab === 'workflows' && <ErrorBoundary label="Flows"><MobileFlows /></ErrorBoundary>}
                  {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
                  {tab === 'people'    && <PeopleTab narrow params={params} onNavigate={navigate} />}
                  {tab === 'os'        && <OsTab narrow params={params} onNavigate={navigate} />}
                </Suspense>
              </div>
            ) : tab === 'content' ? (
              <Suspense fallback={<div className="p-6"><BoardSkeleton lanes={3} cardsPerLane={3} /></div>}>
                {contentV2Enabled()
                  ? <ErrorBoundary label="Content"><div className="h-full overflow-hidden px-6 py-6 flex flex-col"><ContentV2Tab variant="desktop" /></div></ErrorBoundary>
                  : <ErrorBoundary label="Content"><DesktopContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>}
              </Suspense>
            ) : (
              <div className="h-full overflow-y-auto px-6 py-6">
                <Suspense fallback={<DesktopRouteFallback />}>
                  {tab === 'home'      && <ErrorBoundary label="Home"><DesktopHome onNavigate={navigate} deepTask={params.task || null} deepDecision={params.decision || null} /></ErrorBoundary>}
                  {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday selectedTaskId={route.params.task || null} onSelectTask={(id) => navigate('today', id ? { task: id } : {})} lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                  {tab === 'leads'     && <ErrorBoundary label="Leads"><DesktopLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'relationships' && <ErrorBoundary label="Leads"><DesktopLeadsRE onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'customers' && <ErrorBoundary label="Customers"><DesktopCustomers /></ErrorBoundary>}
                  {tab === 'acquisition' && <ErrorBoundary label="Growth"><DesktopAcquisition lane={route.params.lane || null} sendId={route.params.send || null} seqId={route.params.seq || null} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'guests'    && <ErrorBoundary label="Visibility"><DesktopGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'org'       && <ErrorBoundary label="Org"><DesktopOrg /></ErrorBoundary>}
                  {tab === 'exec'      && <ErrorBoundary label="Intel"><DesktopExec /></ErrorBoundary>}
                  {tab === 'workflows' && <ErrorBoundary label="Flows"><DesktopFlows /></ErrorBoundary>}
                  {tab === 'systems'   && <ErrorBoundary label="Systems"><SystemsPanel /></ErrorBoundary>}
                  {tab === 'people'    && <PeopleTab narrow={false} params={params} onNavigate={navigate} />}
                  {tab === 'os'        && <OsTab narrow={false} params={params} onNavigate={navigate} />}
                </Suspense>
              </div>
            )}
          </main>
          {/* Hide the tab bar while a full-screen content overlay owns the screen.
              These overlays live in their own `zoom` stacking context, so a
              fixed z-50 BottomNav would otherwise punch through and collide with
              the editor's own bottom bars (the mobile nav-overlap bug). Each
              overlay carries its own "← Back", so the tab bar is redundant here. */}
          {narrow && !fullScreenOverlayOpen && <BottomNav active={tab} onChange={handleTab} />}
          {/* Full-screen content composer — owns the screen for one piece when an
              idea is deep-linked on the Content tab. Esc / back clears the param. */}
          {/* Full-screen weekly-brief editor (Content Engine v2) — same overlay
              contract as the composer; Esc / back clears the param. */}
          {contentV2Enabled() && tab === 'content' && route.params.brief && (
            <div style={narrow ? ({ zoom: 1.2, ['--z']: '1.2' } as React.CSSProperties) : undefined}>
              <ErrorBoundary label="Brief">
                <Suspense fallback={null}>
                  <BriefEditor
                    week={route.params.brief}
                    narrow={narrow}
                    onClose={() => navigate('content')}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {tab === 'content' && route.params.idea && (
            // Match the tabs' 1.2× mobile scale: the composer is an App-root
            // full-screen surface, so without this wrapper it renders at native
            // size — noticeably smaller than every tab. Same zoom+--z contract as
            // mobile-zoom-root; the composer's fixed containers size off --z.
            <div style={narrow ? ({ zoom: 1.2, ['--z']: '1.2' } as React.CSSProperties) : undefined}>
              <ErrorBoundary label="Composer">
                <Suspense fallback={null}>
                  <ContentComposer
                    ideaId={route.params.idea}
                    narrow={narrow}
                    onClose={() => navigate('content')}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
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
          {/* Evening shutdown: the small header button plus the after-5pm prompt.
              Tomorrow's ONE is chosen here, which is what red mode reads. */}
          {/* Pilot dock: shutdown + worry compiler, one piece of chrome above
              the bottom nav. Green mode only, because red mode returns before
              these children ever render. */}
          <EveningShutdown />
        </div>
        </PilotGate>
      </AgentsProvider>
    </ToastProvider>
  )
}
