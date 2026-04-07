import React, { useState, useEffect } from 'react'
import { AGENTS, COMPANY_VALUES } from './services/agentData'
import { SystemHealth } from './components/SystemHealth'
import { AgentGrid } from './components/AgentGrid'
import { Sidebar } from './components/Sidebar'
import { BlockedOnYou } from './components/BlockedOnYou'
import { TodayPanel } from './components/TodayPanel'
import { OrgChart } from './components/OrgChart'
import { AutomationsPanel } from './components/AutomationsPanel'
import { AllHandsPanel } from './components/AllHandsPanel'
import { BottomNav } from './components/BottomNav'
import { MobileOrgChart } from './components/MobileOrgChart'
import { AgentPlansPanel } from './components/AgentPlansPanel'
import { WeeklyGoals } from './components/WeeklyGoals'
import { useHaptics } from './hooks/useHaptics'
import { Cpu, Sparkles } from 'lucide-react'

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeTab, setActiveTab] = useState('home')
  const h = useHaptics()

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleTabChange = (tab: string) => {
    h.select()
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#08080e] text-white overflow-x-hidden">

      {/* ── Desktop layout ── */}
      <div className="hidden md:flex min-h-screen">
        <Sidebar agents={AGENTS} currentTime={currentTime} />
        <main className="flex-1 p-6 overflow-x-hidden">
          <DesktopContent currentTime={currentTime} />
        </main>
      </div>

      {/* ── Mobile layout ── */}
      <div className="md:hidden min-h-screen pb-24">
        <MobileHeader currentTime={currentTime} />

        <div className="px-4 space-y-4 pt-2">
          {activeTab === 'home' && <HomeTab currentTime={currentTime} />}
          {activeTab === 'today' && <TodayTab />}
          {activeTab === 'team' && <TeamTab currentTime={currentTime} />}
          {activeTab === 'org'  && <OrgTab  currentTime={currentTime} />}
          {activeTab === 'ops'  && <OpsTab />}
          {activeTab === 'comms'&& <CommsTab />}
        </div>
      </div>

      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  )
}

/* ─────────────────────────────────────────
   Mobile Header
───────────────────────────────────────── */
function MobileHeader({ currentTime }: { currentTime: Date }) {
  return (
    <header className="sticky top-0 z-40 px-5 py-4">
      <div className="absolute inset-0 bg-[#08080e]/90 backdrop-blur-2xl border-b border-white/[0.06]" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white leading-none tracking-tight">MindMaker OS</h1>
            <p className="text-[10px] text-white/40 mt-0.5">v2.0 · Autonomous Org</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-semibold text-white/80">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[10px] text-white/40">
            {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>
    </header>
  )
}

/* ─────────────────────────────────────────
   Mobile Tab: Home
───────────────────────────────────────── */
function HomeTab({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      {/* Values pill strip */}
      <div className="overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
        <div className="flex gap-2 w-max">
          {COMPANY_VALUES.map((v, i) => (
            <div key={i} className="flex-shrink-0 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
              <span className="text-[11px] font-semibold text-violet-300">{v.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Goals — anchors everything */}
      <WeeklyGoals />

      {/* System health */}
      <MobileHealthCard />

      {/* Blocked on you */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-sm">
        <BlockedOnYou />
      </div>

      {/* Agent Plans */}
      <AgentPlansPanel />
    </div>
  )
}

function MobileHealthCard() {
  return <SystemHealth />
}

/* ─────────────────────────────────────────
   Mobile Tab: Team
───────────────────────────────────────── */
function TeamTab({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon="👥" title="Agents" subtitle="Your AI team" />
      <AgentGrid agents={AGENTS} currentTime={currentTime} />
    </div>
  )
}

/* ─────────────────────────────────────────
   Mobile Tab: Today
───────────────────────────────────────── */
function TodayTab() {
  return (
    <div className="space-y-4">
      <SectionHeader icon="📅" title="Today" subtitle="Unified queue" />
      <TodayPanel />
    </div>
  )
}

/* ─────────────────────────────────────────
   Mobile Tab: Org
───────────────────────────────────────── */
function OrgTab({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon="🏛️" title="Org Structure" subtitle="Reporting chain & pods" />
      <MobileOrgChart agents={AGENTS} />
    </div>
  )
}

/* ─────────────────────────────────────────
   Mobile Tab: Ops
───────────────────────────────────────── */
function OpsTab() {
  return (
    <div className="space-y-4">
      <SectionHeader icon="⚡" title="Automations" subtitle="N8N workflows & cron jobs" />
      <AutomationsPanel />
    </div>
  )
}

/* ─────────────────────────────────────────
   Mobile Tab: Comms
───────────────────────────────────────── */
function CommsTab() {
  return (
    <div className="space-y-4">
      <SectionHeader icon="📅" title="All Hands" subtitle="Monthly cadence & values" />
      <AllHandsPanel />
      {/* Values (full) */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">Company Values</p>
        <div className="space-y-3">
          {COMPANY_VALUES.map((v, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-violet-400">{i + 1}</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{v.title}</p>
                <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">{v.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────
   Shared: Section Header
───────────────────────────────────────── */
function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-lg">
        {icon}
      </div>
      <div>
        <h2 className="text-[17px] font-bold text-white leading-none">{title}</h2>
        <p className="text-[12px] text-white/40 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────
   Desktop Content (unchanged layout)
───────────────────────────────────────── */
function DesktopContent({ currentTime }: { currentTime: Date }) {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">MindMaker OS</h1>
          <p className="text-white/40 text-sm mt-1">Autonomous Organisation Operating System · v2.0</p>
        </div>
        <div className="text-right text-sm text-white/60">
          <div className="font-medium text-white/80">{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <div className="font-mono text-lg text-white">{currentTime.toLocaleTimeString()}</div>
        </div>
      </header>

      <div className="bg-[#111118] border border-white/[0.07] rounded-xl p-5">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Company Values</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {COMPANY_VALUES.map((v, i) => (
            <div key={i} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg">
              <p className="text-xs font-bold text-violet-400 mb-1">{i + 1}. {v.title}</p>
              <p className="text-xs text-white/50 leading-relaxed">{v.description}</p>
            </div>
          ))}
        </div>
      </div>

      <SystemHealth />
      <div className="rounded-xl border border-white/[0.07] bg-[#111118] p-6"><BlockedOnYou /></div>
      <OrgChart agents={AGENTS} currentTime={currentTime} />
      <AgentGrid agents={AGENTS} currentTime={currentTime} />
      <AllHandsPanel />
      <AutomationsPanel />
    </div>
  )
}

export default App
