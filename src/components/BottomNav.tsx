import React from 'react'
import { Home, GitBranch, Clock, ClipboardList, Activity, Server } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  active: string
  onChange: (tab: string) => void
}

const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'today',     label: 'Today',     icon: Clock },
  { id: 'plans',     label: 'Briefs',    icon: ClipboardList },
  { id: 'org',       label: 'Org',       icon: GitBranch },
  { id: 'execution', label: 'Exec',      icon: Activity },
  { id: 'systems',   label: 'Systems',   icon: Server },
]

export function BottomNav({ active, onChange }: Props) {
  const h = useHaptics()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-[#0a0a0f]/80 backdrop-blur-2xl border-t border-white/[0.06]" />
      <div className="relative flex items-stretch pb-safe">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => { h.select(); onChange(id) }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all duration-200 active:scale-95 ${
                isActive ? 'text-white' : 'text-white/30'
              }`}
            >
              <div className={`relative transition-all duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                {isActive && (
                  <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-sm scale-150" />
                )}
                <Icon className={`relative w-[20px] h-[20px] transition-all duration-200 ${isActive ? 'stroke-violet-400' : ''}`} strokeWidth={isActive ? 2.2 : 1.8} />
              </div>
              <span className={`text-[9px] font-semibold tracking-wide transition-all duration-200 ${isActive ? 'text-violet-300' : ''}`}>
                {label}
              </span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-gradient-to-r from-transparent via-violet-400 to-transparent rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
