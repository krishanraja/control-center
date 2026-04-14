import React, { useState, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DesktopSidebar } from './components/DesktopSidebar'
import { BottomNav } from './components/BottomNav'
import { SystemsPanel } from './components/SystemsPanel'
import { CommandPalette } from './components/CommandPalette'
import { DesktopHome } from './components/desktop/DesktopHome'
import { DesktopToday } from './components/desktop/DesktopToday'
import { DesktopPlans } from './components/desktop/DesktopPlans'
import { DesktopOrg } from './components/desktop/DesktopOrg'
import { DesktopExec } from './components/desktop/DesktopExec'
import { DesktopFlows } from './components/desktop/DesktopFlows'

type TabId = 'home' | 'today' | 'plans' | 'org' | 'exec' | 'workflows' | 'systems'

function detectIsNarrow() {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 900
}

export default function App() {
  const [tab, setTab] = useState<TabId>('home')
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
    setTab(normalised as TabId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-row">
      {!narrow && <DesktopSidebar active={tab} onChange={handleTab} />}
      <main className={`flex-1 overflow-y-auto min-w-0 ${narrow ? 'pb-20' : ''}`}>
        <div className={narrow ? 'px-3 py-4' : 'px-6 py-6'}>
          {tab === 'home'      && <ErrorBoundary label="Home"><DesktopHome /></ErrorBoundary>}
          {tab === 'today'     && <ErrorBoundary label="Today"><DesktopToday /></ErrorBoundary>}
          {tab === 'plans'     && <ErrorBoundary label="Plans"><DesktopPlans /></ErrorBoundary>}
          {tab === 'org'       && <ErrorBoundary label="Org"><DesktopOrg /></ErrorBoundary>}
          {tab === 'exec'      && <ErrorBoundary label="Intel"><DesktopExec /></ErrorBoundary>}
          {tab === 'workflows' && <ErrorBoundary label="Flows"><DesktopFlows /></ErrorBoundary>}
          {tab === 'systems'   && <ErrorBoundary label="Systems"><SystemsPanel /></ErrorBoundary>}
        </div>
      </main>
      {narrow && <BottomNav active={tab === 'exec' ? 'execution' : tab} onChange={handleTab} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onTab={handleTab} />
    </div>
  )
}
