import React from 'react'
import { Home, GitBranch, Clock, ListChecks, Activity, Server } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  active: string
  onChange: (tab: string) => void
}

const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'today',     label: 'Today',     icon: Clock },
  { id: 'plans',     label: 'Plans',     icon: ListChecks },
  { id: 'org',       label: 'Org',       icon: GitBranch },
  { id: 'execution', label: 'Exec',      icon: Activity },
  { id: 'systems',   label: 'Systems',   icon: Server },
]

export function BottomNav({ active, onChange }: Props) {
  const h = useHaptics()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-[#0a0a0f]/80 backdrop-blur-2xl border-t border-white/[0.06]" />
      <div className="relative flex items-stretch pb-safe">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => { h.select(); onChange(id) }}
              className={`flex-1 flex flex-col items-center justify-center gap-2 py-4 transition-all duration-200 active:scale-95 ${
                isActive ? 'text-white' : 'text-white/40'
              }`}
              style={{ minHeight: 76 }}
            >
              <div className={`relative transition-all duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                {isActive && (
                  <div className="absolute inset-0 rounded-full bg-violet-500/30 blur-md scale-150" />
                )}
                <Icon className={`relative w-[30px] h-[30px] transition-all duration-200 ${isActive ? 'stroke-violet-300' : ''}`} strokeWidth={isActive ? 2.3 : 1.8} />
              </div>
              <span className={`text-[13px] font-semibold tracking-wide transition-all duration-200 ${isActive ? 'text-violet-200' : ''}`}>
                {label}
              </span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2.5px] bg-gradient-to-r from-transparent via-violet-400 to-transparent rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
