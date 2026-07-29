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
import { MomentumStrip } from '../MomentumStrip'
import { RoomPreviews } from '../RoomPreviews'
import { BetsStrip } from '../home/BetsStrip'
import { CalibrationCard } from '../home/CalibrationCard'
import { ObjectivesPanel } from '../objectives/ObjectivesPanel'
import { DailyDriver } from '../focus/DailyDriver'
import { GlanceHeader } from '../home/GlanceHeader'
import { DecisionsInbox } from '../home/DecisionsInbox'
import { PulseGroup } from '../home/PulseGroup'
import { AltitudeSpine } from '../home/AltitudeSpine'
import { BoardDaily } from '../home/BoardDaily'
import { GrowthScoreboard } from '../home/GrowthScoreboard'
import { isGrowthScoreboardEnabled } from '../../hooks/useGrowthMetrics'
import { needsKrish } from '../../lib/taskQueue'
import { isSimplifiedIA } from '../../lib/iaV3'
import { isHomeV2Enabled, isFocusRitualEnabled } from '../../lib/homeV2'
import { ShipLedgerCard } from '../pilot/ShipLedgerCard'
import { DueTestsCard } from '../pilot/DueTestsCard'

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
 * Mission Control. The CEO opens this once a day; within five seconds they
 * should know: "is the money up, what are my three plays today, and what are
 * my decisions." Everything that merely informs lives behind an explicit
 * ambient fold.
 *
 * Above the fold (the action loop): CriticalAlertBanner, GlanceHeader,
 * MrrTicker, ObjectivesPanel, DailyDriver, DecisionsInbox.
 * Behind the fold (PulseGroup, collapsed): RoomPreviews, CalibrationCard,
 * BetsStrip, MomentumStrip, StreakPills, OsHealthStrip, OsMissionHero +
 * WeeklyGoals, the Friday retro, ActivityTail. Nothing in there asks
 * anything of you.
 */
