import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Activity as ActivityIcon, TrendingUp, Target, Radio, ArrowUpRight, Server } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'
import { SystemHealth } from '../SystemHealth'

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
  display_message?: string | null
  created_at: string
}

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/** `summary` is stored as a JSON text column, not jsonb — parse defensively. */
function parseSummary(raw: any): { headline?: string; body?: string; recommended_focus?: string } {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

/** `metrics` may arrive as a JSON-encoded string in some rows — coerce to array. */
function parseMetrics(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  return []
}

// Noisy agent-internal events that clutter the operator view — filtered from both
// the initial fetch and the realtime stream.
const EXCLUDED_EVENT_TYPES = new Set([
  'cc-sync-engine',
  'drive-sync-run',
  'signal-sweep-complete',
])

function resolveMessage(ev: AuditEvent): string | null {
  if (ev.display_message) return ev.display_message
  const d = ev.details
  if (typeof d === 'string') return d
  if (d?.message) return d.message
  if (d?.summary) return d.summary
  return null
}

const hasRenderableMessage = (ev: AuditEvent) => resolveMessage(ev) !== null

export function DesktopHome({ onNavigate }: { onNavigate?: NavigateFn } = {}) {
  const [intel, setIntel] = useState<HomeIntel | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
    const { tasks: waiting } = useRealtimeTasks({ statusIn: ['waiting'] })

  useEffect(() => {
    supabase.from('home_intelligence').select('*').eq('id', 'current').maybeSingle().then(({ data }) => setIntel(data as any))
    
    const loadEvents = async () => {
      const excluded = Array.from(EXCLUDED_EVENT_TYPES).map(t => `"${t}"`).join(',')
      const { data } = await supabase
        .from('audit_log')
        .select('*')
        .not('event_type', 'in', `(${excluded})`)
        .order('created_at', { ascending: false })
        .limit(40)
      setEvents((data as any) || [])
    }
    loadEvents()
    const ch = supabase
      .channel('home-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        (p) => {
          const ev = p.new as AuditEvent
          if (EXCLUDED_EVENT_TYPES.has(ev.event_type)) return
          setEvents(prev => [ev, ...prev].slice(0, 40))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const summary = useMemo(() => parseSummary(intel?.summary), [intel?.summary])
  const metrics = useMemo(() => parseMetrics(intel?.metrics), [intel?.metrics])

  const approvalCount = waiting.length
  const goToToday = () => onNavigate?.('today')

  return (
    <div className="flex flex-col gap-4 md:gap-5 xl:h-[calc(100vh-3rem)]">

      {/* APPROVAL BANNER — slim alert routing to Today tab */}
      {approvalCount > 0 && (
        <button
          type="button"
          onClick={goToToday}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToToday() } }}
          className="flex items-center gap-2 w-full text-left rounded-xl border border-amber-500/25 bg-amber-500/[0.06] hover:bg-amber-500/[0.10] transition-colors px-4 py-2.5"
        >
          <AlertTriangle size={14} className="text-amber-300 flex-shrink-0" />
          <span className="text-[12.5px] text-amber-200/90 font-medium leading-snug">
            <span className="tabular-nums font-semibold text-amber-200">{approvalCount}</span>{' '}
            {approvalCount === 1 ? 'item needs' : 'items need'} your approval in the Today tab
          </span>
          <ArrowUpRight size={13} className="text-amber-300/70 ml-auto flex-shrink-0" />
        </button>
      )}

      {/* KPI STRIP — most important numbers above the fold */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
          {metrics.slice(0, 4).map((m: any) => <KpiTile key={m.id} metric={m} />)}
        </div>
      )}

      {/* MAIN 3-COL — fills remaining viewport */}
      <div className="grid grid-cols-12 gap-4 md:gap-5 flex-1 min-h-0">

        {/* LEFT: Revenue Pulse */}
        <section className="col-span-12 xl:col-span-4 flex flex-col gap-3 min-h-0">
          <SectionHeader icon={<TrendingUp size={13} className="text-emerald-400" />} label="Revenue Pulse" />
          {summary.headline ? (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
              <p className="text-[13px] text-white/90 leading-snug font-medium">{summary.headline}</p>
              {summary.body && <p className="text-[12px] text-white/50 leading-relaxed line-clamp-4">{summary.body}</p>}
              {summary.recommended_focus && (
                <p className="text-[11px] text-emerald-300/85 leading-relaxed pt-1.5 mt-1.5 border-t border-white/[0.05]">
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
        </section>

        {/* CENTER: Active Plans — read-only macro scoreboard */}
        <section className="col-span-12 xl:col-span-5 flex flex-col gap-3 min-h-0">
          <ActivePlansList />
        </section>

        {/* RIGHT: System Health on top, Live Activity below */}
        <section className="col-span-12 xl:col-span-3 flex flex-col gap-3 min-h-0">
          <SectionHeader icon={<Server size={13} className="text-emerald-400" />} label="System Health" />
          <SystemHealth />
          <SectionHeader icon={<ActivityIcon size={13} className="text-blue-400" />} label="Live Activity" />
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] flex-1 min-h-0 overflow-y-auto">
            {(() => {
              const visible = events.filter(hasRenderableMessage).slice(0, 15)
              if (visible.length === 0) {
                return (
                  <EmptyTile
                    icon={<ActivityIcon size={18} className="text-white/25" />}
                    title="Quiet."
                    subtitle="Activity will appear here in real time."
                    bare
                  />
                )
              }
              return visible.map(ev => <ActivityRow key={ev.id} event={ev} />)
            })()}
          </div>
        </section>
      </div>
    </div>
  )
}

interface AgentPlanRow {
  agent_id: string
  current_phase: string | null
  objective: string | null
  progress_pct: number | null
}

interface AgentRow {
  id: string
  name: string
  active?: boolean
}

interface MergedPlan {
  agent_id: string
  agent_name: string
  current_phase: string | null
  objective: string | null
  progress_pct: number | null
}

function ActivePlansList() {
  const [plans, setPlans] = useState<MergedPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [ag, pl] = await Promise.all([
        supabase.from('agents').select('id,name,active').eq('active', true),
        supabase.from('agent_plans').select('agent_id,current_phase,objective,progress_pct'),
      ])
      if (cancelled) return
      const agentMap = new Map<string, AgentRow>(((ag.data as AgentRow[]) || []).map(a => [a.id, a]))
      const merged: MergedPlan[] = ((pl.data as AgentPlanRow[]) || [])
        .filter(p => agentMap.has(p.agent_id))
        .map(p => ({
          agent_id: p.agent_id,
          agent_name: agentMap.get(p.agent_id)!.name || humanize(p.agent_id) || p.agent_id,
          current_phase: p.current_phase,
          objective: p.objective,
          progress_pct: typeof p.progress_pct === 'number' ? p.progress_pct : null,
        }))
        .sort((a, b) => {
          const ap = a.progress_pct ?? Number.POSITIVE_INFINITY
          const bp = b.progress_pct ?? Number.POSITIVE_INFINITY
          if (ap !== bp) return ap - bp
          return a.agent_name.localeCompare(b.agent_name)
        })
      setPlans(merged)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <SectionHeader
        icon={<Target size={13} className="text-violet-400" />}
        label="Active Plans"
        trailing={
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/25 font-mono tabular-nums">{plans.length}</span>
        }
      />
      {loading ? (
        <EmptyTile
          icon={<Target size={18} className="text-white/25" />}
          title="Loading plans…"
          bare
        />
      ) : plans.length === 0 ? (
        <EmptyTile
          icon={<Target size={20} className="text-white/25" />}
          title="No active plans."
          subtitle="Plans appear here once agents publish them."
          size="lg"
        />
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.04] flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {plans.map(p => <PlanRow key={p.agent_id} plan={p} />)}
        </div>
      )}
    </>
  )
}

function PlanRow({ plan: p }: { plan: MergedPlan }) {
  const pct = p.progress_pct
  const pctClamped = pct !== null ? Math.max(0, Math.min(100, pct)) : null
  const barColor =
    pctClamped === null ? 'bg-white/[0.12]' :
    pctClamped >= 66 ? 'bg-emerald-400' :
    pctClamped >= 33 ? 'bg-gradient-to-r from-violet-500 to-violet-400' :
    'bg-gradient-to-r from-amber-500 to-violet-500'
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <AgentAvatar agent={p.agent_id} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[12.5px] text-white/90 font-medium leading-snug truncate">{p.agent_name}</p>
          {p.current_phase && (
            <span className="text-[9.5px] uppercase tracking-wider text-white/55 bg-white/[0.05] border border-white/[0.08] px-1.5 py-px rounded flex-shrink-0">
              {p.current_phase}
            </span>
          )}
        </div>
        {p.objective ? (
          <p className="text-[11.5px] text-white/55 leading-snug mt-1 line-clamp-2">{p.objective}</p>
        ) : (
          <p className="text-[11.5px] text-white/30 italic mt-1">No objective set.</p>
        )}
      </div>
      <div className="w-16 flex flex-col items-end flex-shrink-0 gap-1.5 mt-0.5">
        <span className="text-[11px] font-mono tabular-nums text-white/60">
          {pctClamped !== null ? `${Math.round(pctClamped)}%` : '—'}
        </span>
        <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
          {pctClamped !== null && (
            <div className={`h-full ${barColor}`} style={{ width: `${pctClamped}%` }} />
          )}
        </div>
      </div>
    </div>
  )
}

