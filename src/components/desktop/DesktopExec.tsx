import React, { useEffect, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatDistanceToNow } from 'date-fns'
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
    <div className="grid grid-cols-12 gap-4">

      <section className="col-span-12 xl:col-span-4 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Revenue & Pipeline</h2>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-4">
          <p className="text-[11px] text-white/40 mb-2">Progress Across KPIs</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="name" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <YAxis tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#111113', border: '1px solid #ffffff20', fontSize: 11 }} />
                <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-4">
          <p className="text-[11px] text-white/40 mb-2">Agent Cost ($USD / {runs.length} runs)</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByAgent}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="agent" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <YAxis tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#111113', border: '1px solid #ffffff20', fontSize: 11 }} />
                <Bar dataKey="cost" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="col-span-12 xl:col-span-8 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">Intelligence Feed</h2>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] divide-y divide-white/[0.04] max-h-[calc(100vh-8rem)] overflow-y-auto">
          {reports.length === 0 && <p className="p-4 text-[12px] text-white/30">No recent reports</p>}
          {reports.map(r => (
            <div key={r.id} className="p-3 flex items-start gap-2">
              <AgentAvatar agent={r.actor || 'system'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/75">
                  <span className="font-semibold">{r.actor}</span> <span className="text-white/40">{r.event_type}</span>
                  {r.target && <span className="text-white/35"> → {r.target}</span>}
                </p>
                {r.details?.message && <p className="text-[11px] text-white/45 mt-0.5 leading-snug">{r.details.message}</p>}
                {r.details?.summary && <p className="text-[11px] text-white/45 mt-0.5 leading-snug line-clamp-3">{r.details.summary}</p>}
                <p className="text-[10px] text-white/25 mt-1">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
