import React from 'react'
import { Home, Clock, ListChecks, GitBranch, Activity, Server } from 'lucide-react'

const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'today',     label: 'Today',     icon: Clock },
  { id: 'plans',     label: 'Plans',     icon: ListChecks },
  { id: 'org',       label: 'Org',       icon: GitBranch },
  { id: 'execution', label: 'Execution', icon: Activity },
  { id: 'systems',   label: 'Systems',   icon: Server },
]

interface Props {
  active: string
  onChange: (tab: string) => void
  currentTime: Date
}

export function DesktopNav({ active, onChange, currentTime }: Props) {
  const timeStr = currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  const dateStr = currentTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

  return (
    <header className="flex items-center border-b border-white/[0.07] bg-[#0a0a0b]/95 backdrop-blur-xl sticky top-0 z-40 px-6 h-14 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mr-8 flex-shrink-0">
        <img src="/favicon.png" alt="Mindmaker OS" className="w-6 h-6 rounded-md object-cover" />
        <span className="text-[13px] font-semibold text-white/80 tracking-tight">Mindmaker OS</span>
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 flex-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150
                ${isActive
                  ? 'bg-violet-500/15 text-white border border-violet-500/25'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Clock */}
      <div className="flex-shrink-0 text-right">
        <p className="text-[13px] font-mono text-white/70">{timeStr} <span className="text-white/25">UTC</span></p>
        <p className="text-[10px] text-white/30">{dateStr}</p>
      </div>
    </header>
  )
}