export function DesktopHome({ onNavigate, deepTask = null, deepDecision = null }: {
  onNavigate?: NavigateFn
  /** Legacy #/today deep links, forwarded by the simplified-IA alias layer. */
  deepTask?: string | null
  deepDecision?: string | null
} = {}) {
  const v2 = isHomeV2Enabled()
  const { intel } = useHomeIntelligence()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [goalsData, setGoalsData] = useState<GoalsData | null>(null)
  const { tasks: waitingRaw } = useRealtimeTasks({ statusIn: ['waiting'] })
  // The shared queue rule (unreviewed, unburied, not deferred to a future
  // date) so the strip's Today tile and the ruling queue can never disagree.
  const waiting = useMemo(
    () => waitingRaw.filter(t => !t.buried_at && needsKrish(t)),
    [waitingRaw],
  )
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

  // ── Focus Ritual: unified spine + read-only board. Deciding (pick the 3, shape
  // the week, ratify objectives) lives in the ritual mounted at App level; Home
  // only tracks, surfaces what's waiting, and keeps the context below the fold.
  if (isFocusRitualEnabled()) {
    return (
      <div className="flex flex-col gap-4 max-w-[1280px] mx-auto w-full">
        <CriticalAlertBanner />
        {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
        <ShipLedgerCard variant="desktop" />
        <DueTestsCard variant="desktop" />

        {/* SPINE — portfolio / week / today + one button to set what's stale. */}
        <AltitudeSpine variant="desktop" onNavigate={onNavigate} />

        {/* GROWTH SCOREBOARD — the three engines: content subs / app subs / network. */}
        {isGrowthScoreboardEnabled() && <GrowthScoreboard variant="desktop" />}

        {/* THE DAY — track and close; the picker lives in the ritual. */}
        <BoardDaily />

        <DecisionsInbox onNavigate={onNavigate} deepTask={deepTask} deepDecision={deepDecision} />

        {/* THE AMBIENT ROOM: context that informs but never asks. Collapsed
            behind an explicit fold so the action loop above owns the screen. */}
        <PulseGroup>
          <RoomPreviews onNavigate={onNavigate} variant="desktop" />

          {/* GRADER: one-time calibration prompt; hides once all domains are fitted. */}
          <CalibrationCard />

          {/* BETS: compact strip replacing the standalone Bets tab. */}
          <BetsStrip />

          <MomentumStrip
            momentum={intel.momentum}
            generatedAt={intel.momentum_at ?? intel.generated_at}
            variant="desktop"
          />

          <StreakPills variant="desktop" />

          <OsHealthStrip onNavigate={onNavigate} approvalCount={waiting.length} live={live} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
            <OsMissionHero
              northStar={goalsData?.north_star}
              teamFocus={goalsData?.team_focus}
              weekOf={goalsData?.week_of}
              recommendedFocus={recommendedFocus}
              onSaveFocus={handleSaveFocus}
            />
            <WeeklyGoals variant="compact" onDataLoaded={setGoalsData} />
          </div>

          <DailyBriefBanner blocking={false} variant="desktop" retroOnly />

          <ActivityTail events={events} />
        </PulseGroup>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-w-[1280px] mx-auto w-full">

      <CriticalAlertBanner />
      {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
      <ShipLedgerCard variant="desktop" />
      <DueTestsCard variant="desktop" />

      <div className="flex items-center justify-end text-[10px] text-white/30 -mb-2 gap-3">
        <span><kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-white/55">⌘K</kbd> nav</span>
        <span><kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-white/55">⌘I</kbd> capture</span>
      </div>

      {/* GLANCE — money / today / waiting in one strip (HomeV2). */}
      {v2 && <GlanceHeader variant="desktop" onNavigate={onNavigate} />}

      {/* MONEY MACHINE — the only number that matters. */}
      <MrrTicker variant="desktop" />

      {/* GROWTH SCOREBOARD — the three engines: content subs / app subs / network. */}
      {isGrowthScoreboardEnabled() && <GrowthScoreboard variant="desktop" />}

      {/* OBJECTIVE LAYER: Krish's multi-week unlocks. The week sits structurally
          above the day, so the daily spine below ladders up to it. */}
      <ObjectivesPanel variant="desktop" />

      {/* DAILY SPINE — one journey: frame the day, lock 3, track, close.
          Replaces the old NextAction / carry-over / bar / calibrator / top-three
          pile-up with a single phase-driven orchestrator. */}
      <div id="daily-driver" className="scroll-mt-4">
        <DailyDriver />
      </div>

      {/* ACTION INBOX — what's waiting on you, acted on in one tap (HomeV2).
          Under the simplified IA it renders unconditionally: Today is gone, so
          Home must always carry the ruling queue regardless of the home flags. */}
      {(v2 || isSimplifiedIA()) && <DecisionsInbox onNavigate={onNavigate} deepTask={deepTask} deepDecision={deepDecision} />}

      {/* THE AMBIENT ROOM: everything below informs but never asks. Collapsed
          behind an explicit fold so the action loop above owns the screen. */}
      <PulseGroup>
        {/* ROOM PREVIEWS: Content / Visibility / Leads. Two items per room,
            one tap into the right detail. Replaces PipelineLanes. */}
        <RoomPreviews onNavigate={onNavigate} variant="desktop" />

        {/* GRADER: one-time calibration prompt; hides once all domains are fitted. */}
        <CalibrationCard />

        {/* BETS: compact strip replacing the standalone Bets tab. */}
        <BetsStrip />

        {/* MOMENTUM: 7-day pulse across MRR / leads / shipped / visibility. */}
        <MomentumStrip
          momentum={intel.momentum}
          generatedAt={intel.momentum_at ?? intel.generated_at}
          variant="desktop"
        />

        <StreakPills variant="desktop" />

        <OsHealthStrip
          onNavigate={onNavigate}
          approvalCount={waiting.length}
          live={live}
        />

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

        {/* WEEKLY RETRO: retro-only. The brief now lives in the daily spine's
            ContextHeader, so this surface carries only the Friday retro. */}
        <DailyBriefBanner blocking={false} variant="desktop" retroOnly />

        <ActivityTail events={events} />
      </PulseGroup>
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
          <p className="text-[17px] md:text-[19px] font-serif text-white/88 leading-relaxed">
            {northStar}
          </p>
        ) : (
          <p className="text-[15px] font-serif text-white/30 italic">No north star set yet.</p>
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
