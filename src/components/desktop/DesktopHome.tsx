import React, { useEffect, useState } from 'react'
import { AlertTriangle, Activity as ActivityIcon, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { InlineActions } from '../InlineActions'
import { AgentAvatar } from '../shared/AgentAvatar'

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
    <div className="grid grid-cols-12 gap-4 min-h-[calc(100vh-4rem)]">

      <section className="col-span-12 xl:col-span-3 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-emerald-400" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Revenue Pulse</h2>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-4 space-y-3">
          <p className="text-[12px] text-white/60 leading-relaxed">{summary.headline || '—'}</p>
          {summary.body && <p className="text-[11px] text-white/40 leading-relaxed">{summary.body}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m: any) => (
            <div key={m.id} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/35">{m.label}</p>
              <p className="text-[18px] font-semibold text-white mt-1">{m.value}</p>
              {typeof m.progress_pct === 'number' && (
                <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, m.progress_pct)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {goals.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/35">Weekly Goals</p>
            {goals.slice(0, 4).map(g => (
              <div key={g.id} className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-white/70 truncate">{g.title}</span>
                <span className="text-[11px] font-mono text-white/50">{g.current}/{g.target}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="col-span-12 xl:col-span-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Needs You</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">{waiting.length}</span>
        </div>
        {waiting.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-8 text-center text-[13px] text-white/30">
            Nothing waiting on you. Nice.
          </div>
        ) : (
          <div className="space-y-2">
            {waiting.map(t => <NeedsYouCard key={t.id} task={t} />)}
          </div>
        )}
      </section>

      <section className="col-span-12 xl:col-span-3 space-y-3">
        <div className="flex items-center gap-2">
          <ActivityIcon size={14} className="text-blue-400" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Live Activity</h2>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04] max-h-[calc(100vh-8rem)] overflow-y-auto">
          {events.length === 0 && <div className="p-4 text-[12px] text-white/30">No recent events</div>}
          {events.map(ev => (
            <div key={ev.id} className="p-3 flex items-start gap-2">
              <AgentAvatar agent={ev.actor || 'system'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/70 leading-tight">
                  <span className="font-semibold">{ev.actor || 'system'}</span>{' '}
                  <span className="text-white/40">{ev.event_type}</span>
                  {ev.target && <span className="text-white/30"> → {ev.target}</span>}
                </p>
                {ev.details?.message && <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{ev.details.message}</p>}
                <p className="text-[10px] text-white/25 mt-1">{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function NeedsYouCard({ task }: { task: TaskRow }) {
  const agent = task.agent || task.owner || 'system'
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-2 hover:border-amber-500/40 transition-colors">
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-snug">{task.title}</p>
          <p className="text-[11px] text-white/50 mt-0.5">
            <span className="text-white/70">{agent}</span>
            {task.updated_at && <> · {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</>}
          </p>
          {task.next_step && <p className="text-[11px] text-amber-300/70 mt-1.5 leading-snug line-clamp-3">{task.next_step}</p>}
        </div>
      </div>
      <InlineActions taskId={task.id} currentStatus={task.status} />
    </div>
  )
}
