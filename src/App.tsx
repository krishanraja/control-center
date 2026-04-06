import React, { useState, useEffect } from 'react'
import { AGENTS, SYSTEM_HEALTH } from './services/agentData'
import { SystemHealth } from './components/SystemHealth'
import { AgentGrid } from './components/AgentGrid'
import { Sidebar } from './components/Sidebar'
import { BlockedOnYou } from './components/BlockedOnYou'

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update time every second for live feel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-command-bg text-command-text flex">
      <Sidebar agents={AGENTS} currentTime={currentTime} />
      
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Mission Control</h1>
              <p className="text-command-text/70 text-sm">Autonomous Organisation OS</p>
            </div>
            <div className="text-right text-sm text-command-text/70">
              <div>{currentTime.toLocaleDateString()}</div>
              <div className="font-mono">{currentTime.toLocaleTimeString()}</div>
            </div>
          </header>

          <SystemHealth health={SYSTEM_HEALTH} />

          {/* Hero section — blocked items front and center */}
          <div className="rounded-xl border border-[#3a3a3d] bg-[#111113] p-6">
            <BlockedOnYou />
          </div>

          <AgentGrid agents={AGENTS} currentTime={currentTime} />
        </div>
      </main>
    </div>
  )
}

export default App
