import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon, Target, ArrowUpRight, ChevronRight,
  Pencil, Check, X, Compass, CheckSquare, Server, Workflow as WorkflowIcon,
  Inbox, Ban, FileText,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { useLiveStatus, type LiveStatus } from '../../hooks/useLiveStatus'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'
import { WeeklyGoals, type GoalsData } from '../WeeklyGoals'

const API = import.meta.env.VITE_API_URL ?? ''

interface HomeIntel {
  summary?: any
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
  const [goalsData, setGoalsData] = useState<GoalsData | null>(null)
  const [planCount, setPlanCount] = useState<number | null>(null)
  const { tasks: waiting } = useRealtimeTasks({ statusIn: ['waiting'] })
  const { tasks: blocked } = useRealtimeTasks({ statusIn: ['blocked'] })
  const { tasks: allTasks } = useRealtimeTasks()
  const live = useLiveStatus(60_000)

  useEffect(() => {
    supabase.from('home_intelligence').select('*').eq('id', 'current').maybeSingle()
      .then(({ data }) => setIntel(data as any))

    supabase.from('agent_plans').select('agent_id', { count: 'exact', head: true })
      .then(({ count }) => setPlanCount(count ?? null))

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
  const approvalCount = waiting.length
  const contentCounts = useMemo(() => computeContentCounts(allTasks), [allTasks])

  const handleSaveFocus = async (newFocus: string) => {
    await fetch(`${API}/api/goals`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_focus: newFocus }),
    })
    // Optimistic update — WeeklyGoals will reconfirm on its 30s refetch.
    setGoalsData(prev => prev ? { ...prev, team_focus: newFocus } : prev)
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1280px] mx-auto w-full">

      {/* NEEDS YOU — ranked list, top of prominence ladder (blocking actions) */}
      <NeedsYouList tasks={waiting} onNavigate={onNavigate} />

      {/* BLOCKED — investigate, not approve. Visually lower than Needs You. */}
      <BlockedList tasks={blocked} onNavigate={onNavigate} />

      {/* OS MISSION — north star + this week's focus */}
      <OsMissionHero
        northStar={goalsData?.north_star}
        teamFocus={goalsData?.team_focus}
        weekOf={goalsData?.week_of}
        recommendedFocus={summary.recommended_focus}
        onSaveFocus={handleSaveFocus}
      />

      {/* WEEKLY GOALS — spacious, headerless (hero owns the framing) */}
      <WeeklyGoals
        variant="spacious"
        hideHeader={true}
        onDataLoaded={setGoalsData}
      />

      {/* PULSE — slim status tiles routing to dedicated tabs */}
      <PulseStrip
        onNavigate={onNavigate}
        planCount={planCount}
        approvalCount={approvalCount}
        live={live}
        contentCounts={contentCounts}
      />

      {/* ACTIVITY — collapsed by default */}
      <ActivityTail events={events} />
    </div>
  )
}

