import React, { useEffect, useState, useMemo } from 'react'
import { AlertTriangle, Activity as ActivityIcon, TrendingUp, Sparkles, BarChart3, Target, Clock, ExternalLink, Briefcase, Brain } from 'lucide-react'
import { formatDistanceToNow, differenceInDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { AgentAvatar } from '../shared/AgentAvatar'
import { ZaraIntelligence } from '../ZaraIntelligence'

function humanizeEventType(eventType: string): string {
  if (!eventType) return 'Action'
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

interface HomeIntel {
  summary?: any
  metrics?: any[]
  executive_summary?: string
  generated_at?: string
  strategic_assessment?: {
    headline?: string
    body?: string
    recommended_focus?: string
  }
  top_3_actions?: Array<{
    id: string
    title: string
    owner: string
    status: string
  }>
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
  const { tasks: allTasks } = useRealtimeTasks()

  useEffect(() => {
    const loadIntel = async () => {
      const { data: hi } = await supabase.from('home_intelligence').select('*').eq('id', 'current').maybeSingle()
      if (hi) {
        const parsed: HomeIntel = {
          generated_at: hi.generated_at || hi.updated_at,
        }
        if (hi.summary) {
          try {
            const summary = typeof hi.summary === 'string' ? JSON.parse(hi.summary) : hi.summary
            Object.assign(parsed, summary)
            // Explicitly extract top_3_actions if present in summary
            if (summary.top_3_actions && Array.isArray(summary.top_3_actions)) {
              parsed.top_3_actions = summary.top_3_actions
            }
          } catch {
            parsed.executive_summary = hi.assessment || hi.summary
          }
        }
        if (hi.assessment && !parsed.strategic_assessment) {
          parsed.strategic_assessment = { headline: '', body: hi.assessment, recommended_focus: '' }
        }
        if (hi.metrics) {
          try {
            parsed.metrics = typeof hi.metrics === 'string' ? JSON.parse(hi.metrics) : hi.metrics
          } catch {}
        }
        // Also check for top_3_actions at the top level of hi (in case Marcus stores it there)
        if (hi.top_3_actions && !parsed.top_3_actions) {
          try {
            parsed.top_3_actions = typeof hi.top_3_actions === 'string' 
              ? JSON.parse(hi.top_3_actions) 
              : hi.top_3_actions
          } catch {}
        }
        setIntel(parsed)
      }
    }
    loadIntel()
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

  const agingBlockers = useMemo(() => {
    return allTasks
      .filter(t => t.status === 'blocked' || t.status === 'waiting')
      .map(t => {
        const daysAgo = t.updated_at ? differenceInDays(new Date(), new Date(t.updated_at)) : 0
        return { ...t, daysAgo }
      })
      .filter(t => t.daysAgo >= 3)
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .slice(0, 5)
  }, [allTasks])

  const ventureHealth = useMemo(() => {
    const ventureMap: Record<string, { active: number; blocked: number; total: number }> = {}
    allTasks.forEach(t => {
      const v = t.venture_id || 'unassigned'
      if (!ventureMap[v]) ventureMap[v] = { active: 0, blocked: 0, total: 0 }
      ventureMap[v].total++
      if (t.status === 'active' || t.status === 'in_progress') ventureMap[v].active++
      if (t.status === 'blocked' || t.status === 'waiting') ventureMap[v].blocked++
    })
    return Object.entries(ventureMap)
      .filter(([v]) => v !== 'unassigned')
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
  }, [allTasks])

  // After parsing, headline/body/recommended_focus are spread directly onto intel
  const headline = (intel as any)?.headline
  const body = (intel as any)?.body
  const recommendedFocus = (intel as any)?.recommended_focus
  const metrics = intel?.metrics || []
  const execSummary = intel?.executive_summary || body
  const topActions = intel?.top_3_actions || []

  return (
    <div className="space-y-5">
      {/* Executive Summary - Full Width at Top */}
      {execSummary && (
        <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-violet-500/[0.03] to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
              <Brain size={18} className="text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400/80">Executive Summary</p>
                <span className="text-[10px] text-white/25">· Marcus</span>
                {intel?.generated_at && (
                  <span className="text-[10px] text-white/20">· {formatDistanceToNow(new Date(intel.generated_at), { addSuffix: true })}</span>
                )}
              </div>
              {headline && <p className="text-[15px] text-white font-semibold mb-2">{headline}</p>}
              <p className="text-[14px] text-white/85 leading-relaxed">{execSummary}</p>
              {recommendedFocus && (
                <div className="mt-4 pt-4 border-t border-violet-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/70 mb-1">Focus This Week</p>
                  <p className="text-[13px] text-amber-200/70 leading-relaxed">{recommendedFocus}</p>
                </div>
              )}
            </div>
          </div>
          {topActions.length > 0 && (
            <div className="mt-5 pt-4 border-t border-violet-500/10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-3">Top {topActions.length} Actions</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {topActions.map((action, i) => (
                  <div key={action.id || i} className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <AgentAvatar agent={action.owner} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white/80 leading-snug line-clamp-2">{action.title}</p>
                      <p className="text-[10px] text-white/40 mt-1 capitalize">{action.owner}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zara signals — venture-tabbed, sourced from zara_signals */}
      <ZaraIntelligence />

      <div className="grid grid-cols-12 gap-5 min-h-[calc(100vh-12rem)]">

      <section className="col-span-12 xl:col-span-3 space-y-4">
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

        {ventureHealth.length > 0 && (
          <>
            <SectionHeader icon={<Briefcase size={13} className="text-violet-400" />} label="Venture Health" />
            <div className="space-y-2">
              {ventureHealth.map(([venture, stats]) => (
                <div key={venture} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
                  <span className="text-[12px] text-white/80 font-medium capitalize flex-1 truncate">{venture}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono tabular-nums">
                      {stats.active} active
                    </span>
                    {stats.blocked > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono tabular-nums">
                        {stats.blocked} blocked
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
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

        {agingBlockers.length > 0 && (
          <>
            <SectionHeader icon={<Clock size={13} className="text-rose-400" />} label="Aging Blockers" trailing={
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/25 font-mono tabular-nums">{agingBlockers.length}</span>
            } />
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] divide-y divide-rose-500/10">
              {agingBlockers.map(blocker => {
                const isRed = blocker.daysAgo >= 7
                const colorClass = isRed ? 'text-rose-400' : 'text-amber-400'
                return (
                  <div key={blocker.id} className="p-3.5 flex items-start gap-3">
                    <div className={`flex-shrink-0 text-[11px] font-mono font-bold tabular-nums ${colorClass}`}>
                      {blocker.daysAgo}d
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white/75 leading-snug line-clamp-2">{blocker.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-white/40">{blocker.owner || blocker.agent || 'Unassigned'}</span>
                        {blocker.link_primary && (
                          <a
                            href={blocker.link_primary}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300"
                          >
                            <ExternalLink size={9} /> Doc
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
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

