import React, { useState, useEffect } from 'react'
import { AGENTS, COMPANY_VALUES } from './services/agentData'
import { DesktopNav } from './components/DesktopNav'
import { BottomNav } from './components/BottomNav'
import { NorthStar } from './components/NorthStar'
import { AgentReportCards } from './components/AgentReportCards'
import { TodayTabContent } from './components/TodayTabContent'
import { AgentGrid } from './components/AgentGrid'
import { ExecutionTabContent } from './components/ExecutionTabContent'
import { OrgChart } from './components/OrgChart'
import { MobileOrgChart } from './components/MobileOrgChart'
import { AutomationsPanel } from './components/AutomationsPanel'
import { AllHandsPanel } from './components/AllHandsPanel'
import { SystemsPanel } from './components/SystemsPanel'
import { WeeklyGoals } from './components/WeeklyGoals'
import { useHaptics } from './hooks/useHaptics'

// ─── Tab IDs shared across desktop + mobile ───────────────────────────────────
type TabId = 'home' | 'today' | 'plans' | 'org' | 'execution' | 'systems'

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [currentTime, setCurrentTime] = useState(new Date())
  const h = useHaptics()

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleTab = (id: string) => {
    h.select()
    setTab(id as TabId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col">

      {/* Desktop nav — hidden on mobile */}
      <DesktopNav active={tab} onChange={handleTab} currentTime={currentTime} />

      {/* Content area */}
      <main className="flex-1 overflow-y-auto">

        {/* ── DESKTOP (md+) ─────────────────────────────────── */}
        <div className="hidden md:block">
          <div className="max-w-[1600px] mx-auto px-6 py-6">
            {tab === 'home'  && <DesktopHome currentTime={currentTime} />}
            {tab === 'today' && <DesktopToday />}
            
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
            {tab === 'home'  && <MobileHome currentTime={currentTime} />}
            {tab === 'today' && <MobileToday />}
            
            {tab === 'plans' && <MobilePlans />}
            {tab === 'org'   && <MobileOrg currentTime={currentTime} />}
            {tab === 'execution' && <ExecutionTabContent />}
            {tab === 'systems'   && <MobileSystems />}
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
    <div className="space-y-8">
      <NorthStar />
      <AgentReportCards />
    </div>
  )
}

function DesktopToday() {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-bold text-white">Today</h1>
        <p className="text-[13px] text-white/30">Everything that needs you</p>
      </div>
      <TodayTabContent />
    </div>
  )
}

function DesktopTeam({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-white">Team</h1>
      <AgentGrid agents={AGENTS} currentTime={currentTime} />
    </div>
  )
}

function DesktopPlans() {
  const pods = [
    { label: 'Revenue Pod', color: 'text-emerald-400', border: 'border-emerald-500/20', agents: AGENTS.filter(a => a.pod === 'revenue') },
    { label: 'Growth Pod',  color: 'text-violet-400',  border: 'border-violet-500/20',  agents: AGENTS.filter(a => a.pod === 'growth') },
    { label: 'Ops Pod',     color: 'text-slate-400',   border: 'border-slate-500/20',   agents: AGENTS.filter(a => a.pod === 'ops') },
  ]
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-bold text-white">Agent Briefs</h1>
        <p className="text-[13px] text-white/30">KPIs · Mission · Feedback from Krish · Run Log</p>
      </div>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
        <p className="text-[12px] text-amber-300/70 leading-relaxed">
          Write your feedback in the <strong className="text-amber-300">📋 FEEDBACK FROM KRISH</strong> section at the top of each doc — agents read it first every session.
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {pods.map(pod => (
          <div key={pod.label} className={`bg-white/[0.02] border ${pod.border} rounded-2xl overflow-hidden`}>
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${pod.color}`}>{pod.label}</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {pod.agents.map(agent => (
                <div key={agent.id} className="px-4 py-3 flex items-center gap-3 group hover:bg-white/[0.02] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white">{agent.humanName}</p>
                    <p className="text-[11px] text-white/35 truncate">{agent.role}</p>
                    {agent.kpi && (
                      <p className="text-[10px] text-white/20 truncate mt-0.5">Target: {agent.kpi.target}</p>
                    )}
                  </div>
                  {agent.planDocUrl ? (
                    <a
                      href={agent.planDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[11px] font-medium hover:bg-violet-500/20 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      Open Brief ↗
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DesktopOrg({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-white">Organisation</h1>
      <OrgChart agents={AGENTS} currentTime={currentTime} />
    </div>
  )
}

function DesktopOps() {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-white">Automations</h1>
      <AutomationsPanel />
    </div>
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

function MobileHome({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-5">
      <MobileHeader title="Mission Control" subtitle="April 2026" />
      <NorthStar />
      <AgentReportCards />
    </div>
  )
}

function MobileToday() {
  return (
    <div className="space-y-4">
      <MobileHeader title="Today" subtitle="Everything that needs you" />
      <TodayTabContent />
    </div>
  )
}

function MobileTeam({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <MobileHeader title="Team" subtitle="Your AI agents" />
      <AgentGrid agents={AGENTS} currentTime={currentTime} />
    </div>
  )
}

function MobilePlans() {
  const pods = [
    { label: 'Revenue Pod', color: 'text-emerald-400', border: 'border-emerald-500/20', agents: AGENTS.filter(a => a.pod === 'revenue') },
    { label: 'Growth Pod',  color: 'text-violet-400',  border: 'border-violet-500/20',  agents: AGENTS.filter(a => a.pod === 'growth') },
    { label: 'Ops Pod',     color: 'text-slate-400',   border: 'border-slate-500/20',   agents: AGENTS.filter(a => a.pod === 'ops') },
  ]
  return (
    <div className="space-y-4">
      <MobileHeader title="Agent Briefs" subtitle="KPIs · Mission · Your feedback" />
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <p className="text-[11px] text-amber-300/70 leading-relaxed">
          Write your feedback in the 📋 FEEDBACK FROM KRISH section at the top of each doc.
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
                  <p className="text-[11px] text-white/35 truncate">{agent.role}</p>
                </div>
                {agent.planDocUrl && (
                  <a
                    href={agent.planDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[11px] font-medium flex-shrink-0"
                  >Brief ↗</a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MobileOrg({ currentTime }: { currentTime: Date }) {
  return (
    <div className="space-y-4">
      <MobileHeader title="Org Chart" subtitle="Reporting chain & pods" />
      <MobileOrgChart agents={AGENTS} />
    </div>
  )
}

function MobileOps() {
  return (
    <div className="space-y-4">
      <MobileHeader title="Automations" subtitle="N8N workflows" />
      <AutomationsPanel />
    </div>
  )
}

function DesktopSystems() {
  return (
    <div className="space-y-4">
      <SystemsPanel />
    </div>
  )
}

function MobileSystems() {
  return (
    <div className="space-y-4">
      <MobileHeader title="Systems" subtitle="Connected services · Monitored by Arlo" />
      <SystemsPanel />
    </div>
  )
}


