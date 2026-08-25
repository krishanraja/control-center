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
import { CreateSheet } from './components/CreateSheet'
import { FocusRitual } from './components/home/FocusRitual'
import { PilotGate } from './components/pilot/PilotGate'
import { EveningShutdown } from './components/pilot/EveningShutdown'
import { isSimplifiedIA } from './lib/iaV3'
import { VALID_TAB_IDS } from './lib/tabs'
import { useHashRoute } from './hooks/useHashRoute'
import { contentV2Enabled } from './lib/contentV2'
import { isTypingTarget } from './lib/hotkeys'
import { BOTTOM_NAV_PAD } from './components/mobile/primitives'
import { MobileTabSkeleton, BoardSkeleton, SkeletonDetail, DeferredFallback } from './components/shared/Skeleton'
import { isUiV2 } from './lib/uiV2'

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
const NetworkTabV2 = lazy(() => import('./components/network/NetworkTab').then(m => ({ default: m.NetworkTab })))
const DesktopLeadsRE = lazy(() => import('./components/desktop/DesktopLeadsRE').then(m => ({ default: m.DesktopLeadsRE })))
const DesktopOrg = lazy(() => import('./components/desktop/DesktopOrg').then(m => ({ default: m.DesktopOrg })))
const DesktopFlows = lazy(() => import('./components/desktop/DesktopFlows').then(m => ({ default: m.DesktopFlows })))
const DesktopCustomers = lazy(() => import('./components/desktop/DesktopCustomers').then(m => ({ default: m.DesktopCustomers })))
const DesktopGuests = lazy(() => import('./components/desktop/DesktopGuests').then(m => ({ default: m.DesktopGuests })))
const DesktopContent = lazy(() => import('./components/desktop/DesktopContent').then(m => ({ default: m.DesktopContent })))
const SystemsPanel = lazy(() => import('./components/SystemsPanel').then(m => ({ default: m.SystemsPanel })))
const MobileHome = lazy(() => import('./components/mobile/MobileHome').then(m => ({ default: m.MobileHome })))
const MobileToday = lazy(() => import('./components/mobile/MobileToday').then(m => ({ default: m.MobileToday })))
const MobileLeads = lazy(() => import('./components/mobile/MobileLeads').then(m => ({ default: m.MobileLeads })))
const MobileLeadsRE = lazy(() => import('./components/mobile/MobileLeadsRE').then(m => ({ default: m.MobileLeadsRE })))
const MobileOrg = lazy(() => import('./components/mobile/MobileOrg').then(m => ({ default: m.MobileOrg })))
const MobileFlows = lazy(() => import('./components/mobile/MobileFlows').then(m => ({ default: m.MobileFlows })))
const MobileSystems = lazy(() => import('./components/mobile/MobileSystems').then(m => ({ default: m.MobileSystems })))
const MobileCustomers = lazy(() => import('./components/mobile/MobileCustomers').then(m => ({ default: m.MobileCustomers })))
const MobileGuests = lazy(() => import('./components/mobile/MobileGuests').then(m => ({ default: m.MobileGuests })))
const MobileContent = lazy(() => import('./components/mobile/MobileContent').then(m => ({ default: m.MobileContent })))
const ContentComposer = lazy(() => import('./components/content/ContentComposer').then(m => ({ default: m.ContentComposer })))
// Content Engine v2 (docs/CONTENT-ENGINE-V2-SPEC.md): the four-room Content tab
// + the weekly-brief editor. Both flag-gated; the legacy triage surfaces render
// untouched when VITE_CONTENT_V2_ENABLED is off.
const ContentV2Tab = lazy(() => import('./components/content-v2/ContentV2Tab').then(m => ({ default: m.ContentV2Tab })))
// Growth: ONE tab, five sections in the order of the weekly loop. Map (the ICP
// touchpoint map, growth_touchpoints), Work (the Higgsfield creative board,
// growth_creative_queue), Signals (GEO probes over growth_geo_probes plus the
// SEO rank sweep over maya_striking_distance), Council (growth_council_reviews)
// and Governance (the per-lane control plane: profit governor, autonomy ladder,
// direction lock, tool registry). Merged from the old 'acquisition' + 'growth'
// pair on 2026-08-04; the retired cold-email machinery is no longer rendered.
const GrowthTab = lazy(() => import('./components/growth/GrowthTab').then(m => ({ default: m.GrowthTab })))
// Simplified-IA wrapper tabs (VITE_IA_V3_ENABLED): People = Pipeline + Network +
// Visibility lanes; OS = Org + Intel + Flows + Systems subtabs.
const PeopleTab = lazy(() => import('./components/people/PeopleTab').then(m => ({ default: m.PeopleTab })))
const OsTab = lazy(() => import('./components/os/OsTab').then(m => ({ default: m.OsTab })))
// Focus & Purpose: the operator's own hub (docs/FOCUS-PURPOSE.md). Reached
// from the morning check-in, the anxious-day auto-route (?steady=1), the
// Focus doorway row on Home, and the drawer.
const FocusPurposeTab = lazy(() => import('./components/focusPurpose/FocusPurposeTab').then(m => ({ default: m.FocusPurposeTab })))

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
    <DeferredFallback>
      <div className="px-5 pt-7 pb-5 h-[calc(100dvh/var(--z,1))]">
        <MobileTabSkeleton />
      </div>
    </DeferredFallback>
  )
}

