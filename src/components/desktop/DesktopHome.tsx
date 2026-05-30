import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon, ChevronRight,
  Pencil, Check, X, Compass,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useLiveStatus } from '../../hooks/useLiveStatus'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'
import { WeeklyGoals, type GoalsData } from '../WeeklyGoals'
import { OsHealthStrip } from './OsHealthStrip'
import { MrrTicker } from '../MrrTicker'
import { DailyBriefBanner } from '../DailyBriefBanner'
import { StreakPills } from '../StreakPills'
import { CriticalAlertBanner } from '../CriticalAlertBanner'
import { DecisionsWaitingPanel } from '../DecisionsWaitingPanel'
import { TopThreeCards } from '../TopThreeCards'
import { FocusCalibrator } from '../focus/FocusCalibrator'
import { FocusBar } from '../focus/FocusBar'
import { CarryOverPrompt } from '../focus/CarryOverPrompt'
import { MomentumStrip } from '../MomentumStrip'
import { RoomPreviews } from '../RoomPreviews'
import { ObjectivesPanel } from '../objectives/ObjectivesPanel'
import { NextActionStrip } from '../shared/NextActionStrip'
import { Sparkles } from 'lucide-react'
import { navigateDecision } from '../../lib/routeDecision'

const API = import.meta.env.VITE_API_URL ?? ''

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

/**
 * Mission Control. The CEO opens this once a day — within five seconds they
 * should know: "is the money up, what are my three plays today, and what's
 * waiting on me." Everything else is one click below.
 *
 * Order is deliberate, top to bottom:
 *   1. CriticalAlertBanner — only renders when something is on fire.
 *   2. MrrTicker — the only number that matters, with 7-day sparkline.
 *   3. TopThreeCards — Marcus's three ranked plays (revenue / growth / risk).
 *   4. RoomPreviews — Content / Visibility / Leads, top 2 each, kind-routed.
 *   5. MomentumStrip — 7-day mini-bars across the four pulse metrics.
 *   6. DecisionsWaitingPanel — compact (limit=4), kind-routed.
 *   7. DailyBriefBanner — non-blocking. Retro is a collapsed card.
 *   8. StreakPills + OsHealthStrip — thin context chrome.
 * Below the fold: OsMissionHero + WeeklyGoals + ActivityTail.
 */
export function DesktopHome({ onNavigate }: { onNavigate?: NavigateFn } = {}) {
  const { intel } = useHomeIntelligence()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [goalsData, setGoalsData] = useState<GoalsData | null>(null)
  const { tasks: waiting } = useRealtimeTasks({ statusIn: ['waiting'] })
  const live = useLiveStatus(60_000)

  useEffect(() => {
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

  type HomeSummaryLike = { headline?: string; recommended_focus?: string }
  const summary: HomeSummaryLike = intel.summary ?? {}
  const recommendedFocus = summary.recommended_focus

  const handleSaveFocus = async (newFocus: string) => {
    await fetch(`${API}/api/goals`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_focus: newFocus }),
    })
    setGoalsData(prev => prev ? { ...prev, team_focus: newFocus } : prev)
  }

  return (
    <div className="flex flex-col gap-4 max-w-[1280px] mx-auto w-full">

      <CriticalAlertBanner />

      {/* NEXT ACTION — Marcus's #1 play, surfaced as a single one-tap CTA so
          the CEO doesn't have to scan the top-three to know what to do first. */}
      <NextActionStrip
        headline={intel.top_three.length}
        headlineLabel="plays"
        insight={intel.top_three[0]
          ? `${intel.top_three[0].title} — ${intel.top_three[0].why_now}`
          : summary.headline || 'Marcus is synthesizing. Check back after his next run.'}
        ctaLabel={intel.top_three[0]?.action_label || 'Open today'}
        onCta={() => {
          const top = intel.top_three[0]
          if (!top || !onNavigate) return
          if (top.action_target_id) navigateDecision(onNavigate, top.action_kind, top.action_target_id)
          else onNavigate('today')
        }}
        icon={Sparkles}
        accent="text-violet-300"
        disabled={!intel.top_three[0] && !onNavigate}
      />

      <div className="flex items-center justify-end text-[10px] text-white/30 -mb-2 gap-3">
        <span><kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-white/55">⌘K</kbd> nav</span>
        <span><kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-white/55">⌘I</kbd> capture</span>
      </div>

      {/* MONEY MACHINE — the only number that matters. */}
      <MrrTicker variant="desktop" />

      {/* DAILY FOCUS — calibrator / bar / carry-over (feature flag gated). */}
      <CarryOverPrompt />
      <FocusBar />
      <FocusCalibrator />

      {/* OBJECTIVE LAYER: Krish's multi-week unlocks (Phase 4, 2026-05-29).
          Renders above the tactical top-three so the deep-work commitment
          sits structurally above the day's tactical picks. Each tactical
          pick below now labels its parent objective when one applies. */}
      <ObjectivesPanel variant="desktop" />

      {/* TOP THREE — Marcus's ranked plays for today. */}
      <TopThreeCards
        cards={intel.top_three}
        onNavigate={onNavigate}
        variant="desktop"
        generatedAt={intel.top_three_at ?? intel.generated_at}
      />

      {/* ROOM PREVIEWS — Content / Visibility / Leads. Two items per room,
          one tap into the right detail. Replaces PipelineLanes. */}
      <RoomPreviews onNavigate={onNavigate} variant="desktop" />

      {/* MOMENTUM — 7-day pulse across MRR / leads / shipped / visibility. */}
      <MomentumStrip
        momentum={intel.momentum}
        generatedAt={intel.momentum_at ?? intel.generated_at}
        variant="desktop"
      />

      {/* DECISIONS WAITING — compact preview, kind-routed. */}

      {/* DAILY BRIEF — non-blocking. Retro is a collapsible card. */}
      <DailyBriefBanner blocking={false} variant="desktop" />

      <StreakPills variant="desktop" />

      <OsHealthStrip
        onNavigate={onNavigate}
        approvalCount={waiting.length}
        live={live}
      />

      {/* ── Below the fold (compact context) ─────────────────────────────── */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        <OsMissionHero
          northStar={goalsData?.north_star}
          teamFocus={goalsData?.team_focus}
          weekOf={goalsData?.week_of}
          recommendedFocus={recommendedFocus}
          onSaveFocus={handleSaveFocus}
        />
        <WeeklyGoals
          variant="compact"
          onDataLoaded={setGoalsData}
        />
      </div>

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