function OsMissionHero({
  northStar, teamFocus, weekOf, recommendedFocus, onSaveFocus,
}: {
  northStar?: string
  teamFocus?: string
  weekOf?: string
  recommendedFocus?: string
  onSaveFocus: (newFocus: string) => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [focusText, setFocusText] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setFocusText(teamFocus ?? '')
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSaveFocus(focusText)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between h-5">
        <div className="flex items-center gap-2">
          <Compass size={13} className="text-violet-400" />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">OS Mission</h2>
        </div>
        {weekOf && (
          <span className="text-[11px] text-white/30 font-mono tabular-nums">{weekOf}</span>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 md:p-7 space-y-4">
        {northStar ? (
          <p className="text-[15px] md:text-[16px] text-white/85 leading-relaxed font-medium">
            {northStar}
          </p>
        ) : (
          <p className="text-[14px] text-white/30 italic">No north star set yet.</p>
        )}

        <div className="h-px bg-white/[0.05]" />

        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-violet-300/60 font-semibold mb-2">
            This week's focus
          </p>
          {editing ? (
            <div className="flex items-start gap-2">
              <textarea
                value={focusText}
                onChange={e => setFocusText(e.target.value)}
                rows={2}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSave() }}
                className="flex-1 bg-white/[0.06] border border-violet-500/40 rounded-lg px-3 py-2 text-[13px] text-white resize-none focus:outline-none focus:border-violet-500/70"
                placeholder="What is this team's single focus this week?"
              />
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-violet-400 hover:text-violet-300 disabled:opacity-50"
                  title="Save (⌘+Enter)"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/60">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 group">
              <p className="flex-1 text-[14px] text-white/75 leading-relaxed">
                {teamFocus || <span className="text-white/30 italic">Set team focus for this week…</span>}
              </p>
              <button
                onClick={startEdit}
                className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100"
                title="Edit team focus"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {recommendedFocus && (
            <p className="text-[12px] text-emerald-300/85 leading-relaxed mt-3 pt-3 border-t border-white/[0.04]">
              <span className="uppercase tracking-[0.14em] text-[9px] text-emerald-400/70 mr-1.5 font-semibold">Recommended</span>
              {recommendedFocus}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

interface PulseTile {
  key: string
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  subClass?: string
  dot?: string
  tab: string
}

function PulseStrip({ onNavigate, planCount, approvalCount, live, contentCounts }: {
  onNavigate?: NavigateFn
  planCount: number | null
  approvalCount: number
  live: LiveStatus
  contentCounts: { inDraft: number; publishedThisWeek: number }
}) {
  const systemsStatus =
    live.error ? 'offline' :
    live.loading ? 'syncing' :
    live.workflows.errors > 0 ? 'warning' : 'healthy'
  const systemsConfig = {
    healthy: { dot: 'bg-emerald-400', label: 'Healthy', text: 'text-emerald-400' },
    warning: { dot: 'bg-amber-400', label: `${live.workflows.errors} errors`, text: 'text-amber-400' },
    offline: { dot: 'bg-red-400', label: 'Offline', text: 'text-red-400' },
    syncing: { dot: 'bg-blue-400 animate-pulse', label: 'Syncing', text: 'text-blue-400' },
  }[systemsStatus]

  const tiles: PulseTile[] = [
    {
      key: 'plans',
      icon: <Target size={12} className="text-violet-400" />,
      label: 'Active Plans',
      value: planCount === null ? '—' : String(planCount),
      sub: planCount !== null && planCount > 0
        ? `${planCount === 1 ? 'plan' : 'plans'} active`
        : 'no plans yet',
      tab: 'plans',
    },
    {
      key: 'today',
      icon: <CheckSquare size={12} className="text-amber-400" />,
      label: 'Today Queue',
      value: String(approvalCount),
      sub: approvalCount > 0
        ? `${approvalCount === 1 ? 'item' : 'items'} need you`
        : 'all clear',
      subClass: approvalCount > 0 ? 'text-amber-400' : 'text-white/40',
      tab: 'today',
    },
    {
      key: 'systems',
      icon: <Server size={12} className="text-emerald-400" />,
      label: 'Systems',
      value: live.loading ? '—' : `${live.workflows.active}/${live.workflows.total}`,
      sub: systemsConfig.label,
      subClass: systemsConfig.text,
      dot: systemsConfig.dot,
      tab: 'systems',
    },
    {
      key: 'workflows',
      icon: <WorkflowIcon size={12} className="text-blue-400" />,
      label: 'Workflows',
      value: live.loading ? '—' : String(live.workflows.running),
      sub: live.workflows.errors > 0 ? `${live.workflows.errors} errors` : 'running now',
      subClass: live.workflows.errors > 0 ? 'text-red-400' : 'text-white/40',
      tab: 'workflows',
    },
    {
      key: 'content',
      icon: <FileText size={12} className="text-rose-400" />,
      label: 'Content',
      value: String(contentCounts.inDraft),
      sub: contentCounts.publishedThisWeek > 0
        ? `${contentCounts.publishedThisWeek} shipped this week`
        : contentCounts.inDraft > 0
          ? `${contentCounts.inDraft === 1 ? 'piece' : 'pieces'} in draft`
          : 'none in draft',
      subClass: contentCounts.publishedThisWeek > 0 ? 'text-emerald-400' : 'text-white/40',
      tab: 'plans',
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 h-5">
        <ActivityIcon size={13} className="text-white/40" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Pulse</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map(t => (
          <button
            key={t.key}
            onClick={() => onNavigate?.(t.tab)}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors px-4 py-3 text-left group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {t.icon}
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold">{t.label}</span>
              </div>
              <ChevronRight size={12} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-[20px] font-semibold text-white tabular-nums leading-none">{t.value}</span>
              {t.dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot} flex-shrink-0`} />}
            </div>
            <p className={`text-[11px] mt-1 ${t.subClass ?? 'text-white/40'}`}>{t.sub}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Content Engine bucket counts for the PulseStrip tile. Keyed off
 *  `workstream='content'` — the canonical tag. Two buckets:
 *    - inDraft: not yet shipped (status in active/in_progress/waiting)
 *    - publishedThisWeek: status='done' AND completed_at >= start of week
 *  Blocked content tasks are intentionally excluded — they surface in the
 *  Blocked panel already. */
function computeContentCounts(tasks: any[]): { inDraft: number; publishedThisWeek: number } {
  const startOfWeek = new Date()
  const day = startOfWeek.getDay() // 0=Sun..6=Sat
  const daysFromMonday = (day + 6) % 7
  startOfWeek.setDate(startOfWeek.getDate() - daysFromMonday)
  startOfWeek.setHours(0, 0, 0, 0)
  const weekStartMs = startOfWeek.getTime()

  let inDraft = 0
  let publishedThisWeek = 0
  for (const t of tasks) {
    if (t.workstream !== 'content') continue
    if (t.status === 'done') {
      const c = t.completed_at ? new Date(t.completed_at).getTime() : 0
      if (c >= weekStartMs) publishedThisWeek += 1
    } else if (t.status === 'active' || t.status === 'in_progress' || t.status === 'waiting') {
      inDraft += 1
    }
  }
  return { inDraft, publishedThisWeek }
}

/** Rank tasks awaiting Krish's approval. Top 6 by priority_override, then
 *  priority weight, then oldest-updated first (stale items rise). */
function rankWaiting(tasks: any[]): any[] {
  const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 }
  return [...tasks].sort((a, b) => {
    const ao = a.priority_override ?? 0
    const bo = b.priority_override ?? 0
    if (ao !== bo) return bo - ao
    const ap = priorityWeight[a.priority || ''] ?? 0
    const bp = priorityWeight[b.priority || ''] ?? 0
    if (ap !== bp) return bp - ap
    const au = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return au - bu
  }).slice(0, 6)
}

function NeedsYouList({ tasks, onNavigate }: { tasks: any[]; onNavigate?: NavigateFn }) {
  const ranked = useMemo(() => rankWaiting(tasks), [tasks])
  const total = tasks.length

  if (total === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between h-5">
        <div className="flex items-center gap-2">
          <Inbox size={13} className="text-amber-400" />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Needs You</h2>
          <span className="text-[11px] text-amber-300/80 tabular-nums font-semibold">{total}</span>
        </div>
        <button
          onClick={() => onNavigate?.('today')}
          className="flex items-center gap-1 text-[11px] text-amber-300/60 hover:text-amber-200 transition-colors"
        >
          Open Today
          <ArrowUpRight size={11} />
        </button>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] divide-y divide-white/[0.04]">
        {ranked.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onNavigate?.('today', { task: t.id })}
            className="w-full text-left px-4 py-3 hover:bg-amber-500/[0.06] transition-colors flex items-start gap-3"
          >
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-white/90 leading-snug truncate">{t.title}</p>
              {t.next_step && (
                <p className="text-[11px] text-white/45 leading-snug mt-0.5 line-clamp-1">{t.next_step}</p>
              )}
            </div>
            <span className="text-[10px] text-white/30 tabular-nums flex-shrink-0">
              {t.updated_at && formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
            </span>
          </button>
        ))}
        {total > ranked.length && (
          <div className="px-4 py-2 text-[11px] text-amber-300/50 text-center">
            +{total - ranked.length} more in Today
          </div>
        )}
      </div>
    </div>
  )
}

function BlockedList({ tasks, onNavigate }: { tasks: any[]; onNavigate?: NavigateFn }) {
  const ranked = useMemo(() => {
    return [...tasks]
      .sort((a, b) => {
        const au = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return au - bu // oldest first — longest-blocked surface higher
      })
      .slice(0, 6)
  }, [tasks])
  const total = tasks.length

  if (total === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 h-5">
        <Ban size={13} className="text-white/40" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Blocked</h2>
        <span className="text-[11px] text-white/40 tabular-nums">{total}</span>
        <span className="text-[10px] text-white/30 ml-2">investigate, not approve</span>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] divide-y divide-white/[0.04]">
        {ranked.map(t => {
          const days = t.updated_at
            ? Math.max(0, Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 86_400_000))
            : null
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate?.('today', { task: t.id })}
              className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-start gap-3"
            >
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-rose-400/70 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white/85 leading-snug truncate">{t.title}</p>
                {t.blocked_by && (
                  <p className="text-[11px] text-white/45 leading-snug mt-0.5 line-clamp-1">
                    <span className="text-white/30">blocked by</span> {t.blocked_by}
                  </p>
                )}
              </div>
              {days !== null && (
                <span className="text-[10px] text-white/30 tabular-nums flex-shrink-0">
                  {days === 0 ? 'today' : `${days}d`}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ActivityTail({ events }: { events: AuditEvent[] }) {
  const visible = events.filter(hasRenderableMessage).slice(0, 15)
  const top = visible[0]

  return (
    <details className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden group mb-2">
      <summary className="cursor-pointer px-4 py-2.5 flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden hover:bg-white/[0.02] transition-colors">
        <ChevronRight size={12} className="text-white/30 transition-transform group-open:rotate-90 flex-shrink-0" />
        <ActivityIcon size={12} className="text-blue-400 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/45 font-semibold">Activity</span>
        <span className="text-[11px] text-white/35 tabular-nums">{visible.length}</span>
        {top && (
          <span className="ml-auto text-[11px] text-white/40 truncate hidden md:block">
            <span className="text-white/60">{humanize(top.actor) || 'System'}</span>{' '}
            <span className="text-white/30">· {formatDistanceToNow(new Date(top.created_at), { addSuffix: true })}</span>
          </span>
        )}
      </summary>
      <div className="border-t border-white/[0.04] divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
        {visible.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[12px] text-white/40">Quiet. Activity will appear here in real time.</p>
          </div>
        ) : (
          visible.map(ev => <ActivityRow key={ev.id} event={ev} />)
        )}
      </div>
    </details>
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