/** Calm chunk-load fallback for a desktop route (structural breadth). */
function DesktopRouteFallback() {
  return <DeferredFallback><BoardSkeleton lanes={3} cardsPerLane={3} /></DeferredFallback>
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
  const routeTab = route.tab === 'execution' ? 'exec' : route.tab
  // `#/acquisition` folded into the single Growth tab (2026-08-04). The alias
  // runs in BOTH IA modes, ahead of IA_ALIASES, so every old bookmark and every
  // navigate('acquisition', ...) call site (decisionActions, decisionKinds,
  // routeDecision, pilotIntent) still lands on a real surface with its params
  // intact. Arriving that way, or with ?lane=, opens the Governance section,
  // because that is where the per-lane controls those links pointed at now live.
  const cameFromAcquisition = routeTab === 'acquisition'
  const rawTab = cameFromAcquisition ? 'growth' : routeTab
  // A legacy #/today RULING deep link (?task= / ?decision=) lands on the queue,
  // which now lives at OS → Queue; a bare #/today is still Home. Params merge
  // below, so the task/decision ref reaches the deck intact.
  const todayRuling = rawTab === 'today' && Boolean(route.params.task || route.params.decision)
  const alias = isSimplifiedIA()
    ? (todayRuling ? { tab: 'os', params: { sub: 'queue' } } : IA_ALIASES[rawTab])
    : undefined
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
      // ⌘K and ⌘J are editor bindings too (link, and whatever the surface binds).
      // Without this the brief canvas lost both to the palette and the inbox.
      const typing = isTypingTarget(e)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (typing) return
        e.preventDefault()
        setPaletteOpen(o => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && isInboxEnabled()) {
        if (typing) return
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

  // Which Growth section a deep link opens on. Undefined means "leave it where
  // the user left it", so clicking a lane chip (which writes ?lane=) never
  // yanks the section out from under them.
  const growthEntrySection = cameFromAcquisition || route.params.lane ? 'governance' : undefined

  return (
    <ToastProvider>
      <AgentsProvider>
        {/* PILOT LAYER: today's check-in gates the whole shell. On a red day the
            gate renders one action instead of this tree until something ships.
            It fails open, so an unreachable pilot route never locks the app.
            An anxious reading (anxiety >= 4, the low-focus state) opens the day
            on Focus & Purpose with the steadying moves already unfolded. */}
        <PilotGate
          onIntent={(intent) => navigate(intent.tab)}
          onAnxious={() => navigate('focus', { steady: '1' })}
        >
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
                  {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                  {tab === 'leads'     && <ErrorBoundary label="Leads"><MobileLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'relationships' && <ErrorBoundary label="Network">{isUiV2() ? <NetworkTabV2 narrow /> : <MobileLeadsRE onNavigate={navigate} />}</ErrorBoundary>}
                  {tab === 'customers' && <ErrorBoundary label="Customers"><MobileCustomers /></ErrorBoundary>}
                  {tab === 'growth'    && <ErrorBoundary label="Growth"><div className={`px-5 pt-7 h-full flex flex-col overflow-hidden ${BOTTOM_NAV_PAD}`}><GrowthTab variant="mobile" initialSection={growthEntrySection} lane={route.params.lane || null} onNavigate={navigate} /></div></ErrorBoundary>}
                  {tab === 'guests'    && <ErrorBoundary label="Visibility"><MobileGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'content'   && (contentV2Enabled()
                    // Reserve BottomNav clearance (like every MobileShell tab) so
                    // the deck's thumb-zone actions and the room scroll tails are
                    // never hidden behind the fixed nav bar.
                    ? <ErrorBoundary label="Content"><div className={`px-5 pt-7 h-full flex flex-col overflow-hidden ${BOTTOM_NAV_PAD}`}><ContentV2Tab variant="mobile" /></div></ErrorBoundary>
                    : <ErrorBoundary label="Content"><MobileContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>)}
                  {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrg /></ErrorBoundary>}
                  {tab === 'workflows' && <ErrorBoundary label="Flows"><MobileFlows /></ErrorBoundary>}
                  {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
                  {tab === 'people'    && <PeopleTab narrow params={params} onNavigate={navigate} />}
                  {tab === 'os'        && <OsTab narrow params={params} onNavigate={navigate} />}
                  {/* Focus is designed to fit one screen with the tools collapsed;
                      the scroll container is graceful degradation for very short
                      viewports, not the layout. The tab runs short of a screen on
                      most phones, so the top keeps normal breathing room and the
                      purpose line is never clamped. */}
                  {tab === 'focus'     && <ErrorBoundary label="Focus"><div className="px-5 pt-6 [@media(max-height:860px)]:pt-4 h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+120px)]"><FocusPurposeTab variant="mobile" steadyEntry={params.steady === '1'} /></div></ErrorBoundary>}
                </Suspense>
              </div>
            ) : tab === 'content' ? (
              <Suspense fallback={<DeferredFallback><div className="p-6"><BoardSkeleton lanes={3} cardsPerLane={3} /></div></DeferredFallback>}>
                {contentV2Enabled()
                  ? <ErrorBoundary label="Content"><div className="h-full overflow-hidden px-6 pt-6 pb-[calc(1.5rem+var(--capture-gutter))] flex flex-col"><ContentV2Tab variant="desktop" /></div></ErrorBoundary>
                  : <ErrorBoundary label="Content"><DesktopContent ideaId={route.params.idea || null} onClearIdea={() => navigate('content')} /></ErrorBoundary>}
              </Suspense>
            ) : tab === 'home' ? (
              // Home owns its own height: the canon must fit the viewport with
              // no page scroll (the product contract this recompose exists to
              // honor), so the shell must not wrap it in a scroll container.
              <Suspense fallback={<DeferredFallback><div className="p-6"><BoardSkeleton lanes={3} cardsPerLane={2} /></div></DeferredFallback>}>
                <ErrorBoundary label="Home">
                  <div className="h-full overflow-hidden px-6 py-6 flex flex-col">
                    <DesktopHome onNavigate={navigate} />
                  </div>
                </ErrorBoundary>
              </Suspense>
            ) : tab === 'growth' ? (
              // Growth owns its own height like Content: the creative board
              // scrolls sideways and each section scrolls inside itself, so the
              // shell must not wrap it in a second scroll container.
              <Suspense fallback={<DeferredFallback><div className="p-6"><BoardSkeleton lanes={4} cardsPerLane={3} /></div></DeferredFallback>}>
                <ErrorBoundary label="Growth">
                  <div className="h-full overflow-hidden px-6 py-6 flex flex-col">
                    <GrowthTab
                      variant="desktop"
                      initialSection={growthEntrySection}
                      lane={route.params.lane || null}
                      onNavigate={navigate}
                    />
                  </div>
                </ErrorBoundary>
              </Suspense>
            ) : (
              <div className="h-full overflow-y-auto px-6 pt-6 pb-[calc(1.5rem+var(--capture-gutter))]">
                <Suspense fallback={<DesktopRouteFallback />}>
                  {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday selectedTaskId={route.params.task || null} onSelectTask={(id) => navigate('today', id ? { task: id } : {})} lane={route.params.lane || null} onClearLane={() => navigate('today')} decision={route.params.decision || null} onNavigate={navigate} onClearDecision={() => navigate('today')} /></ErrorBoundary>}
                  {tab === 'leads'     && <ErrorBoundary label="Leads"><DesktopLeads leadId={route.params.lead || null} onClearDetail={() => navigate('leads')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'relationships' && <ErrorBoundary label="Network">{isUiV2() ? <NetworkTabV2 /> : <DesktopLeadsRE onNavigate={navigate} />}</ErrorBoundary>}
                  {tab === 'customers' && <ErrorBoundary label="Customers"><DesktopCustomers /></ErrorBoundary>}
                  {tab === 'guests'    && <ErrorBoundary label="Visibility"><DesktopGuests guestId={route.params.guest || null} targetId={route.params.target || null} onClearDetail={() => navigate('guests')} onNavigate={navigate} /></ErrorBoundary>}
                  {tab === 'org'       && <ErrorBoundary label="Org"><DesktopOrg /></ErrorBoundary>}
                  {tab === 'workflows' && <ErrorBoundary label="Flows"><DesktopFlows /></ErrorBoundary>}
                  {tab === 'systems'   && <ErrorBoundary label="Systems"><SystemsPanel /></ErrorBoundary>}
                  {tab === 'people'    && <PeopleTab narrow={false} params={params} onNavigate={navigate} />}
                  {tab === 'os'        && <OsTab narrow={false} params={params} onNavigate={navigate} />}
                  {tab === 'focus'     && <ErrorBoundary label="Focus"><FocusPurposeTab variant="desktop" steadyEntry={params.steady === '1'} /></ErrorBoundary>}
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
          {/* The composer. One full-screen surface, opening either a piece
              (?idea=) or a weekly brief (?brief=), which is what
              CONTENT-ENGINE-V2-SPEC.md:75 specified. It used to be two
              separate overlays mounted side by side here, and the brief one
              had four edit chips to the composer's twenty-six.
              Match the tabs' 1.2× mobile scale: this is an App-root
              full-screen surface, so without the wrapper it renders at native
              size, noticeably smaller than every tab. Same zoom+--z contract
              as mobile-zoom-root; the composer's fixed containers size off --z. */}
          {tab === 'content' && (route.params.idea || (contentV2Enabled() && route.params.brief)) && (
            <div style={narrow ? ({ zoom: 1.2, ['--z']: '1.2' } as React.CSSProperties) : undefined}>
              <ErrorBoundary label="Composer">
                {/* A deep-linked full-screen takeover fetching its own chunk
                    used to show nothing at all until it was ready, so
                    following a link looked like the click had failed. */}
                <Suspense fallback={<DeferredFallback><SkeletonDetail full /></DeferredFallback>}>
                  <ContentComposer
                    ideaId={route.params.idea || undefined}
                    week={contentV2Enabled() ? (route.params.brief || undefined) : undefined}
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
          {/* The one mobile create control: tab-aware + button (CreateSheet).
              Keyed on the same `narrow` state as the shell (the old md:hidden
              gate left 768-900px with no capture control at all) and hidden
              while a full-screen overlay owns the screen, where it used to
              paint over the composer's own footer controls. */}
          {narrow && !fullScreenOverlayOpen && <CreateSheet tab={tab} />}
          {/* Focus Ritual (unified): one guided stepper across week / today,
              mounted once so it z-stacks above both shells. */}
          <FocusRitual narrow={narrow} tab={tab} onNavigate={navigate} />
          {/* Evening shutdown: only the once-a-day after-5pm prompt now.
              Tomorrow's ONE is chosen here, which is what red mode reads. The
              floating dock it used to render is gone; shutdown and the worry
              compiler live on the Focus & Purpose tab. */}
          <EveningShutdown />
        </div>
        </PilotGate>
      </AgentsProvider>
    </ToastProvider>
  )
}
