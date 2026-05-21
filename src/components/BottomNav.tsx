import React from 'react'
import { Home, GitBranch, Clock, ListChecks, Activity, Server, Zap, UserPlus, DollarSign, Target } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  active: string
  onChange: (tab: string) => void
}

const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'today',     label: 'Today',     icon: Clock },
  { id: 'leads',     label: 'Leads',     icon: UserPlus },
  { id: 'customers', label: 'Customers', icon: DollarSign },
  { id: 'bets',      label: 'Bets',      icon: Target },
  { id: 'plans',     label: 'Plans',     icon: ListChecks },
  { id: 'org',       label: 'Org',       icon: GitBranch },
  { id: 'execution', label: 'Intel',     icon: Activity },
  { id: 'workflows', label: 'Flows',     icon: Zap },
  { id: 'systems',   label: 'Systems',   icon: Server },
]

export function BottomNav({ active, onChange }: Props) {
  const h = useHaptics()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-[#0a0a0f]/85 backdrop-blur-2xl border-t border-white/[0.06]" />
      <div className="relative flex items-stretch pb-safe px-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => { h.select(); onChange(id) }}
              aria-label={label}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 transition-all duration-200 active:scale-95 min-h-[56px] sm:min-h-[64px] ${
                isActive ? 'text-white' : 'text-white/45'
              }`}
            >
              <div className={`relative transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                {isActive && (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-violet-500/30 blur-md scale-[1.7]" />
                )}
                <Icon
                  className={`relative w-[22px] h-[22px] sm:w-6 sm:h-6 transition-colors ${isActive ? 'text-violet-200' : ''}`}
                  strokeWidth={isActive ? 2.3 : 1.8}
                />
              </div>
              <span
                className={`w-full text-center text-[10px] sm:text-[11px] font-medium leading-none tracking-tight truncate transition-colors ${
                  isActive ? 'text-violet-200' : ''
                }`}
              >
                {label}
              </span>
              {isActive && (
                <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-gradient-to-r from-transparent via-violet-400 to-transparent rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
