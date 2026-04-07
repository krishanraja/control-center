import React, { useState, useEffect } from 'react'
import { AGENTS, SYSTEM_HEALTH, COMPANY_VALUES } from './services/agentData'
import { SystemHealth } from './components/SystemHealth'
import { AgentGrid } from './components/AgentGrid'
import { Sidebar } from './components/Sidebar'
import { BlockedOnYou } from './components/BlockedOnYou'
import { OrgChart } from './components/OrgChart'
import { AutomationsPanel } from './components/AutomationsPanel'

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-command-bg text-command-text flex">
      <Sidebar agents={AGENTS} currentTime={currentTime} />

      <main className="flex-1 p-6 overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">MindMaker OS</h1>
              <p className="text-command-text/60 text-sm mt-1">Autonomous Organisation Operating System · v2.0</p>
            </div>
            <div className="text-right text-sm text-command-text/60">
              <div className="font-medium text-command-text/80">{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="font-mono text-lg text-white">{currentTime.toLocaleTimeString()}</div>
            </div>
          </header>

          {/* Company Values Banner */}
          <div className="bg-command-card border border-command-border rounded-xl p-5">
            <p className="text-xs font-semibold text-command-text/50 uppercase tracking-widest mb-4">MindMaker OS Company Values</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {COMPANY_VALUES.map((v, i) => (
                <div key={i} className="p-3 bg-command-bg/40 border border-command-border/50 rounded-lg">
                  <p className="text-xs font-bold text-command-accent mb-1">{i + 1}. {v.title}</p>
                  <p className="text-xs text-command-text/60 leading-relaxed">{v.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* System Health */}
          <SystemHealth health={SYSTEM_HEALTH} />

          {/* Blocked on You — hero */}
          <div className="rounded-xl border border-command-border bg-command-card p-6">
            <BlockedOnYou />
          </div>

          {/* Org Chart */}
          <OrgChart agents={AGENTS} currentTime={currentTime} />

          {/* Agent Grid */}
          <AgentGrid agents={AGENTS} currentTime={currentTime} />

          {/* Automations */}
          <AutomationsPanel />

        </div>
      </main>
    </div>
  )
}

export default App