import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow, isToday, isPast, parseISO } from 'date-fns'
import { ExternalLink, Archive, CalendarClock, ChevronRight, MoreHorizontal, ThumbsUp, Undo2 } from 'lucide-react'
import { useRealtimeTasks, TaskRow } from '../../hooks/useRealtimeTasks'
import { InlineActions } from '../InlineActions'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'
import { useToast } from '../shared/Toast'
import { BackburnerSection } from '../shared/BackburnerSection'
import { DecisionDetail } from '../DecisionDetail'
import { navigateDecision } from '../../lib/routeDecision'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'
import { Skeleton, SkeletonText } from '../shared/Skeleton'
import { AllClear } from '../shared/AllClear'

// Stale threshold for the Today auto-collapse. Tasks not touched for this many
// days, with no progress, hide behind a single "N stale items hidden" disclosure.
const STALE_DAYS = 14
const STALE_THRESHOLD_MS = STALE_DAYS * 24 * 60 * 60 * 1000

// Health-alert noise that Marcus's prompt sometimes collapses into the
// "Top blockers" string. We filter these patterns out client-side so they
// don't surface as actionable items. The Marcus prompt patch is the
// source-side fix; this is defence in depth.
const NOISE_TITLE_PATTERNS: RegExp[] = [
  /^\s*health alert:\s*0\s*down,\s*0\s*stale/i,
  /^\s*sync engine running every/i,
]

function isStaleNoProgress(t: TaskRow): boolean {
  if (t.started_at) return false
  if (!t.updated_at) return false
  const updated = new Date(t.updated_at).getTime()
  if (!Number.isFinite(updated)) return false
  if (Date.now() - updated < STALE_THRESHOLD_MS) return false
  return t.status === 'active' || t.status === 'waiting' || t.status === 'new'
}

function isNoiseTask(t: TaskRow): boolean {
  if (!t.title) return false
  return NOISE_TITLE_PATTERNS.some(re => re.test(t.title))
}

function isSupersededOrDone(t: TaskRow): boolean {
  return t.status === 'superseded' || t.status === 'done' || t.status === 'closed'
}

// The day queue mirrors the decisions_waiting task branch exactly: statuses an
// agent parks on Krish, not yet reviewed, not buried. Anything non-terminal
// outside that set is work the agents carry themselves (the ambient line).
const QUEUE_STATUSES = new Set(['waiting', 'in_progress', 'blocked', 'new'])

// A deferred task (future due_date) is off the plate until its date arrives,
// then re-enters here automatically (defer no longer sets krish_reviewed).
function deferredToLater(t: TaskRow): boolean {
  if (!t.due_date) return false
  const startOfTomorrow = new Date(); startOfTomorrow.setHours(24, 0, 0, 0)
  return new Date(t.due_date).getTime() >= startOfTomorrow.getTime()
}

function needsKrish(t: TaskRow): boolean {
  return QUEUE_STATUSES.has(t.status) && !t.krish_reviewed && !deferredToLater(t)
}

function isDueNow(t: TaskRow): boolean {
  if (!t.due_date) return false
  const d = parseISO(t.due_date)
  return isToday(d) || isPast(d)
}

// Coarse sitting math, same spirit as minutesToZero in decisionKinds: a task
// ruling runs well under a minute; floor of 1 so a non-empty queue never
// claims zero minutes.
function minutesLeft(remaining: number): number {
  return Math.max(1, Math.round(remaining * 0.75))
}

function deferDateISO(choice: 'tomorrow' | 'monday' | 'next_week'): string {
  const d = new Date()
  if (choice === 'tomorrow') d.setDate(d.getDate() + 1)
  else if (choice === 'monday') d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7))
  else d.setDate(d.getDate() + 7)
  return d.toISOString()
}

const DEFER_CHOICES: Array<{ key: 'tomorrow' | 'monday' | 'next_week'; label: string }> = [
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'monday', label: 'Monday' },
  { key: 'next_week', label: 'Next week' },
]

