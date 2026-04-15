import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Activity as ActivityIcon, TrendingUp, Sparkles, Target, Radio } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'

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
  target?: string
  current?: string
  progress?: number | null
  status?: string
}

/** `summary` is stored as a JSON text column, not jsonb — parse defensively. */
function parseSummary(raw: any): { headline?: string; body?: string; recommended_focus?: string } {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
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

  const summary = useMemo(() => parseSummary(intel?.summary), [intel?.summary])
  const metrics = intel?.metrics || []

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-5 min-h-[calc(100vh-4rem)]">

      <section className="col-span-12 xl:col-span-3 space-y-4">
        <SectionHeader icon={<TrendingUp size={13} className="text-emerald-400" />} label="Revenue Pulse" />
        {summary.headline ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-5 space-y-2">
            <p className="text-sm md:text-[13px] text-white/85 leading-relaxed font-medium">{summary.headline}</p>
            {summary.body && <p className="text-xs md:text-[12px] text-white/45 leading-relaxed">{summary.body}</p>}
            {summary.recommended_focus && (
              <p className="text-[11px] text-emerald-300/80 leading-relaxed pt-1.5 mt-1.5 border-t border-white/[0.05]">
                <span className="uppercase tracking-[0.14em] text-[9px] text-emerald-400/70 mr-1.5">Focus</span>
                {summary.recommended_focus}
              </p>
            )}
          </div>
        ) : (
          <EmptyTile
            icon={<Radio size={18} className="text-white/25" />}
            title="No revenue pulse yet"
            subtitle="Once intel is generated, the headline will appear here."
          />
        )}

        {metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {metrics.map((m: any) => (
              <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 md:p-3.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-medium line-clamp-1">{m.label}</p>
                <p className="text-lg md:text-[20px] font-semibold text-white mt-1.5 tracking-tight tabular-nums">{m.value}</p>
                {typeof m.progress_pct === 'number' && (
                  <div className="mt-2.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400" style={{ width: `${Math.min(100, m.progress_pct)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Target size={13} className="text-violet-400" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold">Weekly Goals</p>
          </div>
          {goals.length === 0 ? (
            <p className="text-[12px] text-white/35 py-2">No goals this week.</p>
          ) : (
            <ul className="space-y-3.5">
              {goals.slice(0, 4).map(g => {
                const pct = typeof g.progress === 'number' ? Math.max(0, Math.min(100, g.progress)) : null
                return (
                  <li key={g.id} className="space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <p className="flex-1 text-[12.5px] md:text-[13px] text-white/85 font-medium leading-snug line-clamp-2">{g.title}</p>
                      {pct !== null && (
                        <span className="flex-shrink-0 text-[11px] font-mono tabular-nums text-white/45">{pct}%</span>
                      )}
                    </div>
                    {pct !== null ? (
                      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${
                            pct >= 100 ? 'bg-emerald-400'
                            : pct >= 66  ? 'bg-gradient-to-r from-violet-500 to-emerald-400'
                            : pct >= 33  ? 'bg-gradient-to-r from-violet-500 to-violet-400'
                                         : 'bg-gradient-to-r from-amber-500 to-violet-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-1.5 bg-white/[0.04] rounded-full" />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="col-span-12 xl:col-span-6 space-y-4">
        <SectionHeader icon={<AlertTriangle size={13} className="text-amber-400" />} label="Needs You" trailing={
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 font-mono tabular-nums">{waiting.length}</span>
        } />
        {waiting.length === 0 ? (
          <EmptyTile
            icon={<Sparkles size={20} className="text-white/25" />}
            title="Inbox zero."
            subtitle="Nothing is waiting on you."
            size="lg"
          />
        ) : (
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-amber-500/[0.02] to-transparent p-6 md:p-8">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl md:text-[44px] font-semibold text-amber-300 leading-none tracking-tight tabular-nums">{waiting.length}</span>
              <span className="text-sm md:text-[14px] text-white/75 font-medium">{waiting.length === 1 ? 'item needs' : 'items need'} your attention</span>
            </div>
            <p className="text-xs md:text-[12px] text-white/45 leading-relaxed mt-3">
              Open the <span className="text-white/70 font-medium">Today</span> tab to review and act on {waiting.length === 1 ? 'it' : 'them'}.
            </p>
          </div>
        )}
      </section>

      <section className="col-span-12 xl:col-span-3 space-y-4">
        <SectionHeader icon={<ActivityIcon size={13} className="text-blue-400" />} label="Live Activity" />
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
          {events.length === 0 ? (
            <EmptyTile
              icon={<ActivityIcon size={18} className="text-white/25" />}
              title="Quiet."
              subtitle="Activity will appear here in real time."
              bare
            />
          ) : events.map(ev => <ActivityRow key={ev.id} event={ev} />)}
        </div>
      </section>
    </div>
  )
}

function ActivityRow({ event: ev }: { event: AuditEvent }) {
  const details = ev.details
  let message: string | null = null
  if (typeof details === 'string') message = details
  else if (details?.message) message = details.message
  else if (details?.summary) message = details.summary

  return (
    <div className="p-3 md:p-3.5 flex items-start gap-2.5">
      <AgentAvatar agent={ev.actor || 'system'} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-xs md:text-[12px] text-white/75 leading-snug">
          <span className="font-semibold text-white/90">{humanize(ev.actor) || 'System'}</span>{' '}
          <span className="text-white/45">{humanize(ev.event_type).toLowerCase()}</span>
          {ev.target && <span className="text-white/30"> → {humanize(ev.target)}</span>}
        </p>
        {message && <p className="text-[11px] text-white/45 mt-1 line-clamp-2 leading-snug">{message}</p>}
        <p className="text-[10px] text-white/25 mt-1.5">{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</p>
      </div>
    </div>
  )
}

function EmptyTile({ icon, title, subtitle, size = 'md', bare = false }: { icon: React.ReactNode; title: string; subtitle?: string; size?: 'md' | 'lg'; bare?: boolean }) {
  const pad = size === 'lg' ? 'p-10 md:p-12' : 'p-8 md:p-10'
  const cls = bare
    ? `${pad} flex flex-col items-center justify-center text-center`
    : `rounded-xl border border-white/[0.06] bg-white/[0.015] ${pad} flex flex-col items-center justify-center text-center`
  return (
    <div className={cls}>
      <div className="mb-3">{icon}</div>
      <p className="text-sm md:text-[13px] text-white/50 font-medium">{title}</p>
      {subtitle && <p className="text-xs md:text-[12px] text-white/30 mt-1 max-w-xs">{subtitle}</p>}
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
