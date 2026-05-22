import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon, ArrowUpRight, ChevronRight,
  Pencil, Check, X, Compass, Inbox, Ban,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { useLiveStatus } from '../../hooks/useLiveStatus'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'
import { WeeklyGoals, type GoalsData } from '../WeeklyGoals'
import { PipelineLanes } from './PipelineLanes'
import { OsHealthStrip } from './OsHealthStrip'
import { MrrTicker } from '../MrrTicker'
import { DailyBriefBanner } from '../DailyBriefBanner'
import { StreakPills } from '../StreakPills'
import { DailyLockBanner } from '../DailyLockBanner'
import { CriticalAlertBanner } from '../CriticalAlertBanner'

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
    <div className="flex flex-col gap-4 max-w-[1280px] mx-auto w-full">

      <CriticalAlertBanner />
      <DailyLockBanner />
      <DailyBriefBanner />

      {/* MONEY MACHINE — the only number that matters. */}
      <MrrTicker variant="desktop" />
      <StreakPills variant="desktop" />

      {/* PIPELINES — primary surface. Answers "what's the state of my three
          pipelines and what should I do next" at a glance. */}
      <PipelineLanes onNavigate={onNavigate} />

      {/* NEEDS YOU + BLOCKED — side-by-side. Still prominent (blocking
          actions / investigation) but no longer hero. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NeedsYouList tasks={waiting} onNavigate={onNavigate} />
        <BlockedList tasks={blocked} onNavigate={onNavigate} />
      </div>

      {/* OS HEALTH — thin chrome strip. Plans · Today · Systems · Running · Errors. */}
      <OsHealthStrip
        onNavigate={onNavigate}
        planCount={planCount}
        approvalCount={approvalCount}
        live={live}
      />

      {/* ── Below the fold (compact context) ─────────────────────────────── */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        <OsMissionHero
          northStar={goalsData?.north_star}
          teamFocus={goalsData?.team_focus}
          weekOf={goalsData?.week_of}
          recommendedFocus={summary.recommended_focus}
          onSaveFocus={handleSaveFocus}
        />
        <WeeklyGoals
          variant="compact"
          onDataLoaded={setGoalsData}
        />
      </div>

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

/** Rank tasks awaiting Krish's approval. Top 4 by priority_override, then
 *  priority weight, then oldest-updated first (stale items rise). The lane
 *  cap dropped from 6 to 4 once Needs You moved into the side-by-side row
 *  beneath the pipeline lanes — the rest stay one click away in Today. */
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
  }).slice(0, 4)
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
      .slice(0, 4)
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
