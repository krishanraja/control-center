import React, { useEffect, useState } from 'react'
import { AlertTriangle, Activity as ActivityIcon, TrendingUp, Sparkles, BarChart3, Target } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { AgentAvatar } from '../shared/AgentAvatar'

function humanizeEventType(eventType: string): string {
  if (!eventType) return 'Action'
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

interface HomeIntel {
  summary?: any
  metrics?: any[]
}

interface AuditEvent {
  id: string
  event_type: string
  actor: string
  target?: string
  details?: any
  created_at: string
}

interface Goal {
  id: string
  title: string
  target: string
  current: string
  progress: number
  status: string
}

export function DesktopHome() {
  const [intel, setIntel] = useState<HomeIntel | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const { tasks: waiting } = useRealtimeTasks({ statusIn: ['waiting', 'blocked'] })

  useEffect(() => {
    supabase.from('home_intelligence').select('*').eq('id', 'current').maybeSingle().then(({ data }) => setIntel(data as any))
    supabase.from('goals').select('*').order('updated_at', { ascending: false }).limit(6).then(({ data }) => setGoals((data as any) || []))

    const loadEvents = async () => {
      const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(30)
      setEvents((data as any) || [])
    }
    loadEvents()
    const ch = supabase
      .channel('home-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, (p) => {
        setEvents(prev => [p.new as any, ...prev].slice(0, 30))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const summary = intel?.summary || {}
  const metrics = intel?.metrics || []

  return (
    <div className="grid grid-cols-12 gap-5 min-h-[calc(100vh-4rem)]">

      <section className="col-span-12 xl:col-span-3 space-y-4">
        <SectionHeader icon={<TrendingUp size={13} className="text-emerald-400" />} label="Revenue Pulse" />
        {summary.headline ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-2">
            <p className="text-[13px] text-white/80 leading-relaxed font-medium">{summary.headline}</p>
            {summary.body && <p className="text-[12px] text-white/45 leading-relaxed">{summary.body}</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-8 flex flex-col items-center justify-center text-center">
            <BarChart3 size={20} className="text-white/20 mb-3" />
            <p className="text-[13px] text-white/45">No revenue data yet</p>
            <p className="text-[11px] text-white/25 mt-1">Intelligence brief will appear here</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {metrics.map((m: any) => (
            <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-medium">{m.label}</p>
              <p className="text-[20px] font-semibold text-white mt-1.5 tracking-tight">{m.value}</p>
              {typeof m.progress_pct === 'number' && (
                <div className="mt-2.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400" style={{ width: `${Math.min(100, m.progress_pct)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {goals.length > 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-medium">Weekly Goals</p>
            <div className="space-y-3">
              {goals.slice(0, 4).map(g => {
                const progressPct = typeof g.progress === 'number' ? Math.min(100, Math.max(0, g.progress)) : 0
                const isComplete = g.status === 'complete' || g.status === 'done' || progressPct >= 100
                return (
                  <div key={g.id} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex-1 text-[12px] text-white/80 font-medium leading-snug line-clamp-2">{g.title}</span>
                      <span className={`flex-shrink-0 text-[10px] font-mono tabular-nums ${isComplete ? 'text-emerald-400' : 'text-white/40'}`}>
                        {isComplete ? 'Done' : `${progressPct}%`}
                      </span>
                    </div>
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-400' : 'bg-gradient-to-r from-violet-500 to-violet-400'}`}
                        style={{ width: `${progressPct}%` }} 
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 flex flex-col items-center justify-center text-center">
            <Target size={18} className="text-white/20 mb-2" />
            <p className="text-[12px] text-white/40">No goals set</p>
          </div>
        )}
      </section>

      <section className="col-span-12 xl:col-span-6 space-y-4">
        <SectionHeader icon={<AlertTriangle size={13} className="text-amber-400" />} label="Needs You" trailing={
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 font-mono tabular-nums">{waiting.length}</span>
        } />
        {waiting.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-12 flex flex-col items-center justify-center text-center">
            <Sparkles size={20} className="text-white/25 mb-3" />
            <p className="text-[13px] text-white/50">Inbox zero.</p>
            <p className="text-[12px] text-white/30 mt-1">Nothing is waiting on you.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-amber-500/[0.02] to-transparent p-8">
            <div className="flex items-baseline gap-3">
              <span className="text-[44px] font-semibold text-amber-300 leading-none tracking-tight tabular-nums">{waiting.length}</span>
              <span className="text-[14px] text-white/75 font-medium">{waiting.length === 1 ? 'item needs' : 'items need'} your attention</span>
            </div>
            <p className="text-[12px] text-white/45 leading-relaxed mt-3">
              Open the <span className="text-white/70 font-medium">Today</span> tab to review and act on {waiting.length === 1 ? 'it' : 'them'}.
            </p>
          </div>
        )}
      </section>

      <section className="col-span-12 xl:col-span-3 space-y-4">
        <SectionHeader icon={<ActivityIcon size={13} className="text-blue-400" />} label="Live Activity" />
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] max-h-[calc(100vh-8rem)] overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center">
              <ActivityIcon size={18} className="text-white/15 mb-2" />
              <p className="text-[12px] text-white/30">No recent events</p>
              <p className="text-[10px] text-white/20 mt-0.5">Activity will appear here in real time</p>
            </div>
          ) : events.map(ev => (
            <div key={ev.id} className="p-3.5 flex items-start gap-2.5">
              <AgentAvatar agent={ev.actor || 'system'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/75 leading-snug">
                  <span className="font-semibold text-white/90 capitalize">{ev.actor || 'system'}</span>{' '}
                  <span className="text-white/50">{ev.details?.message || humanizeEventType(ev.event_type)}</span>
                  {ev.target && !ev.details?.message && <span className="text-white/30"> → {ev.target}</span>}
                </p>
                <p className="text-[10px] text-white/25 mt-1.5">{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SectionHeader({ icon, label, trailing }: { icon: React.ReactNode; label: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 h-5">
      {icon}
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</h2>
      {trailing}
    </div>
  )
}