function waitingDaysLabel(iso?: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (!Number.isFinite(days) || days < 0) return ''
  return days === 0 ? 'waiting since today' : `waiting ${days}d`
}

interface Props {
  selectedTaskId?: string | null
  onSelectTask?: (id: string | null) => void
  lane?: string | null
  onClearLane?: () => void
  decision?: string | null
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  onClearDecision?: () => void
}

function matchesLane(t: TaskRow, lane: string | null): boolean {
  if (!lane) return true
  const agent = (t.agent || '').toLowerCase()
  const workstream = (t.workstream || '').toLowerCase()
  if (lane === 'content') return agent === 'cleo' || workstream === 'content'
  if (lane === 'visibility') return agent === 'nova' || workstream === 'visibility'
  if (lane === 'leads') return agent === 'felix' || agent === 'maya' || workstream === 'leads'
  return true
}

export function DesktopToday({
  selectedTaskId,
  onSelectTask,
  lane = null,
  onClearLane,
  decision = null,
  onNavigate,
  onClearDecision,
}: Props = {}) {
  // Legacy URL guard: `#/today?decision=<kind>:<id>` should redirect non-task kinds
  // to their canonical tab (idea→content, guest/visibility→guests, lead→leads).
  // Tasks continue to use the inline DecisionDetail split-pane.
  useEffect(() => {
    if (!decision) return
    const [kind, ...rest] = decision.split(':')
    const id = rest.join(':')
    if (!kind || !id) return
    if (kind === 'task') return
    if (kind === 'idea' || kind === 'guest' || kind === 'visibility' || kind === 'lead') {
      onClearDecision?.()
      navigateDecision(onNavigate, kind, id)
    }
  }, [decision, onClearDecision, onNavigate])

  const { tasks: allTasks, loading, refresh } = useRealtimeTasks()
  const { toast } = useToast()
  const tasks = useMemo(
    () => (lane ? allTasks.filter(t => matchesLane(t, lane)) : allTasks),
    [allTasks, lane],
  )
  // Fallback to local state when the URL hasn't specified a task yet; preserves
  // the prior "first item auto-selected" behavior for direct visits to /today.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlControlled = selectedTaskId !== undefined
  const selectedId = urlControlled ? (selectedTaskId ?? null) : localSelectedId

  const selectTask = (id: string | null) => {
    if (urlControlled) onSelectTask?.(id)
    else setLocalSelectedId(id)
  }

  // Session ledger of rulings: drives optimistic removal (the shared realtime
  // cache has no optimistic updates, so without this a decided row lingers
  // until the refetch lands and a double-tap re-fires the verb) and the
  // "N of M decided" numerator (a Set cannot double-count one task).
  const [committed, setCommitted] = useState<Set<string>>(() => new Set())
  const decided = committed.size
  const [verbBusyId, setVerbBusyId] = useState<string | null>(null)

  const today = useMemo(() => {
    // Pre-filter: hide superseded/done, hide noise patterns, defer stale items
    // to the collapsed bucket. The user complaint was that the Today list
    // surfaced "Configure ListenNotes API…" (29 days untouched) and
    // "Health alert: 0 down, 0 stale" (Marcus noise). This fixes both.
    const visible: TaskRow[] = []
    const stale: TaskRow[] = []
    const buried: TaskRow[] = []
    for (const t of tasks) {
      if (isSupersededOrDone(t)) continue
      if (t.buried_at) { buried.push(t); continue }
      if (isNoiseTask(t)) continue
      if (isStaleNoProgress(t)) { stale.push(t); continue }
      visible.push(t)
    }

    // One queue, typed: everything an agent has parked on Krish. Overdue and
    // due-today rows lead (earliest first); the rest keep cache order
    // (updated_at desc). Everything else non-terminal is agent-carried.
    const queued = visible.filter(needsKrish).filter(t => !committed.has(t.id))
    const dueNow = queued
      .filter(isDueNow)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    const queue = [...dueNow, ...queued.filter(t => !isDueNow(t))]
    const carried = visible.filter(t => !needsKrish(t))
    return { queue, carried, stale, buried }
  }, [tasks, committed])

  const items: TaskRow[] = today.queue
  const selected = tasks.find(t => t.id === selectedId) || items[0] || null


  // After an action removes the selected item, advance to its neighbour so the
  // user can keep triaging without re-clicking the list.
  const selectNextAfter = (id: string) => {
    const idx = items.findIndex(t => t.id === id)
    const next = items[idx + 1] || items[idx - 1] || null
    selectTask(next && next.id !== id ? next.id : null)
  }

  const fireVerb = async (
    task: TaskRow,
    action: 'approve' | 'send_back' | 'defer',
    extra: Record<string, unknown> = {},
  ) => {
    if (verbBusyId) return
    setVerbBusyId(task.id)
    const agentName = task.agent || task.owner || 'system'
    try {
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, action, agent: agentName, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      toast(
        action === 'approve' ? 'Approved.'
          : action === 'send_back' ? `Sent back to ${agentName}.`
          : 'Deferred.',
        'success',
      )
      setCommitted(prev => { const n = new Set(prev); n.add(task.id); return n })
      selectNextAfter(task.id)
      refresh()
    } catch (err) {
      toast(`Could not save: ${err instanceof Error ? err.message : 'try again'}.`, 'error')
    } finally {
      setVerbBusyId(null)
    }
  }

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the grouped
  // list regroups into the 3 daily-target lanes via relevance_index (table
  // 'tasks'). One uniform row renderer feeds both the lanes and the muted set,
  // reusing DayRow and selectTask so a lane row selects the task in the detail
  // pane exactly like the normal list.
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderTaskRow = (t: TaskRow) => (
    <DayRow task={t} selected={selected?.id === t.id} onClick={() => selectTask(t.id)} />
  )

  // Desktop loads structure-first: the whole two-pane command surface appears
  // immediately and fills in, rather than a bare "Loading…" line. Breadth is the
  // point of a desk session, so we restore the list + detail architecture at once.
  if (loading && allTasks.length === 0) {
    const skList = (
      <div className="space-y-5 pr-2 animate-rise">
        <div className="space-y-2">
          <Skeleton h={26} w={120} r={8} />
          <Skeleton h={12} w="70%" r={5} />
        </div>
        <Skeleton h={84} r={16} />
        {[0, 1].map(g => (
          <div key={g} className="space-y-2.5">
            <Skeleton h={11} w={80} r={5} />
            {[0, 1, 2].map(i => <Skeleton key={i} h={62} r={12} />)}
          </div>
        ))}
      </div>
    )
    const skDetail = (
      <div className="h-full p-6 space-y-4 animate-rise">
        <Skeleton h={20} w="55%" r={6} />
        <SkeletonText lines={3} />
        <Skeleton h={140} r={14} />
        <Skeleton h={44} w={160} r={12} />
      </div>
    )
    return <SplitPane left={skList} right={skDetail} hasSelection={false} onBack={() => {}} />
  }

  const list = (
    <div className="space-y-4 pr-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Today</h1>
          <p className="text-xs md:text-[13px] text-white/50 mt-0.5">Every ruling the agents are waiting on, in one queue. New inbound proposals live in Triage.</p>
        </div>
        {isFocusModeEnabled() && calibrated && (
          <FocusModeToggle mode={mode} onChange={setMode} />
        )}
      </div>
      {lane && (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-400/20 rounded-lg text-sm">
          <span className="text-violet-200">Filtered to {lane}</span>
          <button
            onClick={() => onClearLane?.()}
            className="ml-auto text-white/60 hover:text-white text-xs"
          >
            Show all
          </button>
        </div>
      )}
      {showFocus ? (
        <FocusLanes
          rows={items}
          table="tasks"
          keyOf={t => String(t.id)}
          renderItem={renderTaskRow}
          fallback={null}
          mutedLabel="Off focus"
        />
      ) : (
        <>
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">The day</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/25 bg-white/[0.03]">{items.length}</span>
                </div>
                <span className="text-[11px] text-white/40 tabular-nums">
                  {decided} of {items.length + decided} decided · about {minutesLeft(items.length)} min left
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map(t => (
                  <QueueRow
                    key={t.id}
                    task={t}
                    selected={selected?.id === t.id}
                    busy={verbBusyId === t.id}
                    onClick={() => selectTask(t.id)}
                    onVerb={(action, extra) => fireVerb(t, action, extra)}
                  />
                ))}
              </div>
            </div>
          )}

          {today.carried.length > 0 && (
            <p className="text-[12px] text-white/40 px-1">
              Agents are carrying {today.carried.length} {today.carried.length === 1 ? 'task' : 'tasks'} themselves; none need you.
            </p>
          )}

          {today.stale.length > 0 && (
            <StaleDisclosure tasks={today.stale} onSelectTask={selectTask} selectedId={selected?.id || null} />
          )}

          <BackburnerSection
            table="tasks"
            items={today.buried.map(t => ({ id: t.id, title: t.title, buried_reason: t.buried_reason }))}
          />

          {items.length === 0 && !loading && (
            <AllClear
              title="The day is decided."
              sub="Nothing is waiting on your ruling. Agents keep working in the background and new asks land here as they raise them."
              nextHint={{ label: 'Review pipeline', onClick: () => onNavigate?.('leads') }}
            />
          )}
        </>
      )}
    </div>
  )

  const detail = decision
    ? <DecisionDetail key={decision} decision={decision} onClose={onClearDecision} actionsEnabled />
    : selected
      ? <TodayDetail key={selected.id} task={selected} onActioned={() => selectNextAfter(selected.id)} />
      : <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an item from your day</div>

  const onBack = () => {
    if (decision) onClearDecision?.()
    else selectTask(null)
  }

  return <SplitPane left={list} right={detail} hasSelection={!!selectedId || !!decision} onBack={onBack} />
}

