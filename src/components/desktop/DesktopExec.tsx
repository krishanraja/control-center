import React, { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts'
import { formatDistanceToNow, format, differenceInHours } from 'date-fns'
import { Radio, BarChart3, TrendingUp, Zap, Clock, Timer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AgentAvatar } from '../shared/AgentAvatar'

function humanizeEventType(eventType: string): string {
  if (!eventType) return 'Action'
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function DesktopExec() {
  const [metrics, setMetrics] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [completedTasks, setCompletedTasks] = useState<any[]>([])

  useEffect(() => {
    supabase.from('home_intelligence').select('metrics').eq('id', 'current').maybeSingle().then(({ data }) => setMetrics((data as any)?.metrics || []))
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(30).then(({ data }) => setReports((data as any) || []))
    supabase.from('workflow_runs').select('*').order('run_at', { ascending: false }).limit(30).then(({ data }) => setRuns((data as any) || []))
    
    // Fetch completed tasks with cycle time data
    supabase
      .from('tasks')
      .select('started_at, completed_at')
      .eq('status', 'done')
      .not('started_at', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setCompletedTasks((data as any) || []))
  }, [])

  // Calculate average cycle time
  const avgCycleTime = useMemo(() => {
    if (completedTasks.length === 0) return null
    const totalHours = completedTasks.reduce((sum, t) => {
      const hours = differenceInHours(new Date(t.completed_at), new Date(t.started_at))
      return sum + Math.max(0, hours)
    }, 0)
    const avgHours = totalHours / completedTasks.length
    if (avgHours >= 24) {
      const days = Math.floor(avgHours / 24)
      const remainingHours = Math.round(avgHours % 24)
      return { value: remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`, count: completedTasks.length }
    }
    return { value: `${avgHours.toFixed(1)}h`, count: completedTasks.length }
  }, [completedTasks])

  const chartData = metrics.map((m: any) => ({
    name: m.label?.split(' ')[0] || m.id,
    value: typeof m.progress_pct === 'number' ? m.progress_pct : 0,
    target: 100,
  }))

  const costByAgent = Object.values(runs.reduce((acc: any, r: any) => {
    const k = r.agent_id || 'system'
    if (!acc[k]) acc[k] = { agent: k, cost: 0, runs: 0 }
    acc[k].cost += Number(r.cost_usd || 0)
    acc[k].runs += 1
    return acc
  }, {} as any)).sort((a: any, b: any) => b.cost - a.cost) as any[]

  const totalCost = costByAgent.reduce((sum, a) => sum + a.cost, 0)
  const totalRuns = runs.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight">Strategic Intel</h1>
        <p className="text-[12px] text-white/40 mt-1">Revenue pulse, agent economics, and the intelligence feed.</p>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard 
          icon={<TrendingUp size={14} className="text-violet-400" />}
          label="KPIs Tracked"
          value={metrics.length.toString()}
          subtext="Active metrics"
        />
        <MetricCard 
          icon={<Zap size={14} className="text-emerald-400" />}
          label="Workflow Runs"
          value={totalRuns.toString()}
          subtext="Last 30 days"
        />
        <MetricCard 
          icon={<BarChart3 size={14} className="text-blue-400" />}
          label="Total Spend"
          value={`$${totalCost.toFixed(2)}`}
          subtext="Agent costs"
        />
        <MetricCard 
          icon={<Clock size={14} className="text-amber-400" />}
          label="Active Agents"
          value={costByAgent.length.toString()}
          subtext="With recent runs"
        />
        <MetricCard 
          icon={<Timer size={14} className="text-cyan-400" />}
          label="Avg Cycle Time"
          value={avgCycleTime?.value || '—'}
          subtext={avgCycleTime ? `Last ${avgCycleTime.count} tasks` : 'No data yet'}
        />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 xl:col-span-4 space-y-4">
          <SectionHeader icon={<BarChart3 size={13} className="text-violet-400" />} label="Revenue & Pipeline" />

          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-medium mb-4">Progress Across KPIs</p>
            {chartData.length === 0 ? (
              <div className="h-[180px] flex flex-col items-center justify-center text-center">
                <TrendingUp size={20} className="text-white/15 mb-2" />
                <p className="text-[11px] text-white/30">No KPI data yet</p>
              </div>
            ) : (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#ffffff40', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ background: '#0d0d0f', border: '1px solid #ffffff15', fontSize: 11, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} 
                      labelStyle={{ color: '#ffffff80' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-5">
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-medium">Agent Economics</p>
              <p className="text-[9px] text-white/25 font-mono tabular-nums">{totalRuns} runs</p>
            </div>
            {costByAgent.length === 0 ? (
              <div className="h-[180px] flex flex-col items-center justify-center text-center">
                <Zap size={20} className="text-white/15 mb-2" />
                <p className="text-[11px] text-white/30">No workflow runs yet</p>
              </div>
            ) : (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costByAgent.slice(0, 6)} margin={{ top: 5, right: 5, left: -25, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#ffffff30', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="agent" tick={{ fill: '#ffffff50', fontSize: 9 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip 
                      contentStyle={{ background: '#0d0d0f', border: '1px solid #ffffff15', fontSize: 11, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} 
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                    />
                    <Bar dataKey="cost" fill="#34d399" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="col-span-12 xl:col-span-8 space-y-4">
          <SectionHeader icon={<Radio size={13} className="text-blue-400" />} label="Intelligence Feed" trailing={
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono tabular-nums">{reports.length}</span>
          } />
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent max-h-[calc(100vh-14rem)] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <Radio size={24} className="text-white/15 mb-3" />
                <p className="text-[13px] text-white/40">Feed is quiet</p>
                <p className="text-[11px] text-white/25 mt-1">New reports will appear here in real time</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-blue-500/30 via-white/10 to-transparent" />
                
                {reports.map((r, idx) => (
                  <div key={r.id} className={`relative flex items-start gap-4 p-4 ${idx !== reports.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                    {/* Timeline dot */}
                    <div className="relative z-10 flex-shrink-0">
                      <AgentAvatar agent={r.actor || 'system'} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[12px] font-semibold text-white/90 capitalize">{r.actor || 'system'}</span>
                        <span className="text-[11px] text-white/50">{r.details?.message || humanizeEventType(r.event_type)}</span>
                        {r.target && !r.details?.message && <span className="text-[11px] text-white/30">→ {r.target}</span>}
                      </div>
                      {r.details?.summary && (
                        <p className="text-[11px] text-white/45 mt-1.5 leading-relaxed line-clamp-2">{r.details.summary}</p>
                      )}
                      <p className="text-[9px] text-white/20 mt-2 font-mono tabular-nums">
                        {format(new Date(r.created_at), 'MMM d, HH:mm')} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, subtext }: { icon: React.ReactNode; label: string; value: string; subtext: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[9px] uppercase tracking-[0.1em] text-white/35 font-medium">{label}</span>
      </div>
      <p className="text-[22px] font-semibold text-white tracking-tight tabular-nums">{value}</p>
      <p className="text-[10px] text-white/30 mt-0.5">{subtext}</p>
    </div>
  )
}

function SectionHeader({ icon, label, trailing }: { icon: React.ReactNode; label: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 h-5">
      {icon}
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 flex-1">{label}</h2>
      {trailing}
    </div>
  )
}
