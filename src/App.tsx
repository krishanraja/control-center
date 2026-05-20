import React, { useState, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/shared/Toast'
import { DesktopSidebar } from './components/DesktopSidebar'
import { BottomNav } from './components/BottomNav'
import { SystemsPanel } from './components/SystemsPanel'
import { CommandPalette } from './components/CommandPalette'
import { DesktopHome } from './components/desktop/DesktopHome'
import { DesktopToday } from './components/desktop/DesktopToday'
import { DesktopPlans } from './components/desktop/DesktopPlans'
import { DesktopLeads } from './components/desktop/DesktopLeads'
import { DesktopOrg } from './components/desktop/DesktopOrg'
import { DesktopExec } from './components/desktop/DesktopExec'
import { DesktopFlows } from './components/desktop/DesktopFlows'
import { MobileHome } from './components/mobile/MobileHome'
import { MobileToday } from './components/mobile/MobileToday'
import { MobileLeads } from './components/mobile/MobileLeads'
import { MobileIntel } from './components/mobile/MobileIntel'
import { MobilePlans } from './components/mobile/MobilePlans'
import { MobileOrg } from './components/mobile/MobileOrg'
import { MobileFlows } from './components/mobile/MobileFlows'
import { MobileSystems } from './components/mobile/MobileSystems'
import { AgentsProvider } from './contexts/AgentsContext'
import { PendingFlagModal } from './components/PendingFlagModal'
import { QuickCaptureIdea } from './components/QuickCaptureIdea'
import { useHashRoute } from './hooks/useHashRoute'

type TabId = 'home' | 'today' | 'plans' | 'leads' | 'org' | 'exec' | 'workflows' | 'systems'
const VALID_TABS: TabId[] = ['home', 'today', 'plans', 'leads', 'org', 'exec', 'workflows', 'systems']

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
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
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
        <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-row">
          {!narrow && <DesktopSidebar active={tab} onChange={handleTab} />}
          <main className={`flex-1 overflow-y-auto min-w-0 ${narrow ? 'pb-20' : ''}`}>
            {narrow ? (
              <>
                {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday /></ErrorBoundary>}
                {tab === 'leads'     && <ErrorBoundary label="Leads"><MobileLeads /></ErrorBoundary>}
                {tab === 'exec'      && <ErrorBoundary label="Intel"><MobileIntel /></ErrorBoundary>}
                {tab === 'plans'     && <ErrorBoundary label="Plans"><MobilePlans /></ErrorBoundary>}
                {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrg /></ErrorBoundary>}
                {tab === 'workflows' && <ErrorBoundary label="Flows"><MobileFlows /></ErrorBoundary>}
                {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
              </>
            ) : (
              <div className="px-6 py-6">
                {tab === 'home'      && <ErrorBoundary label="Home"><DesktopHome onNavigate={navigate} /></ErrorBoundary>}
                {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday selectedTaskId={route.params.task || null} onSelectTask={(id) => navigate('today', id ? { task: id } : {})} /></ErrorBoundary>}
                {tab === 'plans'     && <ErrorBoundary label="Plans"><DesktopPlans /></ErrorBoundary>}
                {tab === 'leads'     && <ErrorBoundary label="Leads"><DesktopLeads /></ErrorBoundary>}
                {tab === 'org'       && <ErrorBoundary label="Org"><DesktopOrg /></ErrorBoundary>}
                {tab === 'exec'      && <ErrorBoundary label="Intel"><DesktopExec /></ErrorBoundary>}
                {tab === 'workflows' && <ErrorBoundary label="Flows"><DesktopFlows /></ErrorBoundary>}
                {tab === 'systems'   && <ErrorBoundary label="Systems"><SystemsPanel /></ErrorBoundary>}
              </div>
            )}
          </main>
          {narrow && <BottomNav active={tab === 'exec' ? 'execution' : tab} onChange={handleTab} />}
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onTab={handleTab} />
          <PendingFlagModal />
          <QuickCaptureIdea />
        </div>
      </AgentsProvider>
    </ToastProvider>
  )
}
