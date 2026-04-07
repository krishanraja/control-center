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
import { ApprovalPanel } from './components/ApprovalPanel'
import { DesktopHome } from './components/DesktopHome'
import { MobileHome } from './components/MobileHome'
import { useHaptics } from './hooks/useHaptics'
import { Cpu } from 'lucide-react'

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
          <DesktopHome currentTime={currentTime} />
          {/* Full detail below the fold */}
          <div className="max-w-[1400px] mx-auto mt-10 space-y-8">
            <OrgChart agents={AGENTS} currentTime={currentTime} />
            <AgentGrid agents={AGENTS} currentTime={currentTime} />
            <AutomationsPanel />
            <AllHandsPanel />
          </div>
        </main>
      </div>

      {/* ── Mobile layout ── */}
      <div className="md:hidden min-h-screen pb-24">
        <MobileHeader currentTime={currentTime} />

        <div className="px-4 space-y-4 pt-2">
          {activeTab === 'home'  && <HomeTab />}
          {activeTab === 'today' && <TodayTab />}
          {activeTab === 'team'  && <TeamTab currentTime={currentTime} />}
          {activeTab === 'org'   && <OrgTab  currentTime={currentTime} />}
          {activeTab === 'ops'   && <OpsTab />}
          {activeTab === 'plans' && <PlansTab />}
          {activeTab === 'comms' && <CommsTab />}
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
function HomeTab() {
  return <MobileHome />
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
   Mobile Tab: Plans (Agent Briefs)
───────────────────────────────────────── */
function PlansTab() {
  const pods = [
    { label: 'Revenue Pod', color: 'text-emerald-400', border: 'border-emerald-500/20', agents: AGENTS.filter(a => a.pod === 'revenue') },
    { label: 'Growth Pod',  color: 'text-violet-400',  border: 'border-violet-500/20',  agents: AGENTS.filter(a => a.pod === 'growth') },
    { label: 'Ops Pod',     color: 'text-slate-400',   border: 'border-slate-500/20',   agents: AGENTS.filter(a => a.pod === 'ops') },
  ]
  return (
    <div className="space-y-4">
      <SectionHeader icon="📋" title="Agent Briefs" subtitle="KPIs · Mission · Your feedback" />
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          Click any agent to open their Google Doc brief. Write your feedback in the top section — agents read it every session.
        </p>
      </div>
      {pods.map(pod => (
        <div key={pod.label} className={`bg-white/[0.02] border ${pod.border} rounded-2xl overflow-hidden`}>
          <div className="px-4 py-3 border-b border-white/[0.05]">
            <p className={`text-[11px] font-bold uppercase tracking-widest ${pod.color}`}>{pod.label}</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {pod.agents.map(agent => (
              <div key={agent.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white">{agent.humanName}</p>
                  <p className="text-[11px] text-white/40 truncate">{agent.role}</p>
                  {agent.kpi && (
                    <p className="text-[10px] text-white/25 truncate mt-0.5">Target: {agent.kpi.target}</p>
                  )}
                </div>
                {agent.planDocUrl ? (
                  <a
                    href={agent.planDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-400 text-[11px] font-medium hover:bg-violet-500/20 transition-colors flex-shrink-0"
                  >
                    Brief ↗
                  </a>
                ) : (
                  <span className="text-[11px] text-white/20 flex-shrink-0">No doc</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
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



export default App