// One row of the day queue: receipts (agent, waiting-days, lever score) plus
// exactly three verbs. The row itself selects the task in the detail pane;
// verbs stopPropagation so ruling never also re-selects.
function QueueRow({ task, selected, busy, onClick, onVerb }: {
  task: TaskRow
  selected: boolean
  busy: boolean
  onClick: () => void
  onVerb: (action: 'approve' | 'send_back' | 'defer', extra?: Record<string, unknown>) => void
}) {
  const [panel, setPanel] = useState<null | 'send_back' | 'defer'>(null)
  const [note, setNote] = useState('')
  const agentName = task.agent || task.owner || 'system'
  const waiting = waitingDaysLabel(task.updated_at)
  const verbCls = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onClick() }}
      className={`w-full text-left rounded-lg border p-3 transition-all cursor-pointer ${
        selected
          ? 'border-violet-500/40 bg-violet-500/[0.06]'
          : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-start gap-2">
        <AgentAvatar agent={agentName} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <p className="text-[13px] text-white font-medium leading-snug truncate">{task.title}</p>
            {isDueNow(task) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium uppercase tracking-wide flex-shrink-0">Due</span>}
          </div>
          {task.next_step && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-1">{task.next_step}</p>}
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/40">
            <span className="text-white/55 capitalize">{agentName}</span>
            {waiting && <span>· {waiting}</span>}
            {task.lever_score != null && <span>· lever {task.lever_score}/10</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => onVerb('approve')}
              disabled={busy}
              className={`${verbCls} border-violet-500/25 text-violet-300 hover:bg-violet-500/10`}
            >
              <ThumbsUp size={11} />
              Approve
            </button>
            <div className="relative">
              <button
                onClick={() => setPanel(p => (p === 'send_back' ? null : 'send_back'))}
                disabled={busy}
                className={`${verbCls} border-amber-500/25 text-amber-300 hover:bg-amber-500/10`}
              >
                <Undo2 size={11} />
                Send back
              </button>
              {panel === 'send_back' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPanel(null)} />
                  <div className="absolute left-0 top-full mt-1 z-40 w-72 rounded-lg border border-white/10 bg-base shadow-xl p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-white/35">Send back to {agentName} with a note</p>
                    <textarea
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder={`Tell ${agentName} what to change...`}
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-2 text-[12px] text-white/80 focus:outline-none focus:border-violet-500/40 placeholder-white/20"
                    />
                    <button
                      disabled={busy || !note.trim()}
                      onClick={() => { onVerb('send_back', { notes: note.trim() }); setPanel(null); setNote('') }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      Send back
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setPanel(p => (p === 'defer' ? null : 'defer'))}
                disabled={busy}
                className={`${verbCls} border-white/10 text-white/60 hover:bg-white/[0.06]`}
              >
                <CalendarClock size={11} />
                Defer
              </button>
              {panel === 'defer' && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPanel(null)} />
                  <div className="absolute left-0 top-full mt-1 z-40 w-40 rounded-lg border border-white/10 bg-base shadow-xl py-1">
                    {DEFER_CHOICES.map(c => (
                      <button
                        key={c.key}
                        disabled={busy}
                        onClick={() => { onVerb('defer', { due_date: deferDateISO(c.key) }); setPanel(null) }}
                        className="w-full text-left px-3 py-2 text-[12px] text-white/75 hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DayRow({ task, selected, onClick }: { task: TaskRow; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? 'border-violet-500/40 bg-violet-500/[0.06]'
          : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-start gap-2">
        <AgentAvatar agent={task.agent || task.owner || 'system'} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <p className="text-[13px] text-white font-medium leading-snug truncate">{task.title}</p>
            {!task.weekly_goal_id && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium uppercase tracking-wide flex-shrink-0">Drift</span>}
          </div>
          {task.next_step && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-1">{task.next_step}</p>}
        </div>
      </div>
    </button>
  )
}

function StaleDisclosure({
  tasks, onSelectTask, selectedId,
}: {
  tasks: TaskRow[]
  onSelectTask: (id: string | null) => void
  selectedId: string | null
}) {
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  const bulk = async (action: 'dismiss_superseded' | 'snooze_30d', failMsg: string, okMsg: (n: number) => string) => {
    const ids = tasks.map(t => t.id)
    try {
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, notes: `Bulk: ${ids.length} stale (>${STALE_DAYS}d) items` }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      toast(okMsg(ids.length), 'success')
    } catch {
      toast(failMsg, 'error')
    }
  }

  const dismissAll = () => bulk('dismiss_superseded', 'Could not bulk-dismiss. Try again.', n => `Dismissed ${n} stale items.`)
  // Inline snooze replaces what KillListModal used to ask weekly. Push due_date
  // out 30 days so the items fall off Today without losing their work history.
  const snoozeAll = () => bulk('snooze_30d', 'Could not snooze. Try again.', n => `Snoozed ${n} for 30 days.`)

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <ChevronRight
          size={11}
          className={`text-white/40 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Archive size={11} className="text-white/35" />
        <span className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.14em]">
          Stale ({tasks.length})
        </span>
        <span className="text-[10px] text-white/35 ml-1">no progress in {STALE_DAYS}+ days</span>
        {open && (
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); snoozeAll() }}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/10 text-white/55 hover:bg-white/[0.06] transition-colors"
            >
              Snooze 30d
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dismissAll() }}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-rose-500/20 text-rose-300 hover:bg-rose-500/10 transition-colors"
            >
              Dismiss all
            </button>
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
          {tasks.slice(0, 30).map(t => (
            <DayRow
              key={t.id}
              task={t}
              selected={selectedId === t.id}
              onClick={() => onSelectTask(t.id)}
            />
          ))}
          {tasks.length > 30 && (
            <div className="px-3 py-2 text-[10px] text-white/35 text-center">
              +{tasks.length - 30} more (collapse or open Plans for full triage)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TodayDetail({ task, onActioned }: { task: TaskRow; onActioned?: () => void }) {
  const { toast } = useToast()
  const [notes, setNotes] = useState(task.krish_notes || '')
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const agentName = task.agent || task.owner || 'system'

  const post = async (
    action: string,
    extra: Record<string, any> = {},
    opts: { advance?: boolean; success?: string } = {},
  ) => {
    if (busy) return
    setBusy(true)
    setMoreOpen(false)
    try {
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, action, agent: agentName, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      if (opts.success) toast(opts.success, 'success')
      if (opts.advance) onActioned?.()
    } catch (err) {
      toast(`Could not save: ${err instanceof Error ? err.message : 'try again'}.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveNotes = () => {
    if (notes === (task.krish_notes || '')) return
    post('note', { notes })
  }

  const moreItems: Array<{ label: string; danger?: boolean; run: () => void }> = [
    { label: 'Mark Done', run: () => post('done', {}, { advance: true, success: 'Marked done.' }) },
    { label: 'Needs Revision', run: () => post('revision', { notes: notes || 'Needs revision' }, { success: 'Revision requested.' }) },
    { label: 'Add to Tomorrow', run: () => post('push_tomorrow', {}, { advance: true, success: 'Moved to tomorrow.' }) },
    { label: 'Dismiss as superseded', danger: true, run: () => post('dismiss_superseded', {}, { advance: true, success: 'Dismissed as superseded.' }) },
  ]

  const hasWhy = !!(task.description || task.evidence || task.lever_score != null || task.tier || task.workstream)

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white leading-tight tracking-tight">{task.title}</h1>
        <div className="flex items-center gap-2 mt-2 text-[11px] text-white/45">
          <AgentAvatar agent={agentName} size="sm" />
          <span className="text-white/70">{agentName}</span>
          {task.updated_at && <span>· {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>}
        </div>
      </div>

      {hasWhy && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-white/35">Why {agentName} flagged this</p>
          {task.description && (
            <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}
          {task.evidence && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Evidence</p>
              <p className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap">{task.evidence}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.lever_score != null && <WhyChip label={`Lever ${task.lever_score}/10`} />}
            {task.tier && <WhyChip label={`Tier ${task.tier}`} />}
            {task.workstream && <WhyChip label={String(task.workstream)} />}
            {task.priority && <WhyChip label={String(task.priority)} />}
          </div>
          {task.link_secondary && (
            <a href={task.link_secondary} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-violet-300 hover:text-violet-200">
              <ExternalLink size={12} />
              Source
            </a>
          )}
        </div>
      )}

      {task.next_step && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Next Step</p>
          <p className="text-[13px] text-white/75 leading-relaxed">{task.next_step}</p>
        </div>
      )}

      {task.link_primary && (
        <a href={task.link_primary} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] text-violet-300 hover:bg-violet-500/10 text-[13px] font-medium transition-colors w-fit">
          <ExternalLink size={14} />
          Open Document
        </a>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Your Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Thoughts, decisions, context..."
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-violet-500/40 placeholder-white/20"
        />
      </div>

      <div className="flex items-center gap-2">
        <InlineActions taskId={task.id} currentStatus={task.status} agent={agentName} onSuccess={onActioned} />
        <div className="relative">
          <button
            onClick={() => setMoreOpen(o => !o)}
            disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] text-[11px] font-medium disabled:opacity-40"
          >
            <MoreHorizontal size={11} />
            More
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
              <div className="absolute left-0 bottom-full mb-1 z-40 w-52 rounded-lg border border-white/10 bg-base shadow-xl py-1">
                {moreItems.map(item => (
                  <button
                    key={item.label}
                    onClick={item.run}
                    disabled={busy}
                    className={`w-full text-left px-3 py-2 text-[12px] disabled:opacity-40 hover:bg-white/[0.06] ${
                      item.danger ? 'text-rose-300' : 'text-white/75'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function WhyChip({ label }: { label: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03] text-white/55 capitalize">
      {label}
    </span>
  )
}
