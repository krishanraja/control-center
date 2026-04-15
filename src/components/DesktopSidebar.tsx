import React, { useEffect, useState } from 'react'
import { LayoutDashboard, Calendar, CheckSquare, Users, Brain, Workflow, Activity } from 'lucide-react'
import { supabase } from '../lib/supabase'

const NAV = [
  { id: 'home',      label: 'Home',    icon: LayoutDashboard },
  { id: 'today',     label: 'Today',   icon: Calendar },
  { id: 'plans',     label: 'Plans',   icon: CheckSquare },
  { id: 'org',       label: 'Org',     icon: Users },
  { id: 'exec',      label: 'Intel',   icon: Brain },
  { id: 'workflows', label: 'Flows',   icon: Workflow },
  { id: 'systems',   label: 'Systems', icon: Activity },
]

interface Props {
  active: string
  onChange: (tab: string) => void
}

export function DesktopSidebar({ active, onChange }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'warning' | 'critical' | 'unknown'>('unknown')
  const [mrr, setMrr] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('system_health').select('metric,value,status')
      if (!data) return
      const mrrRow = data.find((r: any) => r.metric === 'mrr')
      if (mrrRow) setMrr(mrrRow.value)
      const worst = data.reduce((acc: string, r: any) => {
        if (r.status === 'critical') return 'critical'
        if (r.status === 'warning' && acc !== 'critical') return 'warning'
        return acc
      }, 'healthy')
      setHealthStatus(worst as any)
    }
    load()
    const ch = supabase
      .channel('sidebar-health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_health' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const dotColor =
    healthStatus === 'healthy'  ? 'bg-emerald-400' :
    healthStatus === 'warning'  ? 'bg-amber-400'   :
    healthStatus === 'critical' ? 'bg-rose-500'    :
                                  'bg-white/20'

  const w = expanded ? 'w-60' : 'w-16'

  return (
    <aside
      className={`${w} flex-shrink-0 border-r border-white/[0.07] bg-[#0a0a0b] flex flex-col sticky top-0 h-screen transition-[width] duration-150`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="h-14 flex items-center gap-3 px-4 border-b border-white/[0.07]">
        <img src="/favicon.png" alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
        {expanded && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-white/85 truncate">Mindmaker OS</span>
            <span className={`w-2 h-2 rounded-full ${dotColor}`} title={healthStatus} />
          </div>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                ${isActive
                  ? 'bg-violet-500/15 text-white border border-violet-500/25'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04] border border-transparent'}`}
              title={!expanded ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
              {expanded && <span className="truncate">{label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.07] p-3 space-y-2">
        {expanded ? (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">MRR</p>
              {mrr ? (
                <p className="text-[15px] font-mono font-semibold text-emerald-400 tabular-nums mt-0.5">{mrr}</p>
              ) : (
                <p className="text-[12px] text-white/30 mt-1 leading-snug">Not reported yet</p>
              )}
            </div>
            <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-medium">Command</span>
              <kbd className="text-[10px] font-mono text-white/45 border border-white/10 rounded px-1.5 py-0.5 bg-white/[0.03]">⌘K</kbd>
            </div>
          </>
        ) : (
          <div className={`w-2 h-2 mx-auto rounded-full ${dotColor}`} title={healthStatus} />
        )}
      </div>
    </aside>
  )
}
