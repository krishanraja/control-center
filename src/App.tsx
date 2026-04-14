import React, { useState, useEffect } from 'react'
import { AGENTS, COMPANY_VALUES } from './services/agentData'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DesktopNav } from './components/DesktopNav'
import { BottomNav } from './components/BottomNav'
import { HomeIntelligence } from './components/HomeIntelligence'
import { TodayTabContent } from './components/TodayTabContent'
import { AgentGrid } from './components/AgentGrid'
import { ExecutionTabContent } from './components/ExecutionTabContent'
import { OrgChart } from './components/OrgChart'
import { MobileOrgChart } from './components/MobileOrgChart'
import { AutomationsPanel } from './components/AutomationsPanel'
import { AllHandsPanel } from './components/AllHandsPanel'
import { SystemsPanel } from './components/SystemsPanel'
import { WeeklyGoals } from './components/WeeklyGoals'
import { PlaybooksPanel } from './components/PlaybooksPanel'
import { PlanExecutionDashboard } from './components/PlanExecutionDashboard'
import { WorkstreamBoard } from './components/WorkstreamBoard'
// ─── Mobile-native components ─────────────────────────────────────────────────
import { MobileHome } from './components/MobileHome'
import { MobileToday } from './components/MobileToday'
import { MobilePlans } from './components/MobilePlans'
import { MobileExecution } from './components/MobileExecution'
import { MobileSystems } from './components/MobileSystems'

// ─── Tab IDs shared across desktop + mobile ───────────────────────────────────
type TabId = 'home' | 'today' | 'playbooks' | 'plans' | 'org' | 'execution' | 'systems'

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleTab = (id: string) => {
    setTab(id as TabId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col">

      {/* Desktop nav - hidden on mobile */}
      <DesktopNav active={tab} onChange={handleTab} currentTime={currentTime} />

      {/* Content area */}
      <main className="flex-1 overflow-y-auto">

        {/* ── DESKTOP (md+) ─────────────────────────────────── */}
        <div className="hidden md:block">
          <div className="max-w-[1600px] mx-auto px-6 py-6">
            {tab === 'home'  && <DesktopHome currentTime={currentTime} />}
            {tab === 'today' && <DesktopToday />}
            
            {tab === 'playbooks' && <PlaybooksPanel />}
            {tab === 'plans' && <DesktopPlans />}
            {tab === 'org'   && <DesktopOrg currentTime={currentTime} />}
            {tab === 'execution' && <ExecutionTabContent />}
            {tab === 'systems'   && <DesktopSystems />}
          </div>
        </div>

        {/* ── MOBILE (< md) ─────────────────────────────────── */}
        <div className="md:hidden pb-24">
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
            <img src="/favicon.png" alt="Mindmaker OS" className="w-6 h-6 rounded-md object-cover" />
            <span className="text-[13px] font-semibold text-white/80 tracking-tight">Mindmaker OS</span>
          </div>
          <div className="px-4 pt-2 space-y-4">
            {tab === 'home'      && <ErrorBoundary label="Home"><MobileHome /></ErrorBoundary>}
            {tab === 'today'     && <ErrorBoundary label="Today"><MobileToday /></ErrorBoundary>}
            {tab === 'playbooks' && <ErrorBoundary label="Playbooks"><PlaybooksPanel /></ErrorBoundary>}
            {tab === 'plans'     && <ErrorBoundary label="Plans"><MobilePlans /></ErrorBoundary>}
            {tab === 'org'       && <ErrorBoundary label="Org"><MobileOrgWrapper currentTime={currentTime} /></ErrorBoundary>}
            {tab === 'execution' && <ErrorBoundary label="Execution"><MobileExecution /></ErrorBoundary>}
            {tab === 'systems'   && <ErrorBoundary label="Systems"><MobileSystems /></ErrorBoundary>}
          </div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav active={tab} onChange={handleTab} />
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {title && (
        <h1 className="text-[11px] font-bold uppercase tracking-widest text-white/30">{title}</h1>
      )}
      {children}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DESKTOP TABS
// ══════════════════════════════════════════════════════════════════════════════

function DesktopHome({ currentTime }: { currentTime: Date }) {
  return (
    <ErrorBoundary label="Home">
      <div className="space-y-8">
        <HomeIntelligence />
      </div>
    </ErrorBoundary>
  )
}

function DesktopToday() {
  return (
    <ErrorBoundary label="Today">
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-bold text-white">Today</h1>
          <p className="text-[13px] text-white/30">Everything that needs you</p>
        </div>
        <TodayTabContent />
      </div>
    </ErrorBoundary>
  )
}

function DesktopTeam({ currentTime }: { currentTime: Date }) {
  return (
    <ErrorBoundary label="Team">
      <div className="space-y-4">
        <h1 className="text-[22px] font-bold text-white">Team</h1>
        <AgentGrid agents={AGENTS} currentTime={currentTime} />
      </div>
    </ErrorBoundary>
  )
}

function DesktopPlans() {
  return (
    <ErrorBoundary label="Plans">
      <WorkstreamBoard />
    </ErrorBoundary>
  )
}

function DesktopOrg({ currentTime }: { currentTime: Date }) {
  return (
    <ErrorBoundary label="Org">
      <div className="space-y-4">
        <h1 className="text-[22px] font-bold text-white">Organisation</h1>
        <OrgChart agents={AGENTS} currentTime={currentTime} />
      </div>
    </ErrorBoundary>
  )
}

function DesktopOps() {
  return (
    <ErrorBoundary label="Automations">
      <div className="space-y-4">
        <h1 className="text-[22px] font-bold text-white">Automations</h1>
        <AutomationsPanel />
      </div>
    </ErrorBoundary>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MOBILE TABS
// ══════════════════════════════════════════════════════════════════════════════

function MobileHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pb-1">
      <h1 className="text-[20px] font-bold text-white leading-tight">{title}</h1>
      {subtitle && <p className="text-[12px] text-white/35 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ── Org wrapper (keeps MobileOrgChart + header pattern) ──────────────────────
function MobileOrgWrapper({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <MobileHeader title="Org Chart" subtitle="Reporting chain & pods" />
      <MobileOrgChart agents={AGENTS} />
    </div>
  )
}

function DesktopSystems() {
  return (
    <ErrorBoundary label="Systems">
      <div className="space-y-4">
        <SystemsPanel />
      </div>
    </ErrorBoundary>
  )
}



