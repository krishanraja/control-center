import React, { useState, useEffect } from 'react'
import { Calendar, TrendingUp, Target, Award } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAgents } from '../hooks/useAgents'
import { LastUpdated } from './shared/LastUpdated'

function getDaysUntilLastDayOfMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const diff = lastDay.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function getLastDayOfMonth(): string {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return lastDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function getCurrentMonth(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const statusStyle: Record<string, { dot: string; text: string; bg: string }> = {
  hit: { dot: "bg-green-400", text: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
  partial: { dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  blocked: { dot: "bg-red-400 animate-pulse", text: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  behind: { dot: "bg-orange-400", text: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" },
}

export function AllHandsPanel() {
  const daysUntil = getDaysUntilLastDayOfMonth()
  const nextDate = getLastDayOfMonth()
  const month = getCurrentMonth()
  const isUrgent = daysUntil <= 3

  const { agents: allAgents, updatedAt } = useAgents()
  const agents = allAgents.filter(a => a.id !== 'agatha')

  const [vitals, setVitals] = useState<any[]>([])
  const [vitalsUpdatedAt, setVitalsUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    const fetchVitals = async () => {
      const { data } = await supabase
        .from('business_metrics')
        .select('*')
        .order('id')
      if (data) {
        setVitals(data)
        const latest = data.reduce((max: string | null, row: any) =>
          row.updated_at && (!max || row.updated_at > max) ? row.updated_at : max, null)
        setVitalsUpdatedAt(latest)
      }
    }
    fetchVitals()
    const ch = supabase
      .channel('allhands-vitals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_metrics' }, fetchVitals)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-command-text/70" />
          <h2 className="text-xl font-semibold text-white">Monthly All Hands</h2>
          <span className="text-sm text-command-text/60">· {month}</span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border
          ${isUrgent
            ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
            : 'bg-command-bg/40 border-command-border text-command-text/70'
          }`}>
          <span className={`w-2 h-2 rounded-full ${isUrgent ? 'bg-amber-400 animate-pulse' : 'bg-command-text/30'}`} />
          {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`} — {nextDate}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Business Vitals */}
        <div className="bg-command-card border border-command-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-command-border flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-command-accent" />
            <span className="font-semibold text-white">Business Vitals</span>
            {vitalsUpdatedAt ? (
              <span className="text-xs text-command-text/40 ml-auto">
                Updated {formatDistanceToNow(new Date(vitalsUpdatedAt), { addSuffix: true })}
              </span>
            ) : (
              <span className="text-xs text-command-text/50 ml-auto">vs {month} targets</span>
            )}
          </div>
          <div className="divide-y divide-command-border/40">
            {vitals.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 animate-pulse">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-command-text/20 flex-shrink-0" />
                    <div>
                      <div className="h-3 w-28 bg-command-text/10 rounded" />
                      <div className="h-2 w-20 bg-command-text/10 rounded mt-1.5" />
                    </div>
                  </div>
                  <div className="h-3 w-24 bg-command-text/10 rounded" />
                </div>
              ))
            ) : (
              vitals.map((v) => {
                const s = statusStyle[v.status] || statusStyle.behind
                return (
                  <div key={v.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${s.dot} flex-shrink-0`} />
                      <div>
                        <p className="text-sm text-command-text">{v.label}</p>
                        <p className="text-xs text-command-text/50">Target: {v.target}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-medium ${s.text} text-right`}>{v.value}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Agent KPI Scoreboard */}
        <div className="bg-command-card border border-command-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-command-border flex items-center space-x-2">
            <Target className="w-4 h-4 text-command-accent" />
            <span className="font-semibold text-white">Agent KPI Scoreboard</span>
            <span className="ml-auto"><LastUpdated date={updatedAt} /></span>
          </div>
          <div className="divide-y divide-command-border/40">
            {agents.map(agent => {
              const isBlocked = agent.status === 'blocked'
              return (
                <div key={agent.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5
                        ${isBlocked ? 'bg-red-400 animate-pulse' : 'bg-command-info'}`} />
                      <span className="text-sm font-medium text-white">{agent.humanName}</span>
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      {agent.kpi_target ? (
                        <>
                          <p className="text-xs text-command-text/80 leading-snug">{agent.kpi_target}</p>
                          {agent.kpi_current && (
                            <p className={`text-xs mt-0.5 ${isBlocked ? 'text-red-400' : 'text-command-text/50'}`}>
                              {agent.kpi_current}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-command-text/40">No KPI set</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* All Hands Agenda */}
      <div className="bg-command-card border border-command-border rounded-xl p-4">
        <div className="flex items-center space-x-2 mb-3">
          <Award className="w-4 h-4 text-command-accent" />
          <span className="font-semibold text-white text-sm">All Hands Agenda</span>
          <span className="text-xs text-command-text/50">· Run by Agatha · Delivered via Iris to Ops-bot</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { n: "01", title: "Business Vitals", desc: "Revenue, pipeline, products vs targets" },
            { n: "02", title: "Agent Scorecards", desc: `Each agent rated against their ${month} KPIs` },
            { n: "03", title: "Wins", desc: "What worked, what compounded, what to double down on" },
            { n: "04", title: "What Didn't", desc: "Honest failures, root causes, no softening" },
            { n: "05", title: "Next Month", desc: "New KPI targets for each agent + business goal" },
          ].map(item => (
            <div key={item.n} className="p-3 bg-command-bg/30 border border-command-border/50 rounded-lg">
              <div className="text-[10px] font-bold text-command-accent mb-1">#{item.n}</div>
              <p className="text-xs font-semibold text-white mb-1">{item.title}</p>
              <p className="text-[11px] text-command-text/60 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}