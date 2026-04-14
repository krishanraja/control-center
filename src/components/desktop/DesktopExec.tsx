import React, { useEffect, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { Radio, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { AgentAvatar } from '../shared/AgentAvatar'

export function DesktopExec() {
  const [metrics, setMetrics] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])

  useEffect(() => {
    supabase.from('home_intelligence').select('metrics').eq('id', 'current').maybeSingle().then(({ data }) => setMetrics((data as any)?.metrics || []))
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(20).then(({ data }) => setReports((data as any) || []))
    supabase.from('workflow_runs').select('*').order('run_at', { ascending: false }).limit(20).then(({ data }) => setRuns((data as any) || []))
  }, [])

  const chartData = metrics.map((m: any) => ({
    name: m.label?.split(' ')[0] || m.id,
    value: typeof m.progress_pct === 'number' ? m.progress_pct : 0,
  }))

  const costByAgent = Object.values(runs.reduce((acc: any, r: any) => {
    const k = r.agent_id || 'system'
    if (!acc[k]) acc[k] = { agent: k, cost: 0, runs: 0 }
    acc[k].cost += Number(r.cost_usd || 0)
    acc[k].runs += 1
    return acc
  }, {} as any)) as any[]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold text-white tracking-tight">Intel</h1>
        <p className="text-[12px] text-white/40 mt-1">Revenue pulse, agent economics, and the intelligence feed.</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 xl:col-span-4 space-y-4">
          <SectionHeader icon={<BarChart3 size={13} className="text-violet-400" />} label="Revenue & Pipeline" />

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 font-medium mb-3">Progress Across KPIs</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                  <XAxis dataKey="name" tick={{ fill: '#ffffff55', fontSize: 10 }} axisLine={{ stroke: '#ffffff15' }} tickLine={false} />
                  <YAxis tick={{ fill: '#ffffff55', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111113', border: '1px solid #ffffff20', fontSize: 11, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/40 font-medium">Agent Cost</p>
              <p className="text-[10px] text-white/30 font-mono tabular-nums">{runs.length} runs · USD</p>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costByAgent} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                  <XAxis dataKey="agent" tick={{ fill: '#ffffff55', fontSize: 10 }} axisLine={{ stroke: '#ffffff15' }} tickLine={false} />
                  <YAxis tick={{ fill: '#ffffff55', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111113', border: '1px solid #ffffff20', fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="cost" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="col-span-12 xl:col-span-8 space-y-4">
          <SectionHeader icon={<Radio size={13} className="text-blue-400" />} label="Intelligence Feed" trailing={
            <span className="text-[10px] text-white/30 font-mono tabular-nums">{reports.length}</span>
          } />
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.04] max-h-[calc(100vh-12rem)] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-[13px] text-white/40">Feed is quiet.</p>
                <p className="text-[11px] text-white/25 mt-1">New reports will appear here in real time.</p>
              </div>
            ) : reports.map(r => (
              <div key={r.id} className="p-4 flex items-start gap-3">
                <AgentAvatar agent={r.actor || 'system'} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white/80 leading-snug">
                    <span className="font-semibold text-white/95">{r.actor}</span>{' '}
                    <span className="text-white/45">{r.event_type}</span>
                    {r.target && <span className="text-white/35"> → {r.target}</span>}
                  </p>
                  {r.details?.message && <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{r.details.message}</p>}
                  {r.details?.summary && <p className="text-[11px] text-white/50 mt-1 leading-relaxed line-clamp-3">{r.details.summary}</p>}
                  <p className="text-[10px] text-white/25 mt-1.5">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
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
