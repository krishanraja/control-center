import React, { useState, useEffect } from 'react'
import { AGENTS } from './services/agentData'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DesktopSidebar } from './components/DesktopSidebar'
import { BottomNav } from './components/BottomNav'
import { MobileOrgChart } from './components/MobileOrgChart'
import { SystemsPanel } from './components/SystemsPanel'
import { WorkflowImprovements } from './components/WorkflowImprovements'
import { CommandPalette } from './components/CommandPalette'
import { DesktopHome } from './components/desktop/DesktopHome'
import { DesktopToday } from './components/desktop/DesktopToday'
import { DesktopPlans } from './components/desktop/DesktopPlans'
import { DesktopOrg } from './components/desktop/DesktopOrg'
import { DesktopExec } from './components/desktop/DesktopExec'
import { DesktopFlows } from './components/desktop/DesktopFlows'
import { MobileHome } from './components/MobileHome'
import { MobileToday } from './components/MobileToday'
import { MobilePlans } from './components/MobilePlans'
import { MobileExecution } from './components/MobileExecution'
import { MobileSystems } from './components/MobileSystems'
import { MobileShell, TabHeader as MobileTabHeader } from './components/mobile/primitives'

type TabId = 'home' | 'today' | 'plans' | 'org' | 'exec' | 'workflows' | 'systems'

function detectIsMobile() {
  if (typeof window === 'undefined') return false
  const narrow = window.innerWidth < 900
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  const touchPoints =
    typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 1
  const isTouchDevice = coarsePointer || touchPoints
  return narrow || mobileUA || isTouchDevice
}

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [isMobile, setIsMobile] = useState(detectIsMobile)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(detectIsMobile())
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
    setTab(normalised as TabId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (isMobile) {
    return (
      <div className="bg-[#0a0a0b] text-white">
        {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome /></ErrorBoundary>}
        {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday /></ErrorBoundary>}
        {tab === 'plans'     && <ErrorBoundary label="Plans"><MobilePlans /></ErrorBoundary>}
        {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrgWrapper /></ErrorBoundary>}
        {tab === 'exec'      && <ErrorBoundary label="Intel"><MobileExecution /></ErrorBoundary>}
        {tab === 'workflows' && <ErrorBoundary label="Flows"><MobileShell header={<MobileTabHeader title="Flows" subtitle="Pipelines and proposals" />}><WorkflowImprovements /></MobileShell></ErrorBoundary>}
        {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
        <BottomNav active={tab === 'exec' ? 'execution' : tab} onChange={handleTab} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-row">
      <DesktopSidebar active={tab} onChange={handleTab} />
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="px-6 py-6">
          {tab === 'home'      && <ErrorBoundary label="Home"><DesktopHome /></ErrorBoundary>}
          {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday /></ErrorBoundary>}
          {tab === 'plans'     && <ErrorBoundary label="Plans"><DesktopPlans /></ErrorBoundary>}
          {tab === 'org'       && <ErrorBoundary label="Org"><DesktopOrg /></ErrorBoundary>}
          {tab === 'exec'      && <ErrorBoundary label="Intel"><DesktopExec /></ErrorBoundary>}
          {tab === 'workflows' && <ErrorBoundary label="Flows"><DesktopFlows /></ErrorBoundary>}
          {tab === 'systems'   && <ErrorBoundary label="Systems"><SystemsPanel /></ErrorBoundary>}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onTab={handleTab} />
    </div>
  )
}

function MobileOrgWrapper() {
  return (
    <MobileShell header={<MobileTabHeader title="Org" subtitle="Reporting chain & pods" />}>
      <MobileOrgChart agents={AGENTS} />
    </MobileShell>
  )
}
