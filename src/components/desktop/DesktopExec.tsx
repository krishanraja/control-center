import React, { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { Radio, BarChart3, DollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'

export function DesktopExec() {
  const [metrics, setMetrics] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])

  useEffect(() => {
    supabase.from('home_intelligence').select('metrics').eq('id', 'current').maybeSingle().then(({ data }) => setMetrics((data as any)?.metrics || []))
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(20).then(({ data }) => setReports((data as any) || []))
    supabase.from('workflow_runs').select('*').order('run_at', { ascending: false }).limit(20).then(({ data }) => setRuns((data as any) || []))
  }, [])

  const chartData = useMemo(() => metrics.map((m: any) => ({
    name: (m.label || m.id || '').split(' ')[0],
    value: typeof m.progress_pct === 'number' ? m.progress_pct : 0,
  })), [metrics])

  const costByAgent = useMemo(() => (
    Object.values(runs.reduce((acc: any, r: any) => {
      // Fall back to legacy `agent` column for pre-2026-04-15 rows.
      const k = r.agent_id || r.agent || 'system'
      if (!acc[k]) acc[k] = { agent: humanize(k), cost: 0, runs: 0 }
      acc[k].cost += Number(r.cost_usd || r.cost || 0)
      acc[k].runs += 1
      return acc
    }, {} as any)) as any[]
  ).sort((a: any, b: any) => b.cost - a.cost), [runs])

  const totalCost = costByAgent.reduce((s: number, x: any) => s + x.cost, 0)

  const axisTick = { fill: '#ffffff40', fontSize: 10 }

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Intel</h1>
        <p className="text-xs md:text-[12px] text-white/40 mt-1">Revenue pulse, agent economics, and the intelligence feed.</p>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <section className="col-span-12 xl:col-span-5 space-y-4">
          <SectionHeader icon={<BarChart3 size={13} className="text-violet-400" />} label="Revenue & Pipeline" />

          <div className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.025] to-white/[0.01] p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 font-semibold">Progress Across KPIs</p>
              <p className="text-[10px] text-white/30 font-mono tabular-nums">{chartData.length} KPIs</p>
            </div>
            {chartData.length === 0 ? (
              <div className="h-[160px] md:h-[200px] flex items-center justify-center text-[12px] text-white/30">No KPIs yet.</div>
            ) : (
              <div className="h-[180px] md:h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#ffffff0a" vertical={false} />
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      cursor={{ stroke: '#ffffff15' }}
                      contentStyle={{ background: '#0b0b0d', border: '1px solid #ffffff18', fontSize: 11, borderRadius: 8, padding: '6px 10px' }}
                      labelStyle={{ color: '#ffffff80', fontWeight: 500 }}
                      itemStyle={{ color: '#a78bfa' }}
                    />
                    <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.025] to-white/[0.01] p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-3 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <DollarSign size={12} className="text-emerald-400 flex-shrink-0" />
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 font-semibold truncate">Agent Cost</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] text-white font-semibold tabular-nums">${totalCost.toFixed(2)}</p>
                <p className="text-[10px] text-white/30 font-mono tabular-nums">{runs.length} runs</p>
              </div>
            </div>
            {costByAgent.length === 0 ? (
              <div className="h-[160px] md:h-[200px] flex items-center justify-center text-[12px] text-white/30">No workflow runs yet.</div>
            ) : (
              <div className="h-[180px] md:h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costByAgent} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#ffffff0a" vertical={false} />
                    <XAxis dataKey="agent" tick={axisTick} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={40} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      contentStyle={{ background: '#0b0b0d', border: '1px solid #ffffff18', fontSize: 11, borderRadius: 8, padding: '6px 10px' }}
                      labelStyle={{ color: '#ffffff80', fontWeight: 500 }}
                      formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'cost']}
                    />
                    <Bar dataKey="cost" fill="#34d399" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="col-span-12 xl:col-span-7 space-y-4">
          <SectionHeader icon={<Radio size={13} className="text-blue-400" />} label="Intelligence Feed" trailing={
            <span className="text-[10px] text-white/30 font-mono tabular-nums">{reports.length}</span>
          } />
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
            {reports.length === 0 ? (
              <div className="p-10 md:p-12 text-center">
                <Radio size={20} className="text-white/20 mx-auto mb-3" />
                <p className="text-sm md:text-[13px] text-white/45 font-medium">Feed is quiet.</p>
                <p className="text-[11px] md:text-[12px] text-white/25 mt-1">New reports will appear here in real time.</p>
              </div>
            ) : (
              <ol className="relative">
                {reports.map((r, idx) => (
                  <FeedItem key={r.id} report={r} isLast={idx === reports.length - 1} />
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function FeedItem({ report: r, isLast }: { report: any; isLast: boolean }) {
  const details = r.details
  let message: string | null = null
  if (typeof details === 'string') message = details
  else if (details?.message) message = details.message
  else if (details?.summary) message = details.summary

  return (
    <li className="relative pl-12 md:pl-14 pr-4 md:pr-5 py-3.5 md:py-4 hover:bg-white/[0.015] transition-colors">
      {/* timeline rail + node */}
      <span className="absolute left-6 md:left-7 top-5 w-2 h-2 rounded-full bg-blue-400/70 ring-4 ring-blue-400/10" />
      {!isLast && <span className="absolute left-[calc(1.75rem-0.5px)] md:left-[calc(1.875rem-0.5px)] top-7 bottom-0 w-px bg-white/[0.06]" />}

      <div className="flex items-start gap-2.5">
        <AgentAvatar agent={r.actor || 'system'} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-[12px] text-white/80 leading-snug">
            <span className="font-semibold text-white/95">{humanize(r.actor) || 'System'}</span>{' '}
            <span className="text-white/45">{humanize(r.event_type).toLowerCase()}</span>
            {r.target && <span className="text-white/30"> → {humanize(r.target)}</span>}
          </p>
          {message && <p className="text-[11px] md:text-[12px] text-white/55 mt-1 leading-relaxed line-clamp-3">{message}</p>}
          <p className="text-[10px] text-white/25 mt-1.5 tabular-nums">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
        </div>
      </div>
    </li>
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