function KpiTile({ metric: m }: { metric: any }) {
  const pct = typeof m.progress_pct === 'number' ? Math.max(0, Math.min(100, m.progress_pct)) : null
  return (
    <div className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.025] to-white/[0.005] p-3 md:p-3.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold line-clamp-1">{m.label || humanize(m.id) || 'Metric'}</p>
      <p className="text-lg md:text-[22px] font-semibold text-white mt-1 tracking-tight tabular-nums leading-none">{m.value ?? '—'}</p>
      {pct !== null && (
        <div className="mt-2.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div className={`h-full ${pct >= 66 ? 'bg-emerald-400' : pct >= 33 ? 'bg-gradient-to-r from-violet-500 to-violet-400' : 'bg-gradient-to-r from-amber-500 to-violet-500'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {m.sub && <p className="text-[11px] text-white/40 mt-1.5 line-clamp-1">{m.sub}</p>}
    </div>
  )
}

function ActivityRow({ event: ev }: { event: AuditEvent }) {
  const message = resolveMessage(ev)
  return (
    <div className="p-3 flex items-start gap-2.5">
      <AgentAvatar agent={ev.actor || 'system'} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/75 leading-snug">
          <span className="font-semibold text-white/90">{humanize(ev.actor) || 'System'}</span>{' '}
          <span className="text-white/45">{humanize(ev.event_type).toLowerCase()}</span>
          {ev.target && <span className="text-white/30"> → {humanize(ev.target)}</span>}
        </p>
        <p className="text-[11px] text-white/45 mt-1 line-clamp-2 leading-snug">{message}</p>
        <p className="text-[10px] text-white/25 mt-1.5">{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</p>
      </div>
    </div>
  )
}

function EmptyTile({ icon, title, subtitle, size = 'md', bare = false }: { icon: React.ReactNode; title: string; subtitle?: string; size?: 'md' | 'lg'; bare?: boolean }) {
  const pad = size === 'lg' ? 'p-8 md:p-10' : 'p-6 md:p-8'
  const cls = bare
    ? `${pad} flex flex-col items-center justify-center text-center`
    : `rounded-xl border border-white/[0.06] bg-white/[0.015] ${pad} flex flex-col items-center justify-center text-center`
  return (
    <div className={cls}>
      <div className="mb-3">{icon}</div>
      <p className="text-[13px] text-white/50 font-medium">{title}</p>
      {subtitle && <p className="text-[12px] text-white/30 mt-1 max-w-xs">{subtitle}</p>}
    </div>
  )
}

function SectionHeader({ icon, label, trailing }: { icon: React.ReactNode; label: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 h-5 flex-shrink-0">
      {icon}
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 flex-1">{label}</h2>
      {trailing}
    </div>
  )
}
